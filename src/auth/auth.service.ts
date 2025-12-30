import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from './user.entity';
import { Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  async validateGithubUser(profile: Profile, accessToken?: string) {
    const githubId: string = profile.id;
    const username: string =
      typeof profile.username === 'string' ? profile.username : '';
    const avatarUrl: string =
      Array.isArray(profile.photos) &&
      profile.photos.length > 0 &&
      typeof profile.photos[0].value === 'string'
        ? profile.photos[0].value
        : '';

    let user = await this.usersRepository.findOne({ where: { githubId } });
    if (!user) {
      const adminIds = (
        this.configService.get<string>('ADMIN_GITHUB_IDS') || ''
      )
        .split(',')
        .map((s) => s.trim());
      const isAdmin = adminIds.includes(username);
      user = this.usersRepository.create({
        githubId,
        username,
        avatarUrl,
        allowed: isAdmin,
        role: isAdmin ? 'admin' : 'user',
        githubAccessToken: accessToken || undefined,
      });
      await this.usersRepository.save(user);
    } else {
      if (accessToken) {
        user.githubAccessToken = accessToken;
        await this.usersRepository.save(user);
      } else {
        console.warn('AccessToken not provided for existing user');
      }
    }
    if (!user.allowed) {
      return null;
    }
    return user;
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  generateToken(user: User): string {
    return this.jwtService.sign({
      id: user.id,
      username: user.username,
      role: user.role,
    });
  }
}
