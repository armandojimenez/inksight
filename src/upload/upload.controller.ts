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
import { UploadService } from './upload.service';
import { UploadResponseDto } from './dto/upload-response.dto';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { MulterErrorInterceptor } from '../common/interceptors/multer-error.interceptor';

// Multer hard limit: slightly above MAX_FILE_SIZE so the pipe can provide
// a precise error message. Must stay >= MAX_FILE_SIZE env var.
// Both reference the same 16MB base. See also: FileValidationPipe.maxFileSize
const MAX_FILE_SIZE_HARD_LIMIT = 16 * 1024 * 1024 + 1024;

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    MulterErrorInterceptor,
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE_HARD_LIMIT, files: 1, fields: 0, parts: 2 },
    }),
  )
  async upload(
    @UploadedFile(FileValidationPipe)
    file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    return this.uploadService.handleUpload(file);
  }
}
