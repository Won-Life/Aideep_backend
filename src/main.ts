import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/error';
import { ResponseInterceptor } from './common/response/response.interceptor';
import { LoggingInterceptor } from './common/logging/logging.interceptor';
import { HttpMetricsInterceptor } from './common/metrics';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter(winstonLogger));
  app.useGlobalInterceptors(
    new LoggingInterceptor(winstonLogger),
    app.get(HttpMetricsInterceptor),
    new ResponseInterceptor()
  );
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));
  app.setGlobalPrefix('aideep/api', { exclude: ['/metrics'] });

  const config = new DocumentBuilder()
    .setTitle('Aideep API 문서')
    .setDescription(
      'Aideep API 문서입니다. api versioning은 /버전/aideep/api 순서입니다.'
    )
    .setVersion('1.0')
    .addServer('/aideep/api')
    .addServer('/v1/aideep/api')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header'
      },
      'jwt'
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: true
  });
  SwaggerModule.setup('/docs', app, document);

  await app.listen(process.env.PORT ?? 3320);
}
bootstrap();
