import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { User } from '../auth/user.entity';
import { Deployment } from '../deployments/deployment.entity';
import { DeploymentsService } from '../deployments/deployments.service';
import { ProjectMember, ProjectRole } from './project-member.entity';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(Deployment)
    private deploymentsRepository: Repository<Deployment>,
    @InjectRepository(ProjectMember)
    private projectMembersRepository: Repository<ProjectMember>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly deploymentsService: DeploymentsService,
  ) { }

  async create(
    createProjectDto: CreateProjectDto,
    user: User,
  ): Promise<Project> {
    const lastProject = await this.projectsRepository.createQueryBuilder('project')
      .where('project.port IS NOT NULL')
      .orderBy('project.port', 'DESC')
      .getOne();

    const port = lastProject ? lastProject.port + 1 : 30001;

    const project = this.projectsRepository.create({
      ...createProjectDto,
      user,
      userId: user.id,
      domain: createProjectDto.domain?.toLowerCase(),
      port,
    });
    const savedProject = await this.projectsRepository.save(project);

    const member = this.projectMembersRepository.create({
      projectId: savedProject.id,
      userId: user.id,
      role: ProjectRole.OWNER,
    });
    await this.projectMembersRepository.save(member);

    await this.deploymentsService.deploy(savedProject.id);

    return savedProject;
  }

  async findAll(userId: number): Promise<Project[]> {
    const memberRecords = await this.projectMembersRepository.find({
      where: { userId },
      relations: ['project'],
    });

    const projectIds = memberRecords.map(m => m.projectId);

    const projects = await this.projectsRepository.find({
      where: [
        { userId: userId },
        ...projectIds.map(id => ({ id }))
      ],
      relations: ['deployments'],
      order: { createdAt: 'DESC' },
    });

    const projectsWithDeployments = await Promise.all(
      projects.map(async (project) => {
        const lastDeployment = await this.deploymentsRepository.findOne({
          where: { projectId: project.id },
          order: { createdAt: 'DESC' },
        });
        return {
          ...project,
          lastDeployment,
        };
      }),
    );

    return projectsWithDeployments;
  }

  async findOne(id: number, userId: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id },
      relations: ['deployments', 'members', 'members.user'],
    });

    if (!project) {
      throw new NotFoundException(`Project with id ${id} not found`);
    }

    const membership = project.members?.find(m => m.userId === userId);
    const isLegacyOwner = project.userId === userId;

    if (!membership && !isLegacyOwner) {
      throw new ForbiddenException(`You don't have access to this project`);
    }

    return project;
  }

  async inviteMember(projectId: number, inviterId: number, username: string): Promise<ProjectMember> {
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const inviterMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId: inviterId, role: ProjectRole.OWNER },
    });

    const isLegacyOwner = project.userId === inviterId;

    if (!inviterMembership && !isLegacyOwner) {
      throw new ForbiddenException('Only owners can invite members');
    }

    const invitee = await this.usersRepository.findOne({ where: { username } });
    if (!invitee) {
      throw new NotFoundException(`User ${username} not found`);
    }

    const existingMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId: invitee.id },
    });

    if (existingMembership) {
      throw new BadRequestException('User is already a member of this project');
    }

    const newMember = this.projectMembersRepository.create({
      projectId,
      userId: invitee.id,
      role: ProjectRole.MEMBER,
    });

    return this.projectMembersRepository.save(newMember);
  }

  async removeMember(projectId: number, actorId: number, targetUserId: number): Promise<void> {
    const targetProject = await this.projectsRepository.findOne({ where: { id: projectId } });
    if (!targetProject) throw new NotFoundException('Project not found');

    const actorMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId: actorId },
    });

    const isLegacyOwner = targetProject.userId === actorId;

    if (!actorMembership && !isLegacyOwner) {
      throw new ForbiddenException('Access denied');
    }

    if (actorId !== targetUserId && (actorMembership?.role !== ProjectRole.OWNER && !isLegacyOwner)) {
      throw new ForbiddenException('Only owners can remove other members');
    }

    const targetMembership = await this.projectMembersRepository.findOne({
      where: { projectId, userId: targetUserId },
    });

    if (!targetMembership) {
      throw new NotFoundException('Member not found');
    }

    if (targetMembership.role === ProjectRole.OWNER) {
      const ownersCount = await this.projectMembersRepository.count({
        where: { projectId, role: ProjectRole.OWNER },
      });
      if (ownersCount <= 1) {
        throw new BadRequestException('Cannot remove the last owner of the project');
      }
    }

    await this.projectMembersRepository.remove(targetMembership);
  }

  async getMembers(projectId: number, userId: number): Promise<ProjectMember[]> {
    const project = await this.projectsRepository.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');

    const membership = await this.projectMembersRepository.findOne({
      where: { projectId, userId },
    });
    const isLegacyOwner = project.userId === userId;

    if (!membership && !isLegacyOwner) {
      throw new ForbiddenException('Access denied');
    }

    return this.projectMembersRepository.find({
      where: { projectId },
      relations: ['user'],
    });
  }

  async remove(id: number, userId: number): Promise<void> {
    const project = await this.findOne(id, userId);
    await this.projectsRepository.remove(project);
  }

  async updateSettings(
    projectId: number,
    userId: number,
    settings: {
      installCommand: string;
      outputDir: string;
      envVariables: Record<string, string>;
      port?: number;
      dbType?: 'none' | 'postgresql';
      useRedis?: boolean;
      useElasticsearch?: boolean;
    },
  ): Promise<Project> {
    const project = await this.findOne(projectId, userId);
    Object.assign(project, settings);
    return this.projectsRepository.save(project);
  }

  async addEnvVariable(
    projectId: number,
    userId: number,
    envVar: { key: string; value: string; target: string },
  ): Promise<Project> {
    const project = await this.findOne(projectId, userId);
    project.envVariables = {
      ...project.envVariables,
      [envVar.key]: envVar.value,
    };
    return this.projectsRepository.save(project);
  }

  async deleteEnvVariable(
    projectId: number,
    userId: number,
    envKey: string,
  ): Promise<Project> {
    const project = await this.findOne(projectId, userId);
    const remainingEnvVars = { ...project.envVariables };
    delete remainingEnvVars[envKey];
    project.envVariables = remainingEnvVars;
    return this.projectsRepository.save(project);
  }

  async getSettings(projectId: number, userId: number): Promise<Project> {
    return this.findOne(projectId, userId);
  }
}
