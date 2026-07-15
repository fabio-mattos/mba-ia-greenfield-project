import { ApiProperty } from '@nestjs/swagger';
import { VideoStatus } from '../entities/video.entity';

export class VideoResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: VideoStatus })
  status: VideoStatus;

  @ApiProperty({ required: false, nullable: true })
  durationInSeconds: number | null;

  @ApiProperty({ required: false, nullable: true })
  width: number | null;

  @ApiProperty({ required: false, nullable: true })
  height: number | null;

  @ApiProperty({ required: false, nullable: true })
  codec: string | null;

  @ApiProperty({ required: false, nullable: true })
  container: string | null;

  @ApiProperty({ required: false, nullable: true })
  bitrateKbps: number | null;

  @ApiProperty()
  createdAt: Date;
}
