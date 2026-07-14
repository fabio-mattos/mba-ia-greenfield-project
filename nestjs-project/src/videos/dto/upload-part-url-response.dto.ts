import { ApiProperty } from '@nestjs/swagger';

export class UploadPartUrlResponseDto {
  @ApiProperty()
  url: string;
}
