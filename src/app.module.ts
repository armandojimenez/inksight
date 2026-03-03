import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import * as Joi from 'joi';
import { join } from 'path';
import { CreateImagesTable1709500000000 } from './database/migrations/1709500000000-CreateImagesTable';
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
        UPLOAD_DIR: Joi.string().default('uploads'),
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
        migrations: [CreateImagesTable1709500000000],
        migrationsRun: true,
        retryAttempts: 10,
        retryDelay: 3000,
        extra: {
          max: 20,
        },
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client', 'dist'),
      serveRoot: '/',
      exclude: ['/api*'],
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
