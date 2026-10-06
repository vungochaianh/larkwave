// E2E: (1) picture refine edits the previous poster; (2) video mp4 length ≈ audio length (A/V sync).
// Run ON SERVER from /home/app/toolswave/apps/api:  node e2e-fixes.mjs
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const pexec = promisify(execFile);
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollPicture(id, prevImg, t0 = Date.now()) {
  for (;;) {
    await sleep(4000);
    const p = await prisma.pictureProject.findUnique({ where: { id } });
    if ((p.status === 'done' && p.imageUrl && p.imageUrl !== prevImg) || p.status === 'error') return p;
    if (Date.now() - t0 > 180000) return p;
  }
}

async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('/home/app/toolswave/apps/api/dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const { PictureService } = await import('/home/app/toolswave/apps/api/dist/picture/picture.service.js');
  const { VideoService } = await import('/home/app/toolswave/apps/api/dist/video/video.service.js');

  // (1) PICTURE refine
  console.log('=== PICTURE create ===');
  const pic = await app.get(PictureService).createAndAwait(user.id, { topic: 'Câu quote về sự kiên trì', template: 'quote', aspect: '1:1', title: 'refine test' });
  console.log('created:', pic.status, pic.imageUrl);
  const beforeHtml = (await prisma.pictureProject.findUnique({ where: { id: pic.id } })).html.length;
  console.log('refine: "đổi nền tối, chữ vàng, thêm biểu tượng ngôi sao"…');
  await app.get(PictureService).refine(user.id, pic.id, 'đổi nền tối màu, chữ vàng, thêm biểu tượng ngôi sao');
  const after = await pollPicture(pic.id, pic.imageUrl);
  console.log('refined:', after.status, 'newImg=', after.imageUrl, 'imgChanged=', after.imageUrl !== pic.imageUrl, 'htmlLenBefore=', beforeHtml, 'htmlLenAfter=', after.html.length);

  // (2) VIDEO A/V sync
  console.log('\n=== VIDEO create (checking A/V length match) ===');
  const vid = await app.get(VideoService).createAndAwait(user.id, { topic: 'Một mẹo nhỏ giúp ngày mới hiệu quả', template: 'draw', aspect: '9:16' });
  const vrow = await prisma.videoProject.findUnique({ where: { id: vid.id } });
  console.log('video:', vid.status, 'audioDur=', vrow.durationSec, 'url=', vid.videoUrl);
  if (vid.status === 'done' && vid.videoUrl) {
    const { stdout } = await pexec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', vid.videoUrl]);
    const mp4Dur = parseFloat(stdout.trim());
    const diff = Math.abs(mp4Dur - vrow.durationSec);
    console.log('mp4Dur=', mp4Dur, 'audioDur=', vrow.durationSec, 'diff=', diff.toFixed(2), 's', diff < 0.5 ? '✅ SYNCED' : '⚠️ DRIFT');
  }

  await app.close();
  await prisma.$disconnect();
  console.log('\n✅ done');
  process.exit(0);
}
main().catch(async (e) => { console.error('❌ FAILED:', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
