import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfigService } from './config/app-config.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Raise the body limit — an edit/redeploy POSTs the whole project file set
  // ({path,content}[]), well over the 100 KB default. Use Nest's built-in
  // configurator (no direct 'express' import — that module isn't a direct dep
  // under pnpm's isolated node_modules and crashes the app at runtime).
  app.useBodyParser('json', { limit: '16mb' });
  app.useBodyParser('urlencoded', { limit: '16mb', extended: true });
  const config = app.get(AppConfigService);

  // cloudflared and nginx are both loopback hops in front of us, so the socket peer is always
  // 127.0.0.1. Trusting the proxy makes `req.ip` / `req.protocol` reflect the forwarded values.
  // The per-IP rate limiter does NOT depend on this (IpThrottlerGuard reads CF-Connecting-IP,
  // which Cloudflare overwrites and a client cannot forge) — this is for everything else that
  // reads req.ip, e.g. the device-manager log.
  app.set('trust proxy', 'loopback');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  // Fail CLOSED. The old fallback was `origin: true`, which reflects ANY Origin back with
  // `Allow-Credentials: true` — one empty CORS_ORIGINS away from letting any site on the
  // internet make authenticated calls as a logged-in user.
  const allowedOrigins = config.corsOrigins.length
    ? config.corsOrigins
    : ['https://toolswave.net', 'https://cms.toolswave.net'];
  app.enableCors({ origin: allowedOrigins, credentials: true });

  // User uploads (avatars). Ensure the dir exists, then serve it at the API
  // ORIGIN under /uploads — OUTSIDE the 'v1' global prefix — so an uploaded
  // avatar at `${PUBLIC_API_URL}/uploads/avatars/<file>` is publicly reachable.
  mkdirSync(config.uploadsDir, { recursive: true });
  app.useStaticAssets(config.uploadsDir, { prefix: '/uploads' });

  app.setGlobalPrefix('v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.enableShutdownHooks();

  const port = config.env.PORT;
  // Loopback by default — see BIND_ADDR in config/env.ts for why, and how to widen it.
  const bindAddr = config.env.BIND_ADDR;
  await app.listen(port, bindAddr);
  new Logger('Bootstrap').log(`Larkwave API ready on http://${bindAddr}:${port}/v1`);
}

void bootstrap();
