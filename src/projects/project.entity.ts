import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Deployment } from '../deployments/deployment.entity';
import { ProjectMember } from './project-member.entity';

@Entity()
export class Project {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  repositoryFullName: string;

  @Column()
  repositoryUrl: string;

  @Column()
  defaultBranch: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  language: string;

  @Column({ nullable: true })
  framework: string;

  @Column({ nullable: true })
  installCommand: string;

  @Column({ nullable: true })
  outputDir: string;

  @Column({ type: 'json', nullable: true })
  envVariables: Record<string, string>;

  @ManyToOne(() => User, (user: User) => user.projects as Project[])
  user: User;

  @Column()
  userId: number;

  @Column({ nullable: true })
  domain: string;

  @Column({ nullable: true })
  port: number;

  @Column({ default: 'none' })
  dbType: 'none' | 'postgresql';

  @Column({ default: false })
  useRedis: boolean;

  @Column({ default: false })
  useElasticsearch: boolean;

  @OneToMany(() => Deployment, (deployment) => deployment.project)
  deployments: Deployment[];

  @OneToMany(() => ProjectMember, (member) => member.project)
  members: ProjectMember[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
