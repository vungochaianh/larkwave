import type { CreateBuildInput } from '@larkwave/core';

/** Desktop: read the persisted CLI runner + model from localStorage (Composer writes these). */
export function desktopRunnerPrefs(): Pick<CreateBuildInput, 'runner' | 'model'> {
  if (typeof window === 'undefined') return {};
  const runner = localStorage.getItem('tw_runner') || 'claude';
  const model = localStorage.getItem('tw_runner_model') || undefined;
  return { runner, ...(model ? { model } : {}) };
}

export function setDesktopRunnerPrefs(runner: string, model?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('tw_runner', runner);
  if (model) localStorage.setItem('tw_runner_model', model);
  else localStorage.removeItem('tw_runner_model');
}