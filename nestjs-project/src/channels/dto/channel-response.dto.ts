import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ChannelResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() nickname: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail_key: string | null;
  @ApiProperty() user_id: string;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}
