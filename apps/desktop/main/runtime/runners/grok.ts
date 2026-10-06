import { makeGenericRunner, scopedPrompt } from './genericRunner';
import { writeRunnerPromptFile } from './runnerCore';

/**
 * Grok CLI (grok build) — headless single-turn via `--prompt-file` + `--cwd`.
 * `--always-approve` auto-applies edits (no TTY). Long prompts go to a scratch
 * file because the CLI rejects `--prompt` (use `--prompt-file` instead).
 */
export const grokRunner = makeGenericRunner('grok', (opts) => {
  const fullPrompt = scopedPrompt(opts);
  const promptPath = writeRunnerPromptFile(opts.cwd, 'grok', fullPrompt);
  const args = ['--prompt-file', promptPath, '--cwd', opts.cwd, '--always-approve'];
  if (opts.model) args.push('-m', opts.model);
  return args;
});
