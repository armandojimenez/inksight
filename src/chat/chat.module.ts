import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';
import { AiModule } from '@/ai/ai.module';
import { HistoryModule } from '@/history/history.module';
import { ChatController } from './chat.controller';
import { StreamController } from './stream.controller';
import { ChatService } from './chat.service';
import { ConcurrentSseGuard } from '@/common/guards/concurrent-sse.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ImageEntity]), AiModule, HistoryModule],
  controllers: [ChatController, StreamController],
  providers: [ChatService, ConcurrentSseGuard],
  exports: [ChatService],
})
export class ChatModule {}
