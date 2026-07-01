import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '../comments/entities/comment.entity';
import { CommentLike } from './entities/comment-like.entity';
import { CommentLikesController } from './comment-likes.controller';
import { CommentLikesService } from './comment-likes.service';

@Module({
  imports: [TypeOrmModule.forFeature([CommentLike, Comment])],
  controllers: [CommentLikesController],
  providers: [CommentLikesService],
  exports: [CommentLikesService],
})
export class CommentLikesModule {}
