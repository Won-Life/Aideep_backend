import { JwtPayload } from '../auth/strategy/jwt.strategy';

declare global {
  namespace Express {
    interface Request {
      user: JwtPayload;
    }
  }
}
