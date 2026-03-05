import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';
import { HistoryModule } from '@/history/history.module';
import { CleanupService } from './cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImageEntity, ChatMessageEntity]),
    HistoryModule,
  ],
  providers: [CleanupService],
})
export class CleanupModule {}
