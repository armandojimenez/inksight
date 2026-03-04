import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from './entities/image.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { AiModule } from '@/ai/ai.module';
import { HistoryModule } from '@/history/history.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity]), AiModule, HistoryModule],
  controllers: [UploadController, ImagesController],
  providers: [UploadService, ImagesService, FileValidationPipe],
  exports: [UploadService],
})
export class UploadModule {}
