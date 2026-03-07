import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import { UploadService } from './upload.service';
import { UploadResponseDto } from './dto/upload-response.dto';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { MulterErrorInterceptor } from '../common/interceptors/multer-error.interceptor';
import { ErrorResponseSchema } from '@/common/swagger/error-response.schema';

// Multer hard limit: slightly above MAX_FILE_SIZE so the pipe can provide
// a precise error message. Must stay >= MAX_FILE_SIZE env var.
// Both reference the same 16MB base. See also: FileValidationPipe.maxFileSize
const MAX_FILE_SIZE_HARD_LIMIT = 16 * 1024 * 1024 + 1024;

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @ApiOperation({
    summary: 'Upload an image',
    description:
      'Upload an image file for AI analysis. The server validates the file extension, size (max 16 MB), ' +
      'and content integrity (magic bytes must match the declared extension). ' +
      'Files are stored as `{uuid}.{ext}` — original filenames are sanitized and preserved in metadata only. ' +
      'Returns image metadata with initial AI vision analysis. Rate limited to 10 requests per minute.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Image file to upload',
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'Image file (PNG, JPEG, or GIF, max 16 MB)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Image uploaded and analyzed successfully',
    type: UploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Missing file (`MISSING_FILE`) or content does not match extension (`FILE_CONTENT_MISMATCH`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 413,
    description: 'File size exceeds 16 MB limit (`FILE_TOO_LARGE`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 415,
    description: 'File type not allowed — accepted: .png, .jpg, .jpeg, .gif (`INVALID_FILE_TYPE`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — max 10 uploads per minute (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    MulterErrorInterceptor,
    FileInterceptor('image', {
      // diskStorage writes directly to disk — avoids buffering up to 16MB in Node process memory.
      // Uses process.env.UPLOAD_DIR (not ConfigService) because Multer config runs at module load before DI.
      // Value is validated at startup by Joi schema in AppModule (pattern: /^[a-zA-Z0-9._/-]+$/).
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          cb(null, process.env.UPLOAD_DIR || 'uploads');
        },
        filename: (_req, file, cb) => {
          // No extension on temp file — prevents attacker-controlled extensions from touching disk.
          // The pipe validates the original extension; UploadService renames to final {uuid}.{ext}.
          void file;
          cb(null, `.tmp-${uuidv4()}`);
        },
      }),
      limits: {
        fileSize: MAX_FILE_SIZE_HARD_LIMIT,
        files: 1,
        fields: 0,
        parts: 2,
      },
    }),
  )
  async upload(
    @UploadedFile(FileValidationPipe)
    file: Express.Multer.File,
  ): Promise<UploadResponseDto> {
    return this.uploadService.handleUpload(file);
  }
}
