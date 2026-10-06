import { BadRequestException, Injectable } from '@nestjs/common';
import { PlatformConfig } from '@larkwave/shared';
import { PlatformConfigService } from '../config/platform-config.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/auth-user';

/**
 * Tokens the codegen pipeline substitutes into each prompt template via fill().
 * If an admin edit drops one (or removes a whole key), that stage runs with no
 * files/spec/error context and the model hallucinates — or fill() crashes the
 * build mid-pipeline. A save that strips a required {{token}} or key is rejected
 * up front instead of silently corrupting every later build.
 */
const REQUIRED_PROMPT_TOKENS: Record<string, string[]> = {
  classify: ['USER_PROMPT'],
  blueprint: ['TRACK', 'USER_PROMPT'],
  spec: ['TRACK', 'USER_PROMPT'],
  codegen: ['STACK', 'SPEC'],
  fix: ['BUILD_ERROR', 'FILES'],
  guide: ['SPEC'],
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly platformConfig: PlatformConfigService,
    private readonly audit: AuditService,
  ) {}

  get(): Promise<PlatformConfig> {
    return this.platformConfig.get();
  }

  async update(actor: AuthUser, config: PlatformConfig): Promise<PlatformConfig> {
    if (
      !config ||
      typeof config !== 'object' ||
      !config.tracks ||
      !config.prompts ||
      !config.limits
    ) {
      throw new BadRequestException('Cấu hình không hợp lệ (thiếu tracks/prompts/limits)');
    }
    // Reject a save that drops a prompt key or a required {{placeholder}} — the
    // codegen pipeline reads these by exact name and fill() substitutes the tokens;
    // a missing one makes the model run blind (no files/spec/error) on every build.
    for (const [key, tokens] of Object.entries(REQUIRED_PROMPT_TOKENS)) {
      const tpl = (config.prompts as unknown as Record<string, unknown>)[key];
      if (typeof tpl !== 'string' || !tpl.trim())
        throw new BadRequestException(`Prompt "${key}" thiếu hoặc rỗng — không thể lưu.`);
      for (const t of tokens)
        if (!tpl.includes(`{{${t}}}`))
          throw new BadRequestException(
            `Prompt "${key}" thiếu biến bắt buộc {{${t}}} — sẽ làm hỏng quá trình tạo app.`,
          );
    }
    const saved = await this.platformConfig.update(config);
    await this.audit.log(actor.id, actor.email, 'settings.update', 'singleton');
    return saved;
  }
}
