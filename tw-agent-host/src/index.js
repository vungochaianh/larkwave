import { runHost } from './host.js';

runHost().catch((e) => {
  console.error('[tw-agent-host] fatal:', e);
  process.exit(1);
});
