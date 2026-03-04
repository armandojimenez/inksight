import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { ConfigService } from '@nestjs/config';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { validationExceptionFactory } from './factories/validation-exception.factory';

export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());

  const nodeEnv = config.get<string>('NODE_ENV');
  app.enableCors(
    nodeEnv === 'production'
      ? {
          origin: config.get<string>('ALLOWED_ORIGIN') ?? false,
          credentials: true,
        }
      : { origin: true },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.enableShutdownHooks();
}
