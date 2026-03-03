import { DataSource } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';

describe('ImageEntity', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [ImageEntity],
      synchronize: true,
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('should have the correct table name', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    expect(metadata.tableName).toBe('images');
  });

  it('should have all required columns', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    const columnNames = metadata.columns.map((c) => c.propertyName);

    expect(columnNames).toContain('id');
    expect(columnNames).toContain('originalFilename');
    expect(columnNames).toContain('storedFilename');
    expect(columnNames).toContain('mimeType');
    expect(columnNames).toContain('size');
    expect(columnNames).toContain('uploadPath');
    expect(columnNames).toContain('initialAnalysis');
    expect(columnNames).toContain('createdAt');
    expect(columnNames).toContain('updatedAt');
    expect(columnNames).toContain('version');
  });

  it('should have id as primary generated uuid column', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    const idColumn = metadata.findColumnWithPropertyName('id');

    expect(idColumn).toBeDefined();
    expect(idColumn!.isPrimary).toBe(true);
    expect(idColumn!.generationStrategy).toBe('uuid');
  });

  it('should have storedFilename as unique', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    const storedFilenameColumn =
      metadata.findColumnWithPropertyName('storedFilename');

    expect(storedFilenameColumn).toBeDefined();

    const hasUniqueConstraint = metadata.uniques.some((u) =>
      u.columns.some((c) => c.propertyName === 'storedFilename'),
    );
    const hasUniqueIndex = metadata.indices.some(
      (i) =>
        i.isUnique &&
        i.columns.some((c) => c.propertyName === 'storedFilename'),
    );
    // TypeORM may store uniqueness as a constraint, index, or column option
    expect(hasUniqueConstraint || hasUniqueIndex).toBe(true);
  });

  it('should have initialAnalysis as nullable', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    const analysisColumn =
      metadata.findColumnWithPropertyName('initialAnalysis');

    expect(analysisColumn).toBeDefined();
    expect(analysisColumn!.isNullable).toBe(true);
  });

  it('should have version column for optimistic locking', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    const versionColumn = metadata.findColumnWithPropertyName('version');

    expect(versionColumn).toBeDefined();
    expect(metadata.versionColumn).toBeDefined();
    expect(metadata.versionColumn!.propertyName).toBe('version');
  });

  it('should have createdAt and updatedAt as auto-generated', () => {
    const metadata = dataSource.getMetadata(ImageEntity);
    const createdAt = metadata.findColumnWithPropertyName('createdAt');
    const updatedAt = metadata.findColumnWithPropertyName('updatedAt');

    expect(createdAt).toBeDefined();
    expect(createdAt!.isCreateDate).toBe(true);
    expect(updatedAt).toBeDefined();
    expect(updatedAt!.isUpdateDate).toBe(true);
  });

  it('should persist and retrieve an image record', async () => {
    const repo = dataSource.getRepository(ImageEntity);

    const image = repo.create({
      originalFilename: 'test-photo.png',
      storedFilename: 'abc-123.png',
      mimeType: 'image/png',
      size: 1024,
      uploadPath: 'uploads/abc-123.png',
    });

    const saved = await repo.save(image);

    expect(saved.id).toBeDefined();
    expect(saved.originalFilename).toBe('test-photo.png');
    expect(saved.storedFilename).toBe('abc-123.png');
    expect(saved.mimeType).toBe('image/png');
    expect(saved.size).toBe(1024);
    expect(saved.uploadPath).toBe('uploads/abc-123.png');
    expect(saved.initialAnalysis).toBeNull();
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.updatedAt).toBeInstanceOf(Date);
    expect(saved.version).toBe(1);
  });

  it('should enforce storedFilename uniqueness', async () => {
    const repo = dataSource.getRepository(ImageEntity);

    const image1 = repo.create({
      originalFilename: 'photo1.png',
      storedFilename: 'unique-name.png',
      mimeType: 'image/png',
      size: 512,
      uploadPath: 'uploads/unique-name.png',
    });
    await repo.save(image1);

    const image2 = repo.create({
      originalFilename: 'photo2.png',
      storedFilename: 'unique-name.png',
      mimeType: 'image/png',
      size: 256,
      uploadPath: 'uploads/unique-name.png',
    });

    await expect(repo.save(image2)).rejects.toThrow();
  });
});
