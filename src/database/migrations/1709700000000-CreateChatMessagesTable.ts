import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatMessagesTable1709700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "chat_messages" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "imageId" uuid NOT NULL,
        "role" varchar(20) NOT NULL,
        "content" text NOT NULL,
        "tokenCount" integer,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chat_messages" PRIMARY KEY ("id"),
        CONSTRAINT "FK_chat_messages_image" FOREIGN KEY ("imageId")
          REFERENCES "images"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_chat_messages_image_id" ON "chat_messages" ("imageId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_chat_messages_created_at" ON "chat_messages" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_chat_messages_image_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages"`);
  }
}
