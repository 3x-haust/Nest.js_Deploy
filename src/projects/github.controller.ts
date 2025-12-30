import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GithubService } from './github.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../auth/user.entity';

@Controller('github')
@UseGuards(JwtAuthGuard)
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  @Get('repositories')
  async getRepositories(@GetUser() user: User): Promise<any[]> {
    const userWithToken = await this.usersRepository.findOne({
      where: { id: user.id },
    });

    if (!userWithToken?.githubAccessToken) {
      console.warn('GitHub access token is missing for user:', user.id);
      return [];
    }

    try {
      const repos = await this.githubService.getRepositories(
        userWithToken.githubAccessToken,
      );
      return repos;
    } catch (error) {
      console.error('Error fetching repositories:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
      }
      return [];
    }
  }
}
