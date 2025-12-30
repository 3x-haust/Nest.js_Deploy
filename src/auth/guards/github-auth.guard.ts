import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const res = context.switchToHttp().getResponse<Response>();
    if (err || !user) {
      res.redirect(
        `${process.env.FRONTEND_URL}/auth/callback?error=unauthorized`,
      );
      return null;
    }
    return user;
  }
}
