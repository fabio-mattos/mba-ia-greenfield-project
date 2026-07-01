import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
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
import { ChannelsService } from '../channels/channels.service';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { PublishVideoDto, UpdateVideoDto } from './dto/update-video.dto';
import {
  ChannelVideosDto,
  PaginatedVideosDto,
  VideoCardDto,
  VideoResponseDto,
} from './dto/video-response.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videosService: VideosService,
    private readonly channelsService: ChannelsService,
  ) {}

  // ── Upload flow (Phase 03) ─────────────────────────────────────────────────

  @Post('upload/initiate')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initiate video upload',
    description:
      'Creates a draft video and returns a presigned PUT URL for direct upload to object storage.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      properties: {
        videoId: { type: 'string' },
        slug: { type: 'string' },
        uploadUrl: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateUploadDto,
  ): Promise<{ videoId: string; slug: string; uploadUrl: string }> {
    const channel = await this.channelsService.findByUserId(user.sub);
    return this.videosService.initiateUpload(channel.id, dto.original_filename);
  }

  @Post(':id/upload/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Confirm video upload completed',
    description:
      'Marks the video as ready for processing and enqueues the FFmpeg job.',
  })
  @ApiResponse({ status: 202, description: 'Processing enqueued' })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async confirmUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
  ): Promise<void> {
    const channel = await this.channelsService.findByUserId(user.sub);
    await this.videosService.confirmUpload(videoId, channel.id);
  }

  // ── Public video endpoints (Phase 03 / 05) ────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List public videos',
    description:
      'Returns paginated public videos with optional search and category filter.',
  })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'channel', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedVideosDto })
  async listVideos(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('channel') channel?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '12',
  ): Promise<PaginatedVideosDto> {
    return this.videosService.listPublicVideos({
      search,
      categorySlug: category,
      channelNickname: channel,
      page: parseInt(page, 10),
      limit: Math.min(parseInt(limit, 10), 50),
    });
  }

  @Public()
  @Get(':slug')
  @ApiOperation({
    summary: 'Get video by slug',
    description:
      'Returns video details. Works for both public and unlisted videos.',
  })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async findBySlug(
    @Param('slug') slug: string,
    @Request() req: { user?: JwtPayload },
  ): Promise<VideoResponseDto> {
    return this.videosService.findBySlug(slug, req.user?.sub ?? null);
  }

  @Public()
  @Get(':slug/stream')
  @ApiOperation({
    summary: 'Get streaming URL',
    description: 'Returns a presigned URL for video streaming.',
  })
  @ApiResponse({
    status: 200,
    schema: { properties: { url: { type: 'string' } } },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getStreamUrl(
    @Param('slug') slug: string,
    @Request() req: { user?: JwtPayload },
  ): Promise<{ url: string }> {
    const url = await this.videosService.getStreamUrl(
      slug,
      req.user?.sub ?? null,
    );
    return { url };
  }

  @Public()
  @Get(':slug/download')
  @ApiOperation({
    summary: 'Get download URL',
    description:
      'Returns a presigned download URL with Content-Disposition: attachment.',
  })
  @ApiResponse({
    status: 200,
    schema: { properties: { url: { type: 'string' } } },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getDownloadUrl(
    @Param('slug') slug: string,
    @Request() req: { user?: JwtPayload },
  ): Promise<{ url: string }> {
    const url = await this.videosService.getDownloadUrl(
      slug,
      req.user?.sub ?? null,
    );
    return { url };
  }

  @Public()
  @Post(':slug/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Increment view count',
    description: 'Records a view for the given video.',
  })
  @ApiResponse({ status: 204 })
  async incrementView(@Param('slug') slug: string): Promise<void> {
    await this.videosService.incrementViewCount(slug);
  }

  @Public()
  @Get(':slug/suggestions')
  @ApiOperation({
    summary: 'Get related video suggestions',
    description:
      'Returns videos from the same category, ordered by view count.',
  })
  @ApiOkResponse({ type: [VideoCardDto] })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getSuggestions(@Param('slug') slug: string): Promise<VideoCardDto[]> {
    return this.videosService.getSuggestionsBySlug(slug, 10);
  }

  // ── Authenticated video management (Phase 04) ─────────────────────────────

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update video info',
    description: 'Updates title, description, or category. Owner only.',
  })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiResponse({
    status: 403,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async updateVideo(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
    @Body() dto: UpdateVideoDto,
  ): Promise<VideoResponseDto> {
    const channel = await this.channelsService.findByUserId(user.sub);
    return this.videosService.updateVideo(videoId, channel.id, dto);
  }

  @Post(':id/publish')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Publish video',
    description:
      'Sets visibility and marks the video as published. Video must be in READY status.',
  })
  @ApiOkResponse({ type: VideoResponseDto })
  @ApiResponse({
    status: 403,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 422,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async publishVideo(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
    @Body() dto: PublishVideoDto,
  ): Promise<VideoResponseDto> {
    const channel = await this.channelsService.findByUserId(user.sub);
    return this.videosService.publishVideo(videoId, channel.id, dto);
  }

  @Post(':id/thumbnail')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Upload custom thumbnail',
    description: 'Replaces the auto-generated thumbnail. Max 5MB JPEG/PNG.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 403,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async uploadThumbnail(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<void> {
    const channel = await this.channelsService.findByUserId(user.sub);
    await this.videosService.uploadCustomThumbnail(
      videoId,
      channel.id,
      file.buffer,
      file.mimetype,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Delete video',
    description:
      'Permanently deletes the video and its files from storage. Owner only.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 403,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async deleteVideo(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
  ): Promise<void> {
    const channel = await this.channelsService.findByUserId(user.sub);
    await this.videosService.deleteVideo(videoId, channel.id);
  }

  // ── Channel videos panel ───────────────────────────────────────────────────

  @Get('channel/me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List my channel videos',
    description:
      "Returns all videos for the authenticated user's channel (management panel).",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: ChannelVideosDto })
  async listMyVideos(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<{ data: VideoResponseDto[]; total: number }> {
    const channel = await this.channelsService.findByUserId(user.sub);
    return this.videosService.listChannelVideos(
      channel.id,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
