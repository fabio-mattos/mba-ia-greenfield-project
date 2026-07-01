import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { VideoStatus, VideoVisibility } from '../entities/video.entity';

export class ChannelSummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() nickname: string;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail_url: string | null;
}

export class CategorySummaryDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
}

export class VideoResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiPropertyOptional({ type: String, nullable: true }) title: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;
  @ApiProperty({ enum: ['draft', 'processing', 'ready', 'failed'] })
  status: VideoStatus;
  @ApiPropertyOptional({ enum: ['public', 'unlisted'], nullable: true })
  visibility: VideoVisibility | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  duration_seconds: number | null;
  @ApiProperty() view_count: number;
  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail_url: string | null;
  @ApiProperty() channel: ChannelSummaryDto;
  @ApiPropertyOptional({ type: CategorySummaryDto, nullable: true })
  category: CategorySummaryDto | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  published_at: Date | null;
  @ApiProperty() created_at: Date;
}

export class VideoCardDto {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  thumbnail_url: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  duration_seconds: number | null;
  @ApiProperty() view_count: number;
  @ApiProperty() published_at: Date;
  @ApiProperty() channel: ChannelSummaryDto;
  @ApiPropertyOptional({ type: CategorySummaryDto, nullable: true })
  category: CategorySummaryDto | null;
}

export class PaginatedVideosDto {
  @ApiProperty({ type: [VideoCardDto] }) data: VideoCardDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total_pages: number;
}

export class ChannelVideosDto {
  @ApiProperty({ type: [VideoResponseDto] }) data: VideoResponseDto[];
  @ApiProperty() total: number;
}
