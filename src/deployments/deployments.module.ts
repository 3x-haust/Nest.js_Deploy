import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeploymentsService } from './deployments.service';
import { DeploymentsController } from './deployments.controller';
import { Deployment } from './deployment.entity';
import { Project } from '../projects/project.entity';
import { ProjectsModule } from '../projects/projects.module';
import { DeploymentsGateway } from './deployments.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Deployment, Project]),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [DeploymentsController],
  providers: [DeploymentsService, DeploymentsGateway],
  exports: [DeploymentsService],
})
export class DeploymentsModule {}
