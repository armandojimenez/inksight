import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateInitialAnalysisToJsonb1709600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-condition: all existing rows must have NULL initialAnalysis
    // (no AI service existed before this migration). Fail fast if violated.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "images" WHERE "initialAnalysis" IS NOT NULL) THEN
          RAISE EXCEPTION 'Pre-condition failed: initialAnalysis contains non-NULL text rows that must be reviewed before migration';
        END IF;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE "images"
        ALTER COLUMN "initialAnalysis" TYPE jsonb
        USING "initialAnalysis"::jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "images"
        ALTER COLUMN "initialAnalysis" TYPE text
        USING "initialAnalysis"::text
    `);
  }
}
