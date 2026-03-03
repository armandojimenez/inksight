import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppModule } from '@/app.module';
import { ImageEntity } from '@/upload/entities/image.entity';

describe('AppModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    const mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
      metadata: {
        tableName: 'images',
        columns: [],
        relations: [],
      },
    };

    const mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
      destroy: jest.fn(),
      isInitialized: true,
      getRepository: jest.fn().mockReturnValue(mockRepository),
      manager: {
        getRepository: jest.fn().mockReturnValue(mockRepository),
      },
    };

    module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DataSource)
      .useValue(mockDataSource)
      .overrideProvider(getRepositoryToken(ImageEntity))
      .useValue(mockRepository)
      .compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should have ConfigModule loaded', () => {
    const configModule = module.get(ConfigModule);
    expect(configModule).toBeDefined();
  });
});
