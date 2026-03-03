import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { migrations } from './migrations';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: ['src/**/*.entity.ts'],
  migrations,
  synchronize: false,
});
