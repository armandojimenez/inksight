import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceIndexesWithComposite1709800000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_chat_messages_image_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_chat_messages_created_at"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chat_messages_image_created" ON "chat_messages" ("imageId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_chat_messages_image_created"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chat_messages_image_id" ON "chat_messages" ("imageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chat_messages_created_at" ON "chat_messages" ("createdAt")`,
    );
  }
}
