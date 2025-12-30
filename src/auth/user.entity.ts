import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Project } from '../projects/project.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  githubId: string;

  @Column()
  username: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ default: false })
  allowed: boolean;

  @Column({ default: 'user' })
  role: 'admin' | 'user';

  @Column({ nullable: true })
  githubAccessToken: string;

  @OneToMany(() => Project, (project) => project.user)
  projects: Project[];
}
