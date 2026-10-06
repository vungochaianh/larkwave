import { Module } from '@nestjs/common';
import { EngineModule } from '../engine/engine.module';
import { SuggestionsService } from './suggestions.service';
import { AdminSuggestionsController, SuggestionsController } from './suggestions.controller';

@Module({
  imports: [EngineModule],
  controllers: [SuggestionsController, AdminSuggestionsController],
  providers: [SuggestionsService],
})
export class SuggestionsModule {}
