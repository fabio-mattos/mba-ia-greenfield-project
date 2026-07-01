import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateChannelDto {
  @ApiPropertyOptional({ example: 'My Channel' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: 'mychannel' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional({ example: 'My channel description' })
  @IsOptional()
  @IsString()
  description?: string;
}
