import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from 'typeorm';
import { ImageEntity } from '@/upload/entities/image.entity';

@Entity('chat_messages')
@Index('idx_chat_messages_image_created', ['imageId', 'createdAt'])
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  imageId!: string;

  @Column({ type: 'varchar', length: 20 })
  role!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'integer', nullable: true })
  tokenCount!: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => ImageEntity, (img) => img.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'imageId' })
  image!: ImageEntity;
}
