import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import {
  CommentNestingNotAllowedException,
  CommentNotFoundException,
  NotCommentAuthorException,
  VideoNotFoundException,
} from '../common/exceptions/domain.exception';
import { Video } from '../videos/entities/video.entity';
import { CommentResponseDto } from './dto/comment-response.dto';
import { Comment } from './entities/comment.entity';

function toCommentResponseDto(comment: Comment): CommentResponseDto {
  return {
    id: comment.id,
    body: comment.body,
    author: { id: comment.author.id, email: comment.author.email },
    parent_id: comment.parent_id,
    deleted: comment.deleted,
    created_at: comment.created_at,
    updated_at: comment.updated_at,
  };
}

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
  ) {}

  async createComment(
    userId: string,
    videoSlug: string,
    body: string,
    parentId?: string,
  ): Promise<CommentResponseDto> {
    const video = await this.videoRepository.findOne({
      where: { slug: videoSlug },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }

    if (parentId) {
      const parent = await this.commentRepository.findOne({
        where: { id: parentId, video_id: video.id },
      });
      if (!parent) {
        throw new CommentNotFoundException();
      }
      if (parent.parent_id !== null) {
        throw new CommentNestingNotAllowedException();
      }
    }

    const comment = await this.commentRepository.save(
      this.commentRepository.create({
        body,
        video_id: video.id,
        author_id: userId,
        parent_id: parentId ?? null,
      }),
    );

    const saved = (await this.commentRepository.findOne({
      where: { id: comment.id },
      relations: ['author'],
    })) as Comment;

    return toCommentResponseDto(saved);
  }

  async listComments(
    videoSlug: string,
    page: number,
    limit: number,
  ): Promise<{ data: CommentResponseDto[]; total: number }> {
    const video = await this.videoRepository.findOne({
      where: { slug: videoSlug },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }

    const [comments, total] = await this.commentRepository.findAndCount({
      where: { video_id: video.id, parent_id: IsNull(), deleted: false },
      relations: ['author'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: comments.map(toCommentResponseDto), total };
  }

  async listReplies(
    commentId: string,
    page: number,
    limit: number,
  ): Promise<{ data: CommentResponseDto[]; total: number }> {
    const [comments, total] = await this.commentRepository.findAndCount({
      where: { parent_id: commentId, deleted: false },
      relations: ['author'],
      order: { created_at: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data: comments.map(toCommentResponseDto), total };
  }

  async deleteComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });
    if (!comment) {
      throw new CommentNotFoundException();
    }
    if (comment.author_id !== userId) {
      throw new NotCommentAuthorException();
    }

    await this.commentRepository.update(commentId, {
      deleted: true,
      body: '[comentário removido]',
    });
  }
}
