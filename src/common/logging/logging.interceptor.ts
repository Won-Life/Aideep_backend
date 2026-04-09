import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
  LoggerService,
  NestInterceptor
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService
  ) {}

  private static readonly SKIP_URLS = ['/metrics'];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const { method, url } = req;
    const isProd = process.env.NODE_ENV === 'production';

    if (LoggingInterceptor.SKIP_URLS.some((skip) => url.startsWith(skip))) {
      return next.handle();
    }
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.ip;
    const userId = (req as any).user?.user_id ?? null;
    const requestId = uuidv4();
    const start = Date.now();

    // Attach requestId to response header for tracing
    res.setHeader('X-Request-Id', requestId);

    isProd
      ? this.logger.log(
          JSON.stringify({
            type: 'request',
            requestId,
            userId,
            ip,
            method,
            url
          }),
          'HTTP'
        )
      : this.logger.log(
          `[Request] userId : ${userId} ${method} ${url}`,
          'HTTP'
        );

    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        const statusCode = res.statusCode;
        isProd
          ? this.logger.log(
              JSON.stringify({
                type: 'response',
                requestId,
                userId,
                ip,
                method,
                url,
                statusCode,
                ms
              }),
              'HTTP'
            )
          : this.logger.log(
              `[Response] ${method} ${url} ${statusCode} - ${ms}ms`,
              'HTTP'
            );
      }),
      catchError((err) => {
        const ms = Date.now() - start;
        const statusCode = err instanceof HttpException ? err.getStatus() : 500;
        const stack = err instanceof Error ? err.stack : undefined;
        isProd
          ? this.logger.error(
              JSON.stringify({
                type: 'response',
                requestId,
                userId,
                ip,
                method,
                url,
                statusCode,
                ms
              }),
              stack,
              'HTTP'
            )
          : this.logger.error(
              `[Response] ${method} ${url} ${statusCode} - ${ms}ms`,
              stack,
              'HTTP'
            );
        return throwError(() => err);
      })
    );
  }
}
