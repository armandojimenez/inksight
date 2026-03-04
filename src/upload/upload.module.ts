import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from './entities/image.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { AiModule } from '@/ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity]), AiModule],
  controllers: [UploadController],
  providers: [UploadService, FileValidationPipe],
  exports: [UploadService],
})
export class UploadModule {}
