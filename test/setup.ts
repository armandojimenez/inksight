import * as dotenv from 'dotenv';

// Load .env so DATABASE_URL (and other vars) are available for integration/e2e tests.
// dotenv will NOT override vars already set in the shell environment.
dotenv.config();

process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = 'test-uploads';
process.env.MAX_FILE_SIZE = '16777216';
