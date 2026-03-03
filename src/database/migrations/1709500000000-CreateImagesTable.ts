import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImagesTable1709500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "images" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "originalFilename" varchar(255) NOT NULL,
        "storedFilename" varchar(255) NOT NULL,
        "mimeType" varchar(50) NOT NULL,
        "size" integer NOT NULL,
        "uploadPath" varchar(500) NOT NULL,
        "initialAnalysis" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_images" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_images_storedFilename" UNIQUE ("storedFilename")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "images"`);
  }
}
