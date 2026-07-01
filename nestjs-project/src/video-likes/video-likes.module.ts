import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from '../videos/entities/video.entity';
import { VideoLike } from './entities/video-like.entity';
import { VideoLikesController } from './video-likes.controller';
import { VideoLikesService } from './video-likes.service';

@Module({
  imports: [TypeOrmModule.forFeature([VideoLike, Video])],
  controllers: [VideoLikesController],
  providers: [VideoLikesService],
  exports: [VideoLikesService],
})
export class VideoLikesModule {}
