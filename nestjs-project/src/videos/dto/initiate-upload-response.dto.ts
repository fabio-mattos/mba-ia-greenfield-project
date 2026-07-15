import { ApiProperty } from '@nestjs/swagger';

export class InitiateUploadResponseDto {
  @ApiProperty({ format: 'uuid' })
  videoId: string;

  @ApiProperty()
  uploadId: string;
}
