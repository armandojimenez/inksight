import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { AiModule } from '@/ai/ai.module';
import { HistoryModule } from '@/history/history.module';
import { ChatController } from './chat.controller';
import { StreamController } from './stream.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity]), AiModule, HistoryModule],
  controllers: [ChatController, StreamController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
