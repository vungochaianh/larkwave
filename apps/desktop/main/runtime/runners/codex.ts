import { makeGenericRunner, scopedPrompt } from './genericRunner';

/**
 * Codex CLI — `codex exec` is the non-interactive subcommand. `--cd` sets the
 * working dir; `--dangerously-bypass-approvals-and-sandbox` auto-runs without
 * approval prompts (headless); `-m` selects the model.
 */
export const codexRunner = makeGenericRunner('codex', (opts) => {
  // --dangerously-bypass-approvals-and-sandbox kept (flag names for --sandbox are
  // version-specific; a wrong flag aborts every build) → scope is enforced via prompt.
  const fullPrompt = scopedPrompt(opts);
  const args = ['exec', fullPrompt, '--cd', opts.cwd, '--dangerously-bypass-approvals-and-sandbox'];
  if (opts.model) args.push('-m', opts.model);
  return args;
});
