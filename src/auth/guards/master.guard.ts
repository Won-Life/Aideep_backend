import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import { JwtPayload } from '../strategy/jwt.strategy';

@Injectable()
export class MasterGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as JwtPayload | undefined;
    if (!user || user.isMaster !== true) {
      throw new ForbiddenException('마스터 권한이 필요합니다.');
    }
    return true;
  }
}
