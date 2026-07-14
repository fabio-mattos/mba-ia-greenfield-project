import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { InitiateUploadResponseDto } from './dto/initiate-upload-response.dto';
import { UploadPartUrlResponseDto } from './dto/upload-part-url-response.dto';
import { VideoResponseDto } from './dto/video-response.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Post('upload/initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Initiate a video upload',
    description:
      'Pre-registers the video as a draft and starts a multipart upload against object storage. Returns the video id and the storage upload id used to request presigned part URLs.',
  })
  @ApiResponse({
    status: 201,
    description: 'Upload initiated',
    type: InitiateUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or file exceeds the 10GB limit',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async initiateUpload(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateUploadDto,
  ): Promise<InitiateUploadResponseDto> {
    return this.videosService.initiateUpload(user.sub, dto);
  }

  @Post(':id/upload/parts/:partNumber')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get a presigned URL for one multipart upload part',
    description:
      'Returns a presigned URL the client uploads this part directly to object storage — the file bytes never pass through the API.',
  })
  @ApiResponse({
    status: 201,
    description: 'Presigned part URL',
    type: UploadPartUrlResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the current user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Upload is not in progress for this video',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @HttpCode(HttpStatus.CREATED)
  async getUploadPartUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
    @Param('partNumber', ParseIntPipe) partNumber: number,
  ): Promise<UploadPartUrlResponseDto> {
    const url = await this.videosService.getUploadPartUrl(
      user.sub,
      videoId,
      partNumber,
    );
    return { url };
  }

  @Post(':id/upload/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Complete a video upload',
    description:
      'Finalizes the multipart upload in object storage, flips the video to processing, and enqueues automatic processing (metadata extraction + thumbnail generation).',
  })
  @ApiResponse({
    status: 204,
    description: 'Upload completed; processing enqueued',
  })
  @ApiResponse({
    status: 404,
    description: 'Video not found or not owned by the current user',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Upload has already been completed',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async completeUpload(
    @CurrentUser() user: JwtPayload,
    @Param('id') videoId: string,
    @Body() dto: CompleteUploadDto,
  ): Promise<void> {
    return this.videosService.completeUpload(user.sub, videoId, dto.parts);
  }

  @Get(':id')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get video details',
    description:
      'Public once the video is ready. Before that (draft/processing/failed), only the owning channel can see it — any other viewer gets 404.',
  })
  @ApiResponse({
    status: 200,
    description: 'Video details',
    type: VideoResponseDto,
  })
  @ApiResponse({
    status: 404,
    description:
      'Video not found, or not ready and the viewer is not the owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async findOne(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') videoId: string,
  ): Promise<VideoResponseDto> {
    return this.videosService.findForViewer(videoId, user?.sub);
  }

  @Get(':id/stream')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Redirect()
  @ApiOperation({
    summary: 'Stream a video',
    description:
      'Redirects to a short-lived presigned URL for inline playback. Requires the video to be ready — 409 otherwise, even for the owner.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the video stream' })
  @ApiResponse({
    status: 404,
    description:
      'Video not found, or not ready and the viewer is not the owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready for playback yet',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async stream(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') videoId: string,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.videosService.getStreamUrl(videoId, user?.sub);
    return { url, statusCode: HttpStatus.FOUND };
  }

  @Get(':id/download')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Redirect()
  @ApiOperation({
    summary: 'Download a video',
    description:
      'Redirects to a short-lived presigned URL that forces a file download. Requires the video to be ready — 409 otherwise, even for the owner.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the video download' })
  @ApiResponse({
    status: 404,
    description:
      'Video not found, or not ready and the viewer is not the owner',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    description: 'Video is not ready for download yet',
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async download(
    @CurrentUser() user: JwtPayload | undefined,
    @Param('id') videoId: string,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.videosService.getDownloadUrl(videoId, user?.sub);
    return { url, statusCode: HttpStatus.FOUND };
  }
}
