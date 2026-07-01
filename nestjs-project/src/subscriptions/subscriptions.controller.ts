import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
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
import type { Channel } from '../channels/entities/channel.entity';
import { ApiErrorEnvelope } from '../common/openapi/api-error-envelope.dto';
import { PaginatedChannelsDto } from './dto/paginated-channels.dto';
import { SubscriptionStatusDto } from './dto/subscription-status.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('channels/:nickname/subscribe')
  @Public()
  @ApiOperation({ summary: 'Get subscription status for a channel' })
  @ApiOkResponse({ type: SubscriptionStatusDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async getStatus(
    @Param('nickname') nickname: string,
    @Request() req: { user?: JwtPayload },
  ): Promise<{ isSubscribed: boolean; subscriberCount: number }> {
    const userId = req.user?.sub ?? null;
    return this.subscriptionsService.getSubscriptionStatus(userId, nickname);
  }

  @Post('channels/:nickname/subscribe')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Subscribe to a channel' })
  @ApiResponse({ status: 201, type: SubscriptionStatusDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async subscribe(
    @CurrentUser() user: JwtPayload,
    @Param('nickname') nickname: string,
  ): Promise<{ isSubscribed: boolean; subscriberCount: number }> {
    return this.subscriptionsService.subscribe(user.sub, nickname);
  }

  @Delete('channels/:nickname/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Unsubscribe from a channel' })
  @ApiOkResponse({ type: SubscriptionStatusDto })
  @ApiResponse({
    status: 404,
    schema: { $ref: getSchemaPath(ApiErrorEnvelope) },
  })
  async unsubscribe(
    @CurrentUser() user: JwtPayload,
    @Param('nickname') nickname: string,
  ): Promise<{ isSubscribed: boolean; subscriberCount: number }> {
    return this.subscriptionsService.unsubscribe(user.sub, nickname);
  }

  @Get('channels/me/subscriptions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List channels I am subscribed to' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedChannelsDto })
  async listSubscriptions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<{ data: Channel[]; total: number }> {
    return this.subscriptionsService.listSubscribedChannels(
      user.sub,
      parseInt(page, 10),
      parseInt(limit, 10),
    );
  }
}
