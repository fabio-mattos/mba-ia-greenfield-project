import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '../comments/entities/comment.entity';
import { CommentNotFoundException } from '../common/exceptions/domain.exception';
import { CommentLike, CommentLikeType } from './entities/comment-like.entity';

@Injectable()
export class CommentLikesService {
  constructor(
    @InjectRepository(CommentLike)
    private readonly commentLikeRepository: Repository<CommentLike>,
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
  ) {}

  async upsertLike(
    userId: string,
    commentId: string,
    type: CommentLikeType,
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new CommentNotFoundException();
    }

    await this.commentLikeRepository
      .createQueryBuilder()
      .insert()
      .into(CommentLike)
      .values({ comment_id: commentId, user_id: userId, type })
      .orUpdate(['type'], ['comment_id', 'user_id'])
      .execute();

    return this.getCounts(commentId, userId);
  }

  async removeLike(
    userId: string,
    commentId: string,
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new CommentNotFoundException();
    }

    await this.commentLikeRepository.delete({
      comment_id: commentId,
      user_id: userId,
    });

    return { ...(await this.getCounts(commentId, null)), userLike: null };
  }

  async getLikeStatus(
    commentId: string,
    userId: string | null,
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new CommentNotFoundException();
    }

    return this.getCounts(commentId, userId);
  }

  private async getCounts(
    commentId: string,
    userId: string | null,
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    const [likes, dislikes, userLikeRecord] = await Promise.all([
      this.commentLikeRepository.count({
        where: { comment_id: commentId, type: CommentLikeType.LIKE },
      }),
      this.commentLikeRepository.count({
        where: { comment_id: commentId, type: CommentLikeType.DISLIKE },
      }),
      userId
        ? this.commentLikeRepository.findOne({
            where: { comment_id: commentId, user_id: userId },
          })
        : Promise.resolve(null),
    ]);

    return { likes, dislikes, userLike: userLikeRecord?.type ?? null };
  }
}
