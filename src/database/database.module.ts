import { Module, OnModuleDestroy } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Module({})
export class DatabaseModule implements OnModuleDestroy {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleDestroy(): Promise<void> {
    if (this.dataSource.isInitialized) {
      await this.dataSource.destroy();
    }
  }
}
