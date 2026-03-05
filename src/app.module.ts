import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import * as Joi from 'joi';
import { join } from 'path';
import { migrations } from './database/migrations';
import { HealthModule } from './health/health.module';
import { UploadModule } from './upload/upload.module';
import { ChatModule } from './chat/chat.module';
import { AiModule } from './ai/ai.module';
import { HistoryModule } from './history/history.module';
import { CacheModule } from './cache/cache.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { DatabaseModule } from './database/database.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        DATABASE_URL: Joi.string().required(),
        UPLOAD_DIR: Joi.string()
          .pattern(/^[a-zA-Z0-9._/-]+$/)
          .default('uploads'),
        MAX_FILE_SIZE: Joi.number().default(16777216),
        RATE_LIMIT_TTL: Joi.number().default(60000),
        RATE_LIMIT_MAX: Joi.number().default(100),
        ALLOWED_ORIGIN: Joi.string().optional(),
        MAX_SSE_PER_IP: Joi.number().default(5),
        CLEANUP_ENABLED: Joi.boolean().default(true),
        CLEANUP_IMAGE_TTL_MS: Joi.number().default(86400000),
        CLEANUP_TEMP_TTL_MS: Joi.number().default(3600000),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: config.get<number>('RATE_LIMIT_TTL', 60000),
            limit: config.get<number>('RATE_LIMIT_MAX', 100),
          },
        ],
      }),
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        migrations,
        migrationsRun: true,
        retryAttempts: 10,
        retryDelay: 3000,
        extra: {
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          statement_timeout: 10000,
        },
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'dist'),
      serveRoot: '/',
      exclude: ['/api/{*any}'],
    }),
    HealthModule,
    UploadModule,
    ChatModule,
    AiModule,
    HistoryModule,
    CacheModule,
    CleanupModule,
    DatabaseModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule {}
