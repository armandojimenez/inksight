import { MigrationInterface, QueryRunner } from 'typeorm';

export class MigrateInitialAnalysisToJsonb1709600000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
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
