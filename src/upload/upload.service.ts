import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { mkdir, writeFile, rename, unlink } from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { extname, join } from 'path';
import { ImageEntity } from './entities/image.entity';

export interface UploadResponse {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  analysis: string | null;
}

@Injectable()
export class UploadService {
  private readonly uploadDir: string;

  constructor(
    @InjectRepository(ImageEntity)
    private readonly imageRepository: Repository<ImageEntity>,
    private readonly configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
  }

  async handleUpload(file: Express.Multer.File): Promise<UploadResponse> {
    const id = uuidv4();
    const ext = extname(file.originalname).toLowerCase();
    const storedFilename = `${id}${ext}`;
    const finalPath = join(this.uploadDir, storedFilename);
    const tempPath = join(this.uploadDir, `.tmp-${id}${ext}`);

    // Ensure upload directory exists
    await mkdir(this.uploadDir, { recursive: true });

    // Atomic write: temp file then rename
    await writeFile(tempPath, file.buffer);
    await rename(tempPath, finalPath);

    // Persist to database
    const entity = this.imageRepository.create({
      originalFilename: file.originalname,
      storedFilename,
      mimeType: file.mimetype,
      size: file.size,
      uploadPath: `${this.uploadDir}/${storedFilename}`,
    });

    try {
      const saved = await this.imageRepository.save(entity);

      return {
        id: saved.id,
        filename: saved.originalFilename,
        mimeType: saved.mimeType,
        size: saved.size,
        analysis: saved.initialAnalysis,
      };
    } catch (error) {
      // Clean up file on DB failure
      await unlink(finalPath).catch(() => {});
      throw error;
    }
  }
}
