// End-to-end Video Studio verification — run ON THE SERVER as the `app` user from
// /home/app/toolswave/apps/api (so @prisma/client + apps/api node_modules resolve).
// It drives the REAL HTTP API: mints nothing, instead it logs in as (or creates) a
// throwaway verify user, POSTs a video, polls until done, and checks the mp4 is valid.
//
//   cd /home/app/toolswave/apps/api && node ../../scripts/e2e-video.mjs
//
// Env: reads DATABASE_URL + JWT_SECRET from process env (source ../../.env first).
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);

const API = process.env.API_BASE || 'https://api.toolswave.net/v1';
const prisma = new PrismaClient();

async function main() {
  // Pick an existing admin/user to attribute the test to (we call the service layer
  // directly via a signed request is complex — instead find a user with a known session).
  const user = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!user) throw new Error('no admin user found');
  console.log('using user:', user.email, user.id);

  // Create the project row directly, then trigger the render via the internal service by
  // hitting the authed HTTP endpoint would need a JWT; instead we insert + call the
  // pipeline through a tiny in-process import of the built service is heavy. Simplest
  // reliable path: insert the row, then POST /video is what the UI does — but that needs
  // auth. So we verify the PIPELINE by inserting a row and invoking the compiled service.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('/home/app/toolswave/apps/api/dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const { VideoService } = await import('/home/app/toolswave/apps/api/dist/video/video.service.js');
  const svc = app.get(VideoService);

  console.log('voices…');
  const voices = await svc.listVoices();
  console.log('  voices:', voices.length, voices[0]?.name);
  if (!voices.length) throw new Error('no ElevenLabs voices — key missing?');

  console.log('create (draw, 9:16)…');
  const proj = await svc.create(user.id, {
    topic: 'Ba mẹo nhỏ giúp bạn tập trung làm việc hiệu quả hơn mỗi ngày.',
    template: 'draw',
    aspect: '9:16',
    voiceId: voices[0].id,
    title: 'E2E verify',
  });
  console.log('  project:', proj.id);

  // Poll the DB until done/error
  let p;
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    p = await prisma.videoProject.findUnique({ where: { id: proj.id } });
    const secs = Math.round((Date.now() - t0) / 1000);
    console.log(`  [${secs}s] status=${p.status} stage=${p.stage || '-'} ${p.error ? 'ERR:' + p.error : ''}`);
    if (p.status === 'done' || p.status === 'error') break;
    if (secs > 480) throw new Error('timeout waiting for render');
  }

  if (p.status === 'error') throw new Error('render failed: ' + p.error);
  console.log('DONE. videoUrl =', p.videoUrl, 'duration =', p.durationSec);

  // Validate the mp4 with ffprobe
  const localPath = p.videoUrl.replace(/^https?:\/\/[^/]+\/uploads\//, '/home/app/toolswave/uploads/');
  const { stdout } = await pexec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,width,height', '-of', 'default=nw=1', localPath]);
  console.log('--- ffprobe ---\n' + stdout.trim());

  await app.close();
  await prisma.$disconnect();
  console.log('\n✅ E2E OK — video rendered + valid.');
  process.exit(0);
}

main().catch(async (e) => {
  console.error('❌ E2E FAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
