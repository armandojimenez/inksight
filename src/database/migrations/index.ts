import { CreateImagesTable1709500000000 } from './1709500000000-CreateImagesTable';

/**
 * Single barrel export for all migrations.
 * Both AppModule (TypeOrmModule.forRootAsync) and data-source.ts (CLI)
 * must reference the same list to prevent config drift.
 */
export const migrations = [CreateImagesTable1709500000000];
