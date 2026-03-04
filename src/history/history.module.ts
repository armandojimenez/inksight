import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { HistoryService } from './history.service';

@Module({
  imports: [TypeOrmModule.forFeature([ChatMessageEntity])],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
