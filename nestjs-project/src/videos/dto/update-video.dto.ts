import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { VideoVisibility } from '../entities/video.entity';

export class UpdateVideoDto {
  @ApiPropertyOptional({ example: 'My awesome video' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ example: 'A description of the video' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  category_id?: string;
}

export class PublishVideoDto {
  @ApiPropertyOptional({ enum: VideoVisibility })
  @IsEnum(VideoVisibility)
  visibility: VideoVisibility;
}
