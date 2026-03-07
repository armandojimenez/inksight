import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { migrations } from './migrations';
import { ImageEntity } from '../upload/entities/image.entity';
import { ChatMessageEntity } from '../history/entities/chat-message.entity';

dotenv.config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [ImageEntity, ChatMessageEntity],
  migrations,
  synchronize: false,
});
