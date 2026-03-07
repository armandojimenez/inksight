import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';

@Entity('images')
@Index('IDX_images_createdAt', ['createdAt'])
export class ImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  originalFilename!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  storedFilename!: string;

  @Column({ type: 'varchar', length: 50 })
  mimeType!: string;

  @Column({ type: 'integer' })
  size!: number;

  @Column({ type: 'varchar', length: 500 })
  uploadPath!: string;

  @Column({ type: 'jsonb', nullable: true, default: null })
  initialAnalysis!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Optimistic locking — TypeORM auto-increments on save() and includes
   * `WHERE version = N` in UPDATE queries. If two concurrent operations
   * load the same row and both try to save, the second save fails with
   * OptimisticLockVersionMismatchError. Exercised by PATCH /api/images/:imageId/reanalyze
   * which re-runs AI analysis with a version-checked save.
   */
  @VersionColumn()
  version!: number;

  @OneToMany(() => ChatMessageEntity, (msg) => msg.image)
  messages!: ChatMessageEntity[];
}
