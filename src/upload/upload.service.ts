import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { mkdir, rename, unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { extname, join } from 'path';
import { ImageEntity } from './entities/image.entity';
import { UploadResponseDto } from './dto/upload-response.dto';
import { IAiService } from '@/ai/interfaces/ai-service.interface';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { withRetry } from '@/common/utils/retry';
import { HistoryService } from '@/history/history.service';

@Injectable()
export class UploadService implements OnModuleInit {
  private readonly logger = new Logger(UploadService.name);
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    private readonly configService: ConfigService,
    @Inject(AI_SERVICE_TOKEN)
    private readonly aiService: IAiService,
    private readonly historyService: HistoryService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.uploadDir, { recursive: true });
  }

  async handleUpload(file: Express.Multer.File): Promise<UploadResponseDto> {
    const id = uuidv4();
    const ext = extname(file.originalname).toLowerCase();
    const storedFilename = `${id}${ext}`;
    const uploadPath = join(this.uploadDir, storedFilename);

    // file.path is set by diskStorage — rename from Multer's temp name to final UUID name
    const tempPath = file.path;

    try {
      await rename(tempPath, uploadPath);

      // Attempt AI analysis — failure does not block upload
      let initialAnalysis: Record<string, unknown> | null = null;
      try {
        const completion = await this.aiService.analyzeImage(uploadPath);
        initialAnalysis = completion as unknown as Record<string, unknown>;
      } catch (aiError) {
        this.logger.warn(
          `AI analysis failed for ${uploadPath}: ${aiError instanceof Error ? aiError.message : String(aiError)}`,
        );
      }

      // Single save — avoids @VersionColumn double-increment
      const entity = this.imageRepository.create({
        originalFilename: file.originalname,
        storedFilename,
        mimeType: file.mimetype,
        size: file.size,
        uploadPath,
        initialAnalysis,
      });

      const saved = await withRetry(() => this.imageRepository.save(entity));

      // Persist analysis as the first assistant message in chat history
      if (initialAnalysis) {
        try {
          const content =
            (initialAnalysis as { choices?: { message?: { content?: string } }[] })
              .choices?.[0]?.message?.content ?? '';
          if (content) {
            await this.historyService.addMessage(saved.id, 'assistant', content);
          }
        } catch (histErr) {
          this.logger.warn(
            `Failed to save initial analysis to history: ${histErr instanceof Error ? histErr.message : String(histErr)}`,
          );
        }
      }

      return {
        id: saved.id,
        filename: saved.originalFilename,
        mimeType: saved.mimeType,
        size: saved.size,
        analysis: saved.initialAnalysis,
      };
    } catch (error) {
      // Clean up both temp and final paths on any failure
      await unlink(tempPath).catch(() => {});
      await unlink(uploadPath).catch(() => {});
      throw error;
    }
  }
}
