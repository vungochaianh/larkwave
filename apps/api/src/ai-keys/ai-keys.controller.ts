import { Body, Controller, Get, Put } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { AiKeysService } from './ai-keys.service';

/** Admin: view agent/provider status + set the optional OpenAI/Grok API keys. */
@Roles('admin')
@Controller('admin/ai')
export class AiKeysController {
  constructor(private readonly aiKeys: AiKeysService) {}

  @Get('status')
  status() {
    return this.aiKeys.status();
  }

  @Put('keys')
  async setKeys(
    @Body() dto: { anthropic?: string; openai?: string; grok?: string },
  ): Promise<{ ok: true }> {
    await this.aiKeys.setKeys({
      anthropic: dto.anthropic,
      openai: dto.openai,
      grok: dto.grok,
    });
    return { ok: true };
  }
}
