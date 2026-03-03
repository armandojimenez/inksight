import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from './entities/image.entity';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity])],
  controllers: [UploadController],
  providers: [UploadService, FileValidationPipe],
  exports: [UploadService],
})
export class UploadModule {}
