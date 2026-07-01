import { ApiProperty } from '@nestjs/swagger';
import { ChannelResponseDto } from '../../channels/dto/channel-response.dto';

export class PaginatedChannelsDto {
  @ApiProperty({ type: [ChannelResponseDto] }) data: ChannelResponseDto[];
  @ApiProperty() total: number;
}
