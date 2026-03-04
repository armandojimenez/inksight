import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
      ttl: 300_000, // 5 minutes in ms (default)
      max: 100, // LRU eviction after 100 items
    }),
  ],
})
export class CacheModule {}
