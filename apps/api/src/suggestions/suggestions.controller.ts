import { Controller, Get, Post, Query } from '@nestjs/common';
import type { AppSuggestion, Paginated, SuggestionRunEntry } from '@larkwave/shared';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/auth-user';
import { SuggestionsService } from './suggestions.service';

/** Public builder-home suggestions (the current daily set). */
@Controller('suggestions')
export class SuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Public()
  @Get()
  current(): Promise<AppSuggestion[]> {
    return this.suggestions.current();
  }
}

/**
 * Admin view of the daily-suggestion generator: browse run history and trigger
 * an out-of-band regeneration.
 */
@Roles('admin')
@Controller('admin/suggestions')
export class AdminSuggestionsController {
  constructor(private readonly suggestions: SuggestionsService) {}

  @Get('runs')
  runs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<Paginated<SuggestionRunEntry>> {
    return this.suggestions.listRuns(Number(page) || 1, Number(pageSize) || 20);
  }

  @Post('run')
  run(@CurrentUser() actor: AuthUser): Promise<SuggestionRunEntry> {
    return this.suggestions.generate({ id: actor.id, email: actor.email });
  }
}
