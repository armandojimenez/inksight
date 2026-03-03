import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService, UploadResponse } from './upload.service';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { MulterErrorInterceptor } from '../common/interceptors/multer-error.interceptor';

const MAX_FILE_SIZE_HARD_LIMIT = 16 * 1024 * 1024 + 1024; // 16MB + 1KB safety buffer

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    MulterErrorInterceptor,
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_HARD_LIMIT },
    }),
  )
  async upload(
    @UploadedFile(FileValidationPipe)
    file: Express.Multer.File,
  ): Promise<UploadResponse> {
    return this.uploadService.handleUpload(file);
  }
}
