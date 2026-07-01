import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { StorageService } from '../storage/storage.service';
import { ChannelsService } from './channels.service';
import { ChannelResponseDto } from './dto/channel-response.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import type { Channel } from './entities/channel.entity';
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import storageConfig from '../config/storage.config';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    @Inject(storageConfig.KEY)
    private readonly sConfig: ConfigType<typeof storageConfig>,
  ) {}

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get my channel' })
  @ApiOkResponse({ type: ChannelResponseDto })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getMyChannel(@CurrentUser() user: JwtPayload): Promise<Channel> {
    return this.channelsService.findByUserId(user.sub);
  }

  @Public()
  @Get(':nickname')
  @ApiOperation({ summary: 'Get channel by nickname (public page)' })
  @ApiOkResponse({ type: ChannelResponseDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getByNickname(@Param('nickname') nickname: string): Promise<Channel> {
    return this.channelsService.findByNickname(nickname);
  }

  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update my channel info (name, nickname, description)',
  })
  @ApiOkResponse({ type: ChannelResponseDto })
  @ApiResponse({
    status: 401,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  @ApiResponse({
    status: 409,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async updateMyChannel(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateChannelDto,
  ): Promise<Channel> {
    const channel = await this.channelsService.findByUserId(user.sub);
    return this.channelsService.updateChannel(channel.id, user.sub, dto);
  }

  @Post('me/thumbnail')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Upload channel thumbnail' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async uploadThumbnail(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<void> {
    const channel = await this.channelsService.findByUserId(user.sub);
    const key = `channels/${channel.id}/thumbnail.jpg`;
    await this.storageService.putObject(
      this.sConfig.bucketThumbnails,
      key,
      file.buffer,
      file.mimetype,
    );
    await this.channelsService.uploadThumbnail(channel.id, user.sub, key);
  }
}
