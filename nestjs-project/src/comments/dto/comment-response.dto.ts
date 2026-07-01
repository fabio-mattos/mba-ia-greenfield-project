import { ApiProperty } from '@nestjs/swagger';

export class CommentAuthorDto {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
}

export class CommentResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() body: string;
  @ApiProperty({ type: CommentAuthorDto }) author: CommentAuthorDto;
  @ApiProperty({ nullable: true, type: String }) parent_id: string | null;
  @ApiProperty() deleted: boolean;
  @ApiProperty() created_at: Date;
  @ApiProperty() updated_at: Date;
}

export class PaginatedCommentsDto {
  @ApiProperty({ type: [CommentResponseDto] }) data: CommentResponseDto[];
  @ApiProperty() total: number;
}
