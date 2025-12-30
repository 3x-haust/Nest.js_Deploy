import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { DeploymentsService } from './deployments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/user.entity';
import { ProjectsService } from '../projects/projects.service';

@Controller('projects/:projectId/deployments')
@UseGuards(JwtAuthGuard)
export class DeploymentsController {
  constructor(
    private readonly deploymentsService: DeploymentsService,
    private readonly projectsService: ProjectsService,
  ) {}

  @Post('redeploy')
  async redeploy(
    @Param('projectId', ParseIntPipe) projectId: number,
    @GetUser() user: User,
  ) {
    await this.projectsService.findOne(projectId, user.id);
    return this.deploymentsService.deploy(projectId);
  }

  @Post()
  async create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: { branch: string; commit: string; commitMessage: string },
    @GetUser() user: User,
  ) {
    await this.projectsService.findOne(projectId, user.id);
    return this.deploymentsService.create(
      projectId,
      body.branch,
      body.commit,
      body.commitMessage,
    );
  }

  @Get()
  async findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @GetUser() user: User,
  ) {
    await this.projectsService.findOne(projectId, user.id);
    return this.deploymentsService.findAll(projectId);
  }

  @Get(':id')
  async findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('id', ParseIntPipe) id: number,
    @GetUser() user: User,
  ) {
    await this.projectsService.findOne(projectId, user.id);
    return this.deploymentsService.findOne(id, projectId);
  }
}
