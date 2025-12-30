import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { GithubAuthGuard } from './guards/github-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { User } from './user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Get('github')
  @UseGuards(GithubAuthGuard)
  async githubLogin() { }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  githubCallback(@Req() req: any, @Res() res: Response) {
    const user = req.user as User;
    if (!user) {
      const frontendUrl = process.env.FRONTEND_URL;
      if (frontendUrl) {
        res.redirect(`${frontendUrl}/auth/callback?error=unauthorized`);
      }
      return;
    }

    const token = this.authService.generateToken(user);
    const frontendUrl = process.env.FRONTEND_URL || '';
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('jwt', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 3600000,
    });

    res.redirect(`${frontendUrl}/dashboard`);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@GetUser() user: User) {
    const userWithToken = await this.authService.findById(user.id);
    return {
      id: user.id.toString(),
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl,
      name: user.username,
      email: '',
      hasGithubToken: !!userWithToken?.githubAccessToken,
    };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Res() res: Response) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('jwt', '', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 0,
    });
    return res.json({ message: 'Logged out successfully' });
  }
}
