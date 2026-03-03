import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  setupApp(app);

  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV');
  await app.listen(port);
  logger.log(`Application listening on port ${port} (${nodeEnv})`);
}

void bootstrap();
