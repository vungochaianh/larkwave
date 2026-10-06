import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { FriendsController } from './friends.controller';
import { MessagesController } from './messages.controller';

@Module({
  controllers: [FriendsController, MessagesController],
  providers: [SocialService],
})
export class SocialModule {}
