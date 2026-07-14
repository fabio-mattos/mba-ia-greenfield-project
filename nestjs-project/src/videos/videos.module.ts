import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { StringValue } from 'ms';
import authConfig from '../config/auth.config';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ChannelsModule } from '../channels/channels.module';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { Video } from './entities/video.entity';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    ChannelsModule,
    StorageModule,
    QueueModule,
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (cfg: ConfigType<typeof authConfig>) => ({
        secret: cfg.jwtSecret,
        signOptions: { expiresIn: cfg.jwtAccessExpiration as StringValue },
      }),
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService, OptionalJwtAuthGuard],
  exports: [TypeOrmModule, VideosService],
})
export class VideosModule {}
