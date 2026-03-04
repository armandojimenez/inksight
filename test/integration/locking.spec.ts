import { DataSource, Repository } from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { migrations } from '@/database/migrations';

const TEST_DB_URL =
  process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/inksight_test';

describe('Optimistic locking', () => {
  let dataSource: DataSource;
  let imageRepo: Repository<ImageEntity>;
  let dbAvailable = false;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: TEST_DB_URL,
      entities: [ImageEntity, ChatMessageEntity],
      migrations,
      synchronize: false,
      migrationsRun: true,
    });

    try {
      await dataSource.initialize();
      dbAvailable = true;
    } catch {
      console.warn('Database not reachable — skipping locking tests');
      return;
    }

    imageRepo = dataSource.getRepository(ImageEntity);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    if (!dbAvailable) return;
    await dataSource.query('DELETE FROM chat_messages');
    await dataSource.query('DELETE FROM images');
  });

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
    if (!dbAvailable) return;

    const saved = await imageRepo.save(createTestImage('new'));
    expect(saved.version).toBe(1);
  });

  it('should increment version on sequential updates', async () => {
    if (!dbAvailable) return;

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
    if (!dbAvailable) return;

    const saved = await imageRepo.save(createTestImage('conflict'));

    // Load entity at version 1
    const loaded = await dataSource.manager.findOne(ImageEntity, {
      where: { id: saved.id },
      lock: { mode: 'optimistic', version: 1 },
    });
    expect(loaded).toBeDefined();

    // Simulate concurrent update: increment version in DB
    loaded!.originalFilename = 'concurrent-update.png';
    await imageRepo.save(loaded!);

    // Now DB has version 2. Trying to load with expected version 1 should throw.
    await expect(
      dataSource.manager.findOne(ImageEntity, {
        where: { id: saved.id },
        lock: { mode: 'optimistic', version: 1 },
      }),
    ).rejects.toThrow(/optimistic lock/i);
  });
});
