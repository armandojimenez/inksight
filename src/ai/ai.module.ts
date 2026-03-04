import { Module } from '@nestjs/common';
import { AI_SERVICE_TOKEN } from '@/common/constants';
import { MockAiService } from './mock-ai.service';

@Module({
  providers: [
    {
      provide: AI_SERVICE_TOKEN,
      useClass: MockAiService,
    },
  ],
  exports: [AI_SERVICE_TOKEN],
})
export class AiModule {}
