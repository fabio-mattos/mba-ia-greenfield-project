import {
  IsIn,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class InitiateUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalFileName: string;

  /** Upper bound (10GB) is enforced as a domain rule (VIDEO_FILE_TOO_LARGE), not a validation error. */
  @IsPositive()
  fileSizeBytes: number;

  /** Must be a video/* MIME type (e.g. video/mp4). */
  @IsString()
  @IsIn(
    [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-matroska',
      'video/mpeg',
    ],
    { message: 'mimeType must be a supported video format' },
  )
  mimeType: string;
}
