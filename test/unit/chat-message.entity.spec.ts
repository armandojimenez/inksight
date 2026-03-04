import { getMetadataArgsStorage } from 'typeorm';
import { MetadataArgsStorage } from 'typeorm/metadata-args/MetadataArgsStorage';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { ImageEntity } from '@/upload/entities/image.entity';

describe('ChatMessageEntity', () => {
  let storage: MetadataArgsStorage;

  beforeAll(() => {
    void ChatMessageEntity;
    void ImageEntity;
    storage = getMetadataArgsStorage();
  });

  it('should be registered with table name "chat_messages"', () => {
    const tableArgs = storage.tables.find(
      (t) => t.target === ChatMessageEntity,
    );
    expect(tableArgs).toBeDefined();
    expect(tableArgs!.name).toBe('chat_messages');
  });

  it('should have all required columns', () => {
    const columns = storage.columns
      .filter((c) => c.target === ChatMessageEntity)
      .map((c) => c.propertyName);

    expect(columns).toContain('id');
    expect(columns).toContain('imageId');
    expect(columns).toContain('role');
    expect(columns).toContain('content');
    expect(columns).toContain('tokenCount');
    expect(columns).toContain('createdAt');
    expect(columns).toContain('updatedAt');
  });

  it('should have id as primary generated uuid column', () => {
    const generatedColumns = storage.generations.filter(
      (g) => g.target === ChatMessageEntity,
    );

    const idGen = generatedColumns.find((g) => g.propertyName === 'id');
    expect(idGen).toBeDefined();
    expect(idGen!.strategy).toBe('uuid');
  });

  it('should have @ManyToOne relation to ImageEntity with CASCADE delete', () => {
    const relations = storage.relations.filter(
      (r) => r.target === ChatMessageEntity,
    );

    const imageRelation = relations.find((r) => r.propertyName === 'image');
    expect(imageRelation).toBeDefined();
    expect(imageRelation!.relationType).toBe('many-to-one');
    expect(imageRelation!.options.onDelete).toBe('CASCADE');
  });

  it('should have composite @Index on (imageId, createdAt)', () => {
    const indices = storage.indices.filter(
      (i) => i.target === ChatMessageEntity,
    );

    const compositeIndex = indices.find(
      (i) =>
        Array.isArray(i.columns) &&
        i.columns.includes('imageId') &&
        i.columns.includes('createdAt'),
    );
    expect(compositeIndex).toBeDefined();
    expect(compositeIndex!.name).toBe('idx_chat_messages_image_created');
  });

  it('should have tokenCount as nullable integer', () => {
    const tokenCountCol = storage.columns.find(
      (c) =>
        c.target === ChatMessageEntity && c.propertyName === 'tokenCount',
    );
    expect(tokenCountCol).toBeDefined();
    expect(tokenCountCol!.options.nullable).toBe(true);
    expect(tokenCountCol!.options.type).toBe('integer');
  });

  it('should have role as varchar(20)', () => {
    const roleCol = storage.columns.find(
      (c) => c.target === ChatMessageEntity && c.propertyName === 'role',
    );
    expect(roleCol).toBeDefined();
    expect(roleCol!.options.length).toBe(20);
  });

  it('should have content as text type', () => {
    const contentCol = storage.columns.find(
      (c) => c.target === ChatMessageEntity && c.propertyName === 'content',
    );
    expect(contentCol).toBeDefined();
    expect(contentCol!.options.type).toBe('text');
  });

  it('should have createdAt as CreateDateColumn', () => {
    const createdAtCol = storage.columns.find(
      (c) =>
        c.target === ChatMessageEntity && c.propertyName === 'createdAt',
    );
    expect(createdAtCol).toBeDefined();
    expect(createdAtCol!.mode).toBe('createDate');
  });

  it('should have updatedAt as UpdateDateColumn', () => {
    const updatedAtCol = storage.columns.find(
      (c) =>
        c.target === ChatMessageEntity && c.propertyName === 'updatedAt',
    );
    expect(updatedAtCol).toBeDefined();
    expect(updatedAtCol!.mode).toBe('updateDate');
  });
});
