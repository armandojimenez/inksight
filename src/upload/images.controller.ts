import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ImagesService } from './images.service';
import { UuidValidationPipe } from '@/common/pipes/uuid-validation.pipe';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { GalleryResponse } from './dto/gallery-response.dto';
import { buildErrorResponse } from '@/common/utils/build-error-response';
import { RequestWithCorrelation } from '@/common/interfaces/request.interface';

@Controller('images')
export class ImagesController {
  private readonly logger = new Logger(ImagesController.name);

  constructor(private readonly imagesService: ImagesService) {}

  @Get()
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
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteImage(
    @Param('imageId', UuidValidationPipe) imageId: string,
  ): Promise<void> {
    await this.imagesService.deleteImage(imageId);
  }

  @Get(':imageId/file')
  async serveImage(
    @Param('imageId', UuidValidationPipe) imageId: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { stream, image } = await this.imagesService.getImageForServing(
        imageId,
      );

      res.setHeader('Content-Type', image.mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=3600');

      stream.on('error', (err) => {
        this.logger.error(
          `Stream error serving image ${imageId}: ${err.message}`,
        );
        if (!res.headersSent) {
          res.status(500).json({ error: 'Stream failed' });
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
