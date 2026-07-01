import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Comment } from '../../comments/entities/comment.entity';
import { User } from '../../users/entities/user.entity';

export enum CommentLikeType {
  LIKE = 'like',
  DISLIKE = 'dislike',
}

@Entity('comment_likes')
@Unique(['comment_id', 'user_id'])
export class CommentLike {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  comment_id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'enum', enum: CommentLikeType })
  type: CommentLikeType;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE' })
  comment: Comment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;
}
