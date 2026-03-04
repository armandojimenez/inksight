import { CreateImagesTable1709500000000 } from './1709500000000-CreateImagesTable';
import { MigrateInitialAnalysisToJsonb1709600000000 } from './1709600000000-MigrateInitialAnalysisToJsonb';
import { CreateChatMessagesTable1709700000000 } from './1709700000000-CreateChatMessagesTable';
import { ReplaceIndexesWithComposite1709800000000 } from './1709800000000-ReplaceIndexesWithComposite';

/**
 * Single barrel export for all migrations.
 * Both AppModule (TypeOrmModule.forRootAsync) and data-source.ts (CLI)
 * must reference the same list to prevent config drift.
 */
export const migrations = [
  CreateImagesTable1709500000000,
  MigrateInitialAnalysisToJsonb1709600000000,
  CreateChatMessagesTable1709700000000,
  ReplaceIndexesWithComposite1709800000000,
];
