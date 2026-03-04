import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  OneToMany,
} from 'typeorm';
import { ChatMessageEntity } from '@/history/entities/chat-message.entity';

@Entity('images')
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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @VersionColumn()
  version!: number;

  @OneToMany(() => ChatMessageEntity, (msg) => msg.image)
  messages!: ChatMessageEntity[];
}
