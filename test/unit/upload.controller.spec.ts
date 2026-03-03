import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UploadController } from '@/upload/upload.controller';
import { UploadService } from '@/upload/upload.service';
import { UploadResponseDto } from '@/upload/dto/upload-response.dto';
import { FileValidationPipe } from '@/common/pipes/file-validation.pipe';
import { createMinimalPng } from '../../test/fixtures/image-buffers';

describe('UploadController', () => {
  let controller: UploadController;
  let uploadService: jest.Mocked<Pick<UploadService, 'handleUpload'>>;

  beforeEach(async () => {
    uploadService = {
      handleUpload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [
        {
          provide: UploadService,
          useValue: uploadService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MAX_FILE_SIZE') return 16 * 1024 * 1024;
              return undefined;
            }),
          },
        },
        FileValidationPipe,
      ],
    }).compile();

    controller = module.get<UploadController>(UploadController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call uploadService.handleUpload with the file', async () => {
    const buffer = createMinimalPng();
    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer,
      size: buffer.length,
    } as Express.Multer.File;

    const expected: UploadResponseDto = {
      id: 'test-uuid',
      filename: 'photo.png',
      mimeType: 'image/png',
      size: buffer.length,
      analysis: null,
    };

    uploadService.handleUpload.mockResolvedValue(expected);

    const result = await controller.upload(file);

    expect(uploadService.handleUpload).toHaveBeenCalledWith(file);
    expect(result).toEqual(expected);
  });

  it('should return the response from the service', async () => {
    const buffer = createMinimalPng();
    const file = {
      originalname: 'photo.jpg',
      mimetype: 'image/jpeg',
      buffer,
      size: buffer.length,
    } as Express.Multer.File;

    const expected: UploadResponseDto = {
      id: 'another-uuid',
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      size: buffer.length,
      analysis: null,
    };

    uploadService.handleUpload.mockResolvedValue(expected);

    const result = await controller.upload(file);

    expect(result).toEqual(expected);
    expect(result.analysis).toBeNull();
  });

  it('should propagate errors from the service', async () => {
    const file = {
      originalname: 'photo.png',
      mimetype: 'image/png',
      buffer: createMinimalPng(),
      size: 100,
    } as Express.Multer.File;

    uploadService.handleUpload.mockRejectedValue(
      new Error('Upload failed'),
    );

    await expect(controller.upload(file)).rejects.toThrow('Upload failed');
  });
});
