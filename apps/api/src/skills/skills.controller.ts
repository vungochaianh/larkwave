import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { SkillsService } from './skills.service';
import { CreateSkillDto, DraftSkillDto, UpdateSkillDto, type SkillInfoDto } from './skills.dto';

/**
 * Server-side SKILLS for the hosted "Trợ lý AI". Every mutating route returns the FULL updated
 * list (matching the shared runtime contract: all skill methods resolve to SkillInfo[]).
 */
@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<SkillInfoDto[]> {
    return this.skills.list(user.id);
  }

  /** "Create with Claude": draft a skill from a short idea via the hosted assistant (MAIC). */
  @Post('draft')
  draft(
    @CurrentUser() _user: AuthUser,
    @Body() dto: DraftSkillDto,
  ): Promise<{ name: string; description: string; instructions: string }> {
    return this.skills.draft(dto.prompt);
  }

  /** The user's `/command` shortcuts — powers the "/" menu in the chat composers.
   *  Declared BEFORE `:id` so the param route doesn't swallow it. */
  @Get('commands')
  commands(
    @CurrentUser() user: AuthUser,
  ): Promise<{ id: string; name: string; description: string; command: string; enabled: boolean }[]> {
    return this.skills.commands(user.id);
  }

  @Get(':id')
  read(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ id: string; name: string; instructions: string; command: string }> {
    return this.skills.read(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSkillDto): Promise<SkillInfoDto[]> {
    return this.skills.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSkillDto,
  ): Promise<SkillInfoDto[]> {
    return this.skills.update(user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<SkillInfoDto[]> {
    return this.skills.remove(user.id, id);
  }
}
