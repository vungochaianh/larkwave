import { Injectable } from '@nestjs/common';
import { isAbsolute, resolve } from 'node:path';
import { Env, loadEnv } from './env';

/** Parsed, validated environment exposed as an injectable typed singleton. */
@Injectable()
export class AppConfigService {
  readonly env: Env = loadEnv();

  get corsOrigins(): string[] {
    return this.env.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  get isProd(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  /** Absolute path to the uploads dir (UPLOADS_DIR resolved from process.cwd()). */
  get uploadsDir(): string {
    const dir = this.env.UPLOADS_DIR;
    return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  /** API public origin (no trailing slash); avatar URLs are `${this}/uploads/...`. */
  get publicApiUrl(): string {
    return this.env.PUBLIC_API_URL.replace(/\/+$/, '');
  }
}
