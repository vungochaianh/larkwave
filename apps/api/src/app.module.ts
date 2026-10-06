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
import { CommunityModule } from './community/community.module';
import { StorageModule } from './storage/storage.module';
import { BillingModule } from './billing/billing.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { LarkBackupModule } from './lark-backup/lark-backup.module';
import { LarkHostedModule } from './lark-hosted/lark-hosted.module';
import { LarkShareModule } from './lark-share/lark-share.module';
import { LarkGrantModule } from './lark-grant/lark-grant.module';
import { SocialModule } from './social/social.module';
import { SkillsModule } from './skills/skills.module';
import { ScheduledModule } from './scheduled/scheduled.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { UploadsModule } from './uploads/uploads.module';
import { FeedbackModule } from './feedback/feedback.module';
import { AssistantModule } from './assistant/assistant.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AiKeysModule } from './ai-keys/ai-keys.module';
import { AgentModule } from './agent/agent.module';
import { MaicModule } from './maic/maic.module';
import { RunnerTelemetryModule } from './runner-telemetry/runner-telemetry.module';
import { ClaudeModule } from './claude/claude.module';

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
    AuditModule,
    MailModule,
    BillingModule,
    CommunityModule,
    StorageModule,
    EventsModule,
    NotificationsModule,
    AiKeysModule,
    // Domain
    AuthModule,
    UsersModule,
    MeModule,
    PaymentsModule,
    ReportsModule,
    HealthModule,
    LarkBackupModule,
    LarkHostedModule,
    LarkShareModule,
    LarkGrantModule,
    SocialModule,
    SkillsModule,
    ScheduledModule,
    ArtifactsModule,
    UploadsModule,
    FeedbackModule,
    AssistantModule,
    AgentModule,
    MaicModule,
    RunnerTelemetryModule,
    ClaudeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
