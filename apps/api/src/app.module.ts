import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { IpThrottlerGuard } from './common/guards/ip-throttler.guard';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from './config/config.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MeModule } from './me/me.module';
import { AppsModule } from './apps/apps.module';
import { BuildsModule } from './builds/builds.module';
import { GitModule } from './git/git.module';
import { CommunityModule } from './community/community.module';
import { StorageModule } from './storage/storage.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { EngineModule } from './engine/engine.module';
import { EventsModule } from './events/events.module';
import { SettingsModule } from './settings/settings.module';
import { TemplatesModule } from './templates/templates.module';
import { StoreModule } from './store/store.module';
import { HealthModule } from './health/health.module';
import { ServerDeployModule } from './server-deploy/server-deploy.module';
import { LarkBackupModule } from './lark-backup/lark-backup.module';
import { LarkHostedModule } from './lark-hosted/lark-hosted.module';
import { LarkShareModule } from './lark-share/lark-share.module';
import { LarkGrantModule } from './lark-grant/lark-grant.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { PublicModule } from './public/public.module';
import { SocialModule } from './social/social.module';
import { SkillsModule } from './skills/skills.module';
import { ScheduledModule } from './scheduled/scheduled.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { UploadsModule } from './uploads/uploads.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AutomationsModule } from './automations/automations.module';
import { FeedbackModule } from './feedback/feedback.module';
import { BlogModule } from './blog/blog.module';
import { AssistantModule } from './assistant/assistant.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AiKeysModule } from './ai-keys/ai-keys.module';
import { AppAccessModule } from './common/app-access.module';
import { AgentModule } from './agent/agent.module';
import { MaicModule } from './maic/maic.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { RunnerTelemetryModule } from './runner-telemetry/runner-telemetry.module';
import { ClaudeModule } from './claude/claude.module';
import { MediaModule } from './media/media.module';
import { CategoryModule } from './category/category.module';
import { DeliveryModule } from './delivery/delivery.module';
import { VideoModule } from './video/video.module';
import { PictureModule } from './picture/picture.module';
import { MakeBlogModule } from './makeblog/makeblog.module';
import { MarketingModule } from './marketing/marketing.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    // Per-IP (see IpThrottlerGuard — the tracker, not this config, is what made it per-IP).
    // 600/min is deliberately generous: a real SPA session fans out a lot of parallel calls on
    // load, and the point of this limit is to make bulk scraping and credential stuffing
    // expensive, not to police an enthusiastic user. Tighter per-route limits live on the
    // routes that actually cost money (see the auth + public-assistant limiters).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 600 }]),
    // Infrastructure (global)
    PrismaModule,
    ConfigModule,
    AppAccessModule,
    AuditModule,
    MailModule,
    BillingModule,
    CommunityModule,
    StorageModule,
    // Engine
    EventsModule,
    NotificationsModule,
    AiKeysModule,
    EngineModule,
    PipelineModule,
    // Domain
    AuthModule,
    UsersModule,
    MeModule,
    AppsModule,
    BuildsModule,
    GitModule,
    PaymentsModule,
    ReportsModule,
    DeploymentsModule,
    SettingsModule,
    TemplatesModule,
    StoreModule,
    HealthModule,
    ServerDeployModule,
    LarkBackupModule,
    LarkHostedModule,
    LarkShareModule,
    LarkGrantModule,
    SuggestionsModule,
    PublicModule,
    SocialModule,
    SkillsModule,
    ScheduledModule,
    ArtifactsModule,
    LeaderboardModule,
    UploadsModule,
    AnalyticsModule,
    AutomationsModule,
    FeedbackModule,
    BlogModule,
    AssistantModule,
    AgentModule,
    MaicModule,
    ApiKeysModule,
    RunnerTelemetryModule,
    ClaudeModule,
    MediaModule,
    CategoryModule,
    DeliveryModule,
    VideoModule,
    PictureModule,
    MakeBlogModule,
    MarketingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
