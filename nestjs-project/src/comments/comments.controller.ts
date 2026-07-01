import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import {
  CommentResponseDto,
  PaginatedCommentsDto,
} from './dto/comment-response.dto';

@ApiTags('comments')
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Public()
  @Get('videos/:slug/comments')
  @ApiOperation({ summary: 'List comments for a video' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedCommentsDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async listComments(
    @Param('slug') slug: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<{ data: CommentResponseDto[]; total: number }> {
    return this.commentsService.listComments(
      slug,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Post('videos/:slug/comments')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Post a comment on a video' })
  @ApiResponse({ status: 201, type: CommentResponseDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 422,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async createComment(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponseDto> {
    return this.commentsService.createComment(
      user.sub,
      slug,
      dto.body,
      dto.parent_id,
    );
  }

  @Public()
  @Get('comments/:commentId/replies')
  @ApiOperation({ summary: 'List replies to a comment' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedCommentsDto })
  async listReplies(
    @Param('commentId') commentId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<{ data: CommentResponseDto[]; total: number }> {
    return this.commentsService.listReplies(
      commentId,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }

  @Delete('comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a comment (author only)' })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 403,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async deleteComment(
    @CurrentUser() user: JwtPayload,
    @Param('commentId') commentId: string,
  ): Promise<void> {
    await this.commentsService.deleteComment(user.sub, commentId);
  }
}
