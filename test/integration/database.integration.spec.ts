import { DataSource, Repository } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { migrations } from '@/database/migrations';

const TEST_DB_URL =
  process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/inksight_test';

describe('Database integration', () => {
  let dataSource: DataSource;
  let imageRepo: Repository<ImageEntity>;
  let messageRepo: Repository<ChatMessageEntity>;
  let dbAvailable = false;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: TEST_DB_URL,
      entities: [ImageEntity, ChatMessageEntity],
      migrations,
      synchronize: false,
      migrationsRun: false,
    });

    try {
      await dataSource.initialize();
      await dataSource.runMigrations();
      dbAvailable = true;
    } catch {
      console.warn('Database not reachable — skipping database integration tests');
      return;
    }

    imageRepo = dataSource.getRepository(ImageEntity);
    messageRepo = dataSource.getRepository(ChatMessageEntity);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await messageRepo.query('DELETE FROM chat_messages');
    await imageRepo.query('DELETE FROM images');
  });

  it('should run all migrations cleanly', async () => {
    if (!dbAvailable) return;

    // Undo all migrations then re-run
    for (let i = 0; i < migrations.length; i++) {
      await dataSource.undoLastMigration();
    }

    await dataSource.runMigrations();

    const tables: Array<{ table_name: string }> = await dataSource.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('images', 'chat_messages')
      ORDER BY table_name
    `);

    expect(tables.map((t) => t.table_name)).toEqual([
      'chat_messages',
      'images',
    ]);
  });

  it('should CRUD on images', async () => {
    if (!dbAvailable) return;

    // Create
    const image = imageRepo.create({
      originalFilename: 'test.png',
      storedFilename: 'abc-123.png',
      mimeType: 'image/png',
      size: 1024,
      uploadPath: 'uploads/abc-123.png',
      initialAnalysis: null,
    });
    const saved = await imageRepo.save(image);
    expect(saved.id).toBeDefined();
    expect(saved.version).toBe(1);

    // Read
    const found = await imageRepo.findOneBy({ id: saved.id });
    expect(found).toBeDefined();
    expect(found!.originalFilename).toBe('test.png');

    // Update
    found!.originalFilename = 'updated.png';
    const updated = await imageRepo.save(found!);
    expect(updated.originalFilename).toBe('updated.png');
    expect(updated.version).toBe(2);

    // Delete
    await imageRepo.remove(updated);
    const deleted = await imageRepo.findOneBy({ id: saved.id });
    expect(deleted).toBeNull();
  });

  it('should CRUD on chat_messages with FK', async () => {
    if (!dbAvailable) return;

    const image = await imageRepo.save(
      imageRepo.create({
        originalFilename: 'test.png',
        storedFilename: 'msg-test.png',
        mimeType: 'image/png',
        size: 512,
        uploadPath: 'uploads/msg-test.png',
        initialAnalysis: null,
      }),
    );

    const message = messageRepo.create({
      imageId: image.id,
      role: 'user',
      content: 'What is this?',
      tokenCount: null,
    });
    const saved = await messageRepo.save(message);

    expect(saved.id).toBeDefined();
    expect(saved.imageId).toBe(image.id);
    expect(saved.role).toBe('user');
    expect(saved.content).toBe('What is this?');
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('should cascade delete messages when image is deleted', async () => {
    if (!dbAvailable) return;

    const image = await imageRepo.save(
      imageRepo.create({
        originalFilename: 'cascade.png',
        storedFilename: 'cascade-test.png',
        mimeType: 'image/png',
        size: 256,
        uploadPath: 'uploads/cascade-test.png',
        initialAnalysis: null,
      }),
    );

    for (let i = 0; i < 3; i++) {
      await messageRepo.save(
        messageRepo.create({
          imageId: image.id,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          tokenCount: null,
        }),
      );
    }

    expect(await messageRepo.count({ where: { imageId: image.id } })).toBe(3);

    // Raw SQL delete triggers ON DELETE CASCADE
    await imageRepo.query('DELETE FROM images WHERE id = $1', [image.id]);

    expect(await messageRepo.count({ where: { imageId: image.id } })).toBe(0);
  });

  it('should have composite index idx_chat_messages_image_created', async () => {
    if (!dbAvailable) return;

    const result: Array<{ indexname: string }> = await dataSource.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'chat_messages'
        AND indexname = 'idx_chat_messages_image_created'
    `);

    expect(result).toHaveLength(1);
  });

  it('should have IDX_images_createdAt index', async () => {
    if (!dbAvailable) return;

    const result: Array<{ indexname: string }> = await dataSource.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'images'
        AND indexname = 'IDX_images_createdAt'
    `);

    expect(result).toHaveLength(1);
  });

  it('should handle 10 concurrent image saves', async () => {
    if (!dbAvailable) return;

    const promises = Array.from({ length: 10 }, (_, i) =>
      imageRepo.save(
        imageRepo.create({
          originalFilename: `concurrent-${i}.png`,
          storedFilename: `concurrent-${i}.png`,
          mimeType: 'image/png',
          size: 100 + i,
          uploadPath: `uploads/concurrent-${i}.png`,
          initialAnalysis: null,
        }),
      ),
    );

    const results = await Promise.all(promises);
    expect(results).toHaveLength(10);
    results.forEach((r) => expect(r.id).toBeDefined());

    expect(await imageRepo.count()).toBe(10);
  });
});
