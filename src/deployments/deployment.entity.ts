import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Project } from '../projects/project.entity';

export enum DeploymentStatus {
  QUEUED = 'queued',
  BUILDING = 'building',
  READY = 'ready',
  ERROR = 'error',
}

@Entity()
export class Deployment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: DeploymentStatus,
    default: DeploymentStatus.QUEUED,
  })
  status: DeploymentStatus;

  @Column()
  branch: string;

  @Column()
  commit: string;

  @Column({ nullable: true })
  commitMessage: string;

  @Column({ nullable: true })
  url: string;

  @Column({ nullable: true })
  duration: number;

  @Column({ type: 'text', nullable: true })
  buildLogs: string;

  @ManyToOne(() => Project, (project) => project.deployments, {
    onDelete: 'CASCADE',
  })
  project: Project;

  @Column()
  projectId: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
