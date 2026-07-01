import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class InitiateUploadDto {
  @ApiProperty({ example: 'my-video.mp4' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  original_filename: string;
}
