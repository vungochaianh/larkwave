import { makeGenericRunner, scopedPrompt } from './genericRunner';

/**
 * Gemini CLI — headless via `-p` (prompt). `--yolo` auto-approves all actions
 * (no interactive approval mid-run); `-m` selects the model. Runs in the app cwd.
 */
export const geminiRunner = makeGenericRunner('gemini', (opts) => {
  // --yolo auto-approves with no write-jail flag → confine scope via the prompt backstop.
  const fullPrompt = scopedPrompt(opts);
  const args = ['-p', fullPrompt, '--yolo'];
  if (opts.model) args.push('-m', opts.model);
  return args;
});
