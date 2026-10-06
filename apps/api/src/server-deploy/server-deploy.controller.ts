import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type {
  PrepareServerResponse,
  ServerDeployInfo,
  ServerDeployStatusResponse,
} from '@larkwave/shared';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { ServerDeployService } from './server-deploy.service';

/** "Deploy lên Server (Docker)" for full-stack apps (a docker-compose.yml). */
@Controller('apps')
export class ServerDeployController {
  constructor(private readonly svc: ServerDeployService) {}

  // ── Desktop (stateless) server deploy — declared first so the literal path
  //    wins over the `:id/...` param routes below. ──────────────────────────────
  /** `POST /v1/apps/desktop-server-deploy` — deploy an uploaded local app (source +
   *  docker-compose) to the Docker server; returns a deployId to poll. */
  @Post('desktop-server-deploy')
  desktopDeploy(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<{ deployId: string }> {
    return this.svc.desktopDeploy(user, req.body as Parameters<ServerDeployService['desktopDeploy']>[1]);
  }

  /** `GET /v1/apps/desktop-server-deploy/:deployId` — poll the desktop deploy status. */
  @Get('desktop-server-deploy/:deployId')
  desktopDeployStatus(@Param('deployId') deployId: string): {
    status: string;
    log: string;
    urls: string[];
    error?: string;
  } {
    return this.svc.desktopDeployStatus(deployId);
  }

  /** `GET /v1/apps/:id/server-deploy` — feature availability + current state. */
  @Get(':id/server-deploy')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ServerDeployStatusResponse> {
    return this.svc.status(user, id);
  }

  /** `POST /v1/apps/:id/prepare-server` — AI-synthesize docker-compose + Dockerfiles. */
  @Post(':id/prepare-server')
  prepare(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<PrepareServerResponse> {
    return this.svc.prepareInfra(user, id);
  }

  /** `POST /v1/apps/:id/deploy-server` — rsync + docker compose up + nginx + tunnel. */
  @Post(':id/deploy-server')
  deploy(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ServerDeployInfo> {
    return this.svc.deploy(user, id);
  }
}
