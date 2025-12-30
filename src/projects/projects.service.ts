import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { User } from '../auth/user.entity';
import { Deployment } from '../deployments/deployment.entity';
import { DeploymentsService } from '../deployments/deployments.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private projectsRepository: Repository<Project>,
    @InjectRepository(Deployment)
    private deploymentsRepository: Repository<Deployment>,
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

    await this.deploymentsService.deploy(savedProject.id);

    return savedProject;
  }

  async findAll(userId: number): Promise<Project[]> {
    const projects = await this.projectsRepository.find({
      where: { userId },
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
      where: { id, userId },
      relations: ['deployments'],
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${id} not found`);
    }
    return project;
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
    const project = await this.projectsRepository.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }
    Object.assign(project, settings);
    return this.projectsRepository.save(project);
  }

  async addEnvVariable(
    projectId: number,
    userId: number,
    envVar: { key: string; value: string; target: string },
  ): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }
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
    const project = await this.projectsRepository.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }
    const remainingEnvVars = { ...project.envVariables };
    delete remainingEnvVars[envKey];
    project.envVariables = remainingEnvVars;
    return this.projectsRepository.save(project);
  }

  async getSettings(projectId: number, userId: number): Promise<Project> {
    const project = await this.projectsRepository.findOne({
      where: { id: projectId, userId },
    });
    if (!project) {
      throw new NotFoundException(`Project with id ${projectId} not found`);
    }
    return project;
  }
}
