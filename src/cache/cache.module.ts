import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Keyv } from 'keyv';
import { KeyvCacheableMemory } from 'cacheable';

@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
      ttl: 300_000, // 5 minutes in ms (default)
      stores: [
        new Keyv({
          store: new KeyvCacheableMemory({
            lruSize: 100,
            useClone: true,
          }),
        }),
      ],
    }),
  ],
})
export class CacheModule {}
