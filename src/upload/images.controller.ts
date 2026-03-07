import {
  Controller,
  Get,
  Delete,
  Patch,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ImagesService } from './images.service';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { GalleryResponse } from './dto/gallery-response.dto';
import { ReanalyzeResponseDto } from './dto/reanalyze-response.dto';
import { buildErrorResponse } from '@/common/utils/build-error-response';
import { RequestWithCorrelation } from '@/common/interfaces/request.interface';
import { ErrorResponseSchema } from '@/common/swagger/error-response.schema';

@ApiTags('Images')
@Controller('images')
export class ImagesController {
  private readonly logger = new Logger(ImagesController.name);

  constructor(private readonly imagesService: ImagesService) {}

  @Get()
  @ApiOperation({
    summary: 'List uploaded images (gallery)',
    description:
      'Returns a paginated list of all uploaded images, ordered by creation date (newest first). ' +
      'Each entry includes metadata and a count of associated chat messages.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of images',
    type: GalleryResponse,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
  async listImages(
    @Query() query: PaginationQueryDto,
  ): Promise<GalleryResponse> {
    const { images, total } = await this.imagesService.listImages(
      query.page,
      query.limit,
    );

    return {
      images,
      total,
      page: query.page,
      pageSize: query.limit,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
    };
  }

  @Delete(':imageId')
  @ApiOperation({
    summary: 'Delete an image',
    description:
      'Permanently deletes an image record, its file on disk, and all associated chat messages (cascade). ' +
      'Invalidates related caches. Returns 204 on success, 404 if the image does not exist.',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Image UUID (v4 format)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({ status: 204, description: 'Image deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID format (`INVALID_UUID`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Image not found (`IMAGE_NOT_FOUND`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @Param('imageId', UuidValidationPipe) imageId: string,
  ): Promise<void> {
    await this.imagesService.deleteImage(imageId);
  }

  @Patch(':imageId/reanalyze')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Re-run AI analysis on an image',
    description:
      'Re-runs the AI vision analysis on an existing image. Uses optimistic locking (@VersionColumn) — ' +
      'if another request modified the image concurrently, returns 409 Conflict.',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Image UUID (v4 format)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Image re-analyzed successfully',
    type: ReanalyzeResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID format (`INVALID_UUID`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Image not found (`IMAGE_NOT_FOUND`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 409,
    description: 'Version conflict — image was modified concurrently (`VERSION_CONFLICT`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
  async reanalyzeImage(
    @Param('imageId', UuidValidationPipe) imageId: string,
  ): Promise<ReanalyzeResponseDto> {
    return this.imagesService.reanalyzeImage(imageId);
  }

  @Get(':imageId/file')
  @ApiOperation({
    summary: 'Serve image file',
    description:
      'Streams the original image file from disk. Sets `Content-Type` from the database record, ' +
      '`Content-Disposition: inline` with the original filename, and aggressive cache headers ' +
      '(`Cache-Control: public, max-age=31536000, immutable`).',
  })
  @ApiParam({
    name: 'imageId',
    description: 'Image UUID (v4 format)',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiProduces('image/png', 'image/jpeg', 'image/gif')
  @ApiResponse({
    status: 200,
    description: 'Image file binary stream',
    content: {
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/gif': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid UUID format (`INVALID_UUID`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Image not found (`IMAGE_NOT_FOUND`) or file missing from disk (`IMAGE_FILE_NOT_FOUND`)',
    type: ErrorResponseSchema,
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded (`RATE_LIMIT_EXCEEDED`)',
    type: ErrorResponseSchema,
  })
  async serveImage(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { stream, image } = await this.imagesService.getImageForServing(
        imageId,
      );

      res.setHeader('Content-Type', image.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(image.originalFilename)}"`,
      );
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      stream.on('error', (err) => {
        this.logger.error(
          `Stream error serving image ${imageId}: ${err.message}`,
        );
        if (!res.headersSent) {
          const req = res.req as unknown as RequestWithCorrelation;
          const requestId = req.correlationId ?? 'unknown';
          const body = buildErrorResponse(
            new Error('Stream failed'),
            req.url,
            requestId,
          );
          res.status(body.statusCode).json(body);
        } else {
          res.end();
        }
      });

      stream.pipe(res);
    } catch (err) {
      // @Res() puts NestJS in library-specific mode — handle errors manually
      const req = res.req as unknown as RequestWithCorrelation;
      const requestId = req.correlationId ?? 'unknown';
      const body = buildErrorResponse(err, req.url, requestId);
      res.status(body.statusCode).json(body);
    }
  }
}
