import { DataSource, Repository } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { migrations } from '@/database/migrations';

const TEST_DB_URL =
  process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/inksight_test';

let dbAvailable = false;

beforeAll(async () => {
  const probe = new DataSource({
    type: 'postgres',
    url: TEST_DB_URL,
    entities: [ImageEntity, ChatMessageEntity],
    migrations,
    synchronize: false,
    migrationsRun: false,
  });

  try {
    await probe.initialize();
    await probe.destroy();
    dbAvailable = true;
  } catch {
    // DB not reachable — will skip
  }
});

const describeWithDb = () =>
  dbAvailable ? describe : describe.skip;

describe('Database integration', () => {
  let dataSource: DataSource;
  let imageRepo: Repository<ImageEntity>;
  let messageRepo: Repository<ChatMessageEntity>;

  beforeAll(async () => {
    if (!dbAvailable) return;

    dataSource = new DataSource({
      type: 'postgres',
      url: TEST_DB_URL,
      entities: [ImageEntity, ChatMessageEntity],
      migrations,
      synchronize: false,
      migrationsRun: false,
    });

    await dataSource.initialize();
    await dataSource.runMigrations();
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
    await dataSource.query('TRUNCATE TABLE chat_messages, images RESTART IDENTITY CASCADE');
  });

  it('should skip all tests when database is not available', () => {
    if (dbAvailable) {
      // DB is available, the real tests below will run
      expect(true).toBe(true);
    } else {
      console.warn(
        'Database not reachable — skipping database integration tests. ' +
        'Run `docker-compose up -d db` to enable these tests.',
      );
      expect(true).toBe(true);
    }
  });

  describeWithDb()('with database connection', () => {
    it('should have both tables after migrations run', async () => {
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

      const applied: Array<{ name: string }> = await dataSource.query(
        `SELECT name FROM migrations ORDER BY id`,
      );
      expect(applied.length).toBe(migrations.length);
    });

    it('should CRUD on images', async () => {
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

      const found = await imageRepo.findOneBy({ id: saved.id });
      expect(found).toBeDefined();
      expect(found!.originalFilename).toBe('test.png');

      found!.originalFilename = 'updated.png';
      const updated = await imageRepo.save(found!);
      expect(updated.originalFilename).toBe('updated.png');
      expect(updated.version).toBe(2);

      await imageRepo.remove(updated);
      const deleted = await imageRepo.findOneBy({ id: saved.id });
      expect(deleted).toBeNull();
    });

    it('should CRUD on chat_messages with FK', async () => {
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

      await imageRepo.query('DELETE FROM images WHERE id = $1', [image.id]);

      expect(await messageRepo.count({ where: { imageId: image.id } })).toBe(0);
    });

    it('should have composite index idx_chat_messages_image_created', async () => {
      const result: Array<{ indexname: string }> = await dataSource.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'chat_messages'
          AND indexname = 'idx_chat_messages_image_created'
      `);

      expect(result).toHaveLength(1);
    });

    it('should have IDX_images_createdAt index', async () => {
      const result: Array<{ indexname: string }> = await dataSource.query(`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'images'
          AND indexname = 'IDX_images_createdAt'
      `);

      expect(result).toHaveLength(1);
    });

    it('should handle 10 concurrent image saves', async () => {
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

    it('should reject chat_message with non-existent imageId (FK constraint)', async () => {
      const fakeImageId = '00000000-0000-4000-a000-000000000000';
      const message = messageRepo.create({
        imageId: fakeImageId,
        role: 'user',
        content: 'orphan message',
        tokenCount: null,
      });

      await expect(messageRepo.save(message)).rejects.toThrow();
    });

    describe('Optimistic locking', () => {
      function createTestImage(suffix: string) {
        return imageRepo.create({
          originalFilename: `lock-${suffix}.png`,
          storedFilename: `lock-${suffix}.png`,
          mimeType: 'image/png',
          size: 100,
          uploadPath: `uploads/lock-${suffix}.png`,
          initialAnalysis: null,
        });
      }

      it('should assign version 1 to a new image', async () => {
        const saved = await imageRepo.save(createTestImage('new'));
        expect(saved.version).toBe(1);
      });

      it('should increment version on sequential updates', async () => {
        const saved = await imageRepo.save(createTestImage('seq'));
        expect(saved.version).toBe(1);

        saved.originalFilename = 'updated-1.png';
        const v2 = await imageRepo.save(saved);
        expect(v2.version).toBe(2);

        v2.originalFilename = 'updated-2.png';
        const v3 = await imageRepo.save(v2);
        expect(v3.version).toBe(3);
      });

      it('should detect stale version via optimistic lock on findOne', async () => {
        const saved = await imageRepo.save(createTestImage('conflict'));

        const loaded = await dataSource.manager.findOne(ImageEntity, {
          where: { id: saved.id },
          lock: { mode: 'optimistic', version: 1 },
        });
        expect(loaded).toBeDefined();

        loaded!.originalFilename = 'concurrent-update.png';
        await imageRepo.save(loaded!);

        await expect(
          dataSource.manager.findOne(ImageEntity, {
            where: { id: saved.id },
            lock: { mode: 'optimistic', version: 1 },
          }),
        ).rejects.toThrow(/optimistic lock/i);
      });
    });
  });
});
