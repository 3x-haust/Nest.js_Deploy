import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/user.entity';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() createProjectDto: CreateProjectDto, @GetUser() user: User) {
    return this.projectsService.create(createProjectDto, user);
  }

  @Get()
  findAll(@GetUser() user: User) {
    return this.projectsService.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.projectsService.findOne(id, user.id);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.projectsService.remove(id, user.id);
  }

  @Post(':id/settings')
  updateSettings(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      installCommand: string;
      outputDir: string;
      envVariables: Record<string, string>;
      port?: number;
      dbType?: 'none' | 'postgresql';
      useRedis?: boolean;
      useElasticsearch?: boolean;
    },
    @GetUser() user: User,
  ) {
    return this.projectsService.updateSettings(id, user.id, body);
  }

  @Post(':id/env')
  addEnvVariable(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { key: string; value: string; target: string },
    @GetUser() user: User,
  ) {
    return this.projectsService.addEnvVariable(id, user.id, body);
  }

  @Delete(':id/env/:envKey')
  deleteEnvVariable(
    @Param('id', ParseIntPipe) id: number,
    @Param('envKey') envKey: string,
    @GetUser() user: User,
  ) {
    return this.projectsService.deleteEnvVariable(id, user.id, envKey);
  }

  @Get(':id/settings')
  getSettings(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.projectsService.getSettings(id, user.id);
  }

  @Get(':id/members')
  getMembers(@Param('id', ParseIntPipe) id: number, @GetUser() user: User) {
    return this.projectsService.getMembers(id, user.id);
  }

  @Post(':id/members')
  inviteMember(
    @Param('id', ParseIntPipe) id: number,
    @Body('username') username: string,
    @GetUser() user: User,
  ) {
    return this.projectsService.inviteMember(id, user.id, username);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) targetUserId: number,
    @GetUser() user: User,
  ) {
    return this.projectsService.removeMember(id, user.id, targetUserId);
  }
}
