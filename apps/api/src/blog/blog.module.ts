import { Module } from '@nestjs/common';
import { AdminBlogController, BlogController } from './blog.controller';
import { BlogService } from './blog.service';
import { BlogCommentService } from './blog-comment.service';
import { BlogCommentController } from './blog-comment.controller';

@Module({
  controllers: [BlogController, AdminBlogController, BlogCommentController],
  providers: [BlogService, BlogCommentService],
  // MarketingScheduleService cần nó để tự đăng bài sinh theo lịch.
  exports: [BlogService],
})
export class BlogModule {}
