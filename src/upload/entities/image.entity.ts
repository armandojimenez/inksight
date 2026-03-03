import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

@Entity('images')
export class ImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  originalFilename!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255, unique: true })
  storedFilename!: string;

  @Column({ type: 'varchar', length: 50 })
  mimeType!: string;

  @Column({ type: 'integer' })
  size!: number;

  @Column({ type: 'varchar', length: 500 })
  uploadPath!: string;

  @Column({ type: 'text', nullable: true, default: null })
  initialAnalysis!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @VersionColumn()
  version!: number;
}
