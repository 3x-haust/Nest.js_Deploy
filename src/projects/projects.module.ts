import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { Project } from './project.entity';
import { Deployment } from '../deployments/deployment.entity';
import { GithubService } from './github.service';
import { GithubController } from './github.controller';
import { User } from '../auth/user.entity';
import { DeploymentsModule } from '../deployments/deployments.module';
import { ProjectMember } from './project-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Deployment, User, ProjectMember]),
    forwardRef(() => DeploymentsModule),
  ],
  controllers: [ProjectsController, GithubController],
  providers: [ProjectsService, GithubService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
