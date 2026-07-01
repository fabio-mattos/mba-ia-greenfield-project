import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LikeType } from '../entities/video-like.entity';

export class LikeStatusDto {
  @ApiProperty() likes: number;
  @ApiProperty() dislikes: number;
  @ApiPropertyOptional({ enum: LikeType, nullable: true })
  userLike: LikeType | null;
}
