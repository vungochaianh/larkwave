import { Module } from '@nestjs/common';
import { AdminRunnerTelemetryController, RunnerTelemetryController } from './runner-telemetry.controller';
import { RunnerTelemetryService } from './runner-telemetry.service';

/** Sổ lỗi runner phía người dùng + bảng /admin. PrismaModule là @Global nên không cần import. */
@Module({
  controllers: [RunnerTelemetryController, AdminRunnerTelemetryController],
  providers: [RunnerTelemetryService],
})
export class RunnerTelemetryModule {}
