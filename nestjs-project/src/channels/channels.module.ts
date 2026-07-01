import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import storageConfig from '../config/storage.config';
import { StorageModule } from '../storage/storage.module';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel]),
    ConfigModule.forFeature(storageConfig),
    StorageModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
  exports: [TypeOrmModule, ChannelsService],
})
export class ChannelsModule {}
