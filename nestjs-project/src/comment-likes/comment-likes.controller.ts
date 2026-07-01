import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CommentLikeType } from './entities/comment-like.entity';
import { CommentLikesService } from './comment-likes.service';

@ApiTags('comments')
@Controller('comments')
export class CommentLikesController {
  constructor(private readonly commentLikesService: CommentLikesService) {}

  @Get(':commentId/like-status')
  @Public()
  @ApiOperation({ summary: 'Get like/dislike counts for a comment' })
  @ApiResponse({
    status: 200,
    schema: {
      properties: {
        likes: { type: 'number' },
        dislikes: { type: 'number' },
        userLike: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getLikeStatus(
    @Param('commentId') commentId: string,
    @Request() req: { user?: JwtPayload },
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    const userId = req.user?.sub ?? null;
    return this.commentLikesService.getLikeStatus(commentId, userId);
  }

  @Post(':commentId/like')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Like a comment' })
  @ApiResponse({
    status: 201,
    schema: {
      properties: {
        likes: { type: 'number' },
        dislikes: { type: 'number' },
        userLike: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async like(
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    return this.commentLikesService.upsertLike(
      user.sub,
      commentId,
      CommentLikeType.LIKE,
    );
  }

  @Post(':commentId/dislike')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dislike a comment' })
  @ApiResponse({
    status: 201,
    schema: {
      properties: {
        likes: { type: 'number' },
        dislikes: { type: 'number' },
        userLike: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async dislike(
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{
    likes: number;
    dislikes: number;
    userLike: CommentLikeType | null;
  }> {
    return this.commentLikesService.upsertLike(
      user.sub,
      commentId,
      CommentLikeType.DISLIKE,
    );
  }

  @Delete(':commentId/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove like/dislike from a comment' })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async removeLike(
    @Param('commentId') commentId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.commentLikesService.removeLike(user.sub, commentId);
  }
}
