import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
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
      }),
    }),
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
})
export class AppModule {}
