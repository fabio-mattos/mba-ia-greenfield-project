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
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { LikeStatusDto } from './dto/like-status.dto';
import { LikeType } from './entities/video-like.entity';
import { VideoLikesService } from './video-likes.service';

@ApiTags('videos')
@Controller('videos')
export class VideoLikesController {
  constructor(private readonly videoLikesService: VideoLikesService) {}

  @Get(':slug/like-status')
  @Public()
  @ApiOperation({ summary: 'Get like/dislike counts for a video' })
  @ApiOkResponse({ type: LikeStatusDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getLikeStatus(
    @Param('slug') slug: string,
    @Request() req: { user?: JwtPayload },
  ): Promise<{ likes: number; dislikes: number; userLike: LikeType | null }> {
    const userId = req.user?.sub ?? null;
    return this.videoLikesService.getLikeStatus(slug, userId);
  }

  @Post(':slug/like')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Like a video' })
  @ApiResponse({ status: 201, type: LikeStatusDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async like(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<{ likes: number; dislikes: number; userLike: LikeType | null }> {
    return this.videoLikesService.upsertLike(user.sub, slug, LikeType.LIKE);
  }

  @Post(':slug/dislike')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dislike a video' })
  @ApiResponse({ status: 201, type: LikeStatusDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async dislike(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<{ likes: number; dislikes: number; userLike: LikeType | null }> {
    return this.videoLikesService.upsertLike(user.sub, slug, LikeType.DISLIKE);
  }

  @Delete(':slug/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Remove like/dislike from a video' })
  @ApiResponse({ status: 204 })
  async removeLike(
    @CurrentUser() user: JwtPayload,
    @Param('slug') slug: string,
  ): Promise<void> {
    await this.videoLikesService.removeLike(user.sub, slug);
  }
}
