import { MetadataArgsStorage } from 'typeorm/metadata-args/MetadataArgsStorage';
import { getMetadataArgsStorage } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';

describe('ImageEntity', () => {
  let storage: MetadataArgsStorage;

  beforeAll(() => {
    // Force decorator metadata to register by referencing the entity
    void ImageEntity;
    storage = getMetadataArgsStorage();
  });

  it('should be registered with table name "images"', () => {
    const tableArgs = storage.tables.find((t) => t.target === ImageEntity);
    expect(tableArgs).toBeDefined();
    expect(tableArgs!.name).toBe('images');
  });

  it('should have all required columns', () => {
    const columns = storage.columns
      .filter((c) => c.target === ImageEntity)
      .map((c) => c.propertyName);

    expect(columns).toContain('id');
    expect(columns).toContain('originalFilename');
    expect(columns).toContain('storedFilename');
    expect(columns).toContain('mimeType');
    expect(columns).toContain('size');
    expect(columns).toContain('uploadPath');
    expect(columns).toContain('initialAnalysis');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('updatedAt');
    expect(columns).toContain('version');
  });

  it('should have id as primary generated uuid column', () => {
    const generatedColumns = storage.generations.filter(
      (g) => g.target === ImageEntity,
    );

    const idGen = generatedColumns.find((g) => g.propertyName === 'id');
    expect(idGen).toBeDefined();
    expect(idGen!.strategy).toBe('uuid');
  });

  it('should have storedFilename as unique', () => {
    const storedFilenameCol = storage.columns.find(
      (c) => c.target === ImageEntity && c.propertyName === 'storedFilename',
    );
    expect(storedFilenameCol).toBeDefined();
    expect(storedFilenameCol!.options.unique).toBe(true);
  });

  it('should have initialAnalysis as nullable', () => {
    const analysisCol = storage.columns.find(
      (c) => c.target === ImageEntity && c.propertyName === 'initialAnalysis',
    );
    expect(analysisCol).toBeDefined();
    expect(analysisCol!.options.nullable).toBe(true);
  });

  it('should have version column for optimistic locking', () => {
    const versionCol = storage.columns.find(
      (c) => c.target === ImageEntity && c.propertyName === 'version',
    );
    expect(versionCol).toBeDefined();
    expect(versionCol!.mode).toBe('version');
  });

  it('should have createdAt as CreateDateColumn with timestamptz', () => {
    const createdAtCol = storage.columns.find(
      (c) => c.target === ImageEntity && c.propertyName === 'createdAt',
    );
    expect(createdAtCol).toBeDefined();
    expect(createdAtCol!.mode).toBe('createDate');
    expect(createdAtCol!.options.type).toBe('timestamptz');
  });

  it('should have updatedAt as UpdateDateColumn with timestamptz', () => {
    const updatedAtCol = storage.columns.find(
      (c) => c.target === ImageEntity && c.propertyName === 'updatedAt',
    );
    expect(updatedAtCol).toBeDefined();
    expect(updatedAtCol!.mode).toBe('updateDate');
    expect(updatedAtCol!.options.type).toBe('timestamptz');
  });

  it('should have IDX_images_createdAt index', () => {
    const indexes = storage.indices.filter((i) => i.target === ImageEntity);
    const createdAtIndex = indexes.find(
      (i) => i.name === 'IDX_images_createdAt',
    );
    expect(createdAtIndex).toBeDefined();
    expect(createdAtIndex!.columns).toEqual(['createdAt']);
  });

  it('should have correct column types and lengths', () => {
    const findCol = (name: string) =>
      storage.columns.find(
        (c) => c.target === ImageEntity && c.propertyName === name,
      );

    expect(findCol('originalFilename')!.options.length).toBe(255);
    expect(findCol('storedFilename')!.options.length).toBe(255);
    expect(findCol('mimeType')!.options.length).toBe(50);
    expect(findCol('uploadPath')!.options.length).toBe(500);
    expect(findCol('size')!.options.type).toBe('integer');
    expect(findCol('initialAnalysis')!.options.type).toBe('jsonb');
  });
});
