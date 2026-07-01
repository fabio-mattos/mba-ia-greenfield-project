import { ApiProperty } from '@nestjs/swagger';

export class SubscriptionStatusDto {
  @ApiProperty() isSubscribed: boolean;
  @ApiProperty() subscriberCount: number;
}
