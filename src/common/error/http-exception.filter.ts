import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { BasicError } from './basic-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof BasicError) {
      response.status(exception.status).json(exception.toJSON());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      let reason = exception.message;
      let data = '';

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, any>;
        if (Array.isArray(res.message)) {
          reason = res.message.join(', ');
        } else if (typeof res.message === 'string') {
          reason = res.message;
        }
        data = res.error || '';
      }

      response.status(status).json({
        resultType: 'FAIL',
        error: {
          errorCode: `HTTP-${status}`,
          reason,
          data,
        },
        success: null,
      });
      return;
    }

    console.error('Unhandled exception:', exception);

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      resultType: 'FAIL',
      error: {
        errorCode: 'COMMON-500',
        reason: '서버 내부 오류가 발생했습니다.',
        data: '',
      },
      success: null,
    });
  }
}
