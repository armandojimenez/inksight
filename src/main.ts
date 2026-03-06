import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './common/setup-app';
import { version } from '../package.json';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  setupApp(app);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Inksight API')
    .setDescription(
      'AI-powered visual assistant API for image upload and conversational chat with real-time streaming.\n\n' +
      '## Overview\n\n' +
      'Inksight lets users upload images and have AI-powered conversations about them. ' +
      'The API supports both synchronous chat responses and real-time streaming via Server-Sent Events (SSE).\n\n' +
      '## Key Features\n\n' +
      '- **Image Upload** — Upload PNG, JPEG, or GIF images (max 16 MB) with magic-byte validation\n' +
      '- **AI Chat** — Send messages about images and receive AI analysis in OpenAI-compatible format\n' +
      '- **SSE Streaming** — Real-time token-by-token streaming via `POST /api/chat-stream/:imageId`\n' +
      '- **Conversation History** — Paginated message history per image with automatic context inclusion\n' +
      '- **Image Gallery** — Browse all uploaded images with message counts and metadata\n\n' +
      '## Authentication\n\n' +
      'No authentication is required. All endpoints are publicly accessible.\n\n' +
      '## Rate Limiting\n\n' +
      '| Endpoint | Limit |\n' +
      '|----------|-------|\n' +
      '| `POST /api/upload` | 10 requests / minute |\n' +
      '| `POST /api/chat/:imageId` | 30 requests / minute |\n' +
      '| `POST /api/chat-stream/:imageId` | 30 requests / minute + max 5 concurrent SSE connections per IP |\n' +
      '| All other endpoints | 100 requests / minute |\n\n' +
      '## Error Format\n\n' +
      'All errors follow a consistent JSON shape with `statusCode`, `error`, `code`, `message`, `timestamp`, `path`, and `requestId` fields.\n\n' +
      '## Request Tracking\n\n' +
      'Every response includes an `X-Request-Id` header. Send a custom `X-Request-Id` header (1-128 alphanumeric/hyphen/underscore chars) to trace requests through logs.',
    )
    .setVersion(version)
    .build();

  const port = config.get<number>('PORT', 3000);
  const nodeEnv = config.get<string>('NODE_ENV');

  if (nodeEnv !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    logger.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  logger.log(`Application listening on port ${port} (${nodeEnv})`);
}

void bootstrap();
