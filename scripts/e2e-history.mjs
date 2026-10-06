// E2E: version history + restore (picture — fastest). Run ON SERVER from /home/app/toolswave/apps/api.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollImg(id, prev, t0 = Date.now()) {
  for (;;) {
    await sleep(4000);
    const p = await prisma.pictureProject.findUnique({ where: { id } });
    if ((p.status === 'done' && p.imageUrl && p.imageUrl !== prev) || p.status === 'error') return p;
    if (Date.now() - t0 > 180000) return p;
  }
}

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'deveris.vu@gmail.com' }, select: { id: true } });
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('/home/app/toolswave/apps/api/dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const svc = app.get((await import('/home/app/toolswave/apps/api/dist/picture/picture.service.js')).PictureService);

  console.log('create…');
  const pic = await svc.createAndAwait(user.id, { topic: 'Câu nói về lòng biết ơn', template: 'quote', aspect: '1:1', title: 'history test' });
  console.log('  created img=', pic.imageUrl.slice(-24));
  let hist = await svc.listHistory(user.id, pic.id);
  console.log('  history after create:', hist.length, hist.map((h) => h.action).join(','));

  console.log('fix "đổi nền tối, chữ vàng"…');
  await svc.refine(user.id, pic.id, 'đổi nền tối màu, chữ vàng');
  const afterFix = await pollImg(pic.id, pic.imageUrl);
  console.log('  fixed img=', (afterFix.imageUrl || '').slice(-24), 'changed=', afterFix.imageUrl !== pic.imageUrl);
  hist = await svc.listHistory(user.id, pic.id);
  console.log('  history after fix:', hist.length, hist.map((h) => h.action).join(','));

  const createEntry = hist.find((h) => h.action === 'create');
  console.log('restore → create version…');
  await svc.restore(user.id, pic.id, createEntry.id);
  const restored = await prisma.pictureProject.findUnique({ where: { id: pic.id } });
  console.log('  restored img=', (restored.imageUrl || '').slice(-24), 'matchesCreate=', restored.imageUrl === pic.imageUrl);

  const ok = hist.length === 2 && hist.some((h) => h.action === 'create') && hist.some((h) => h.action === 'fix') && restored.imageUrl === pic.imageUrl;
  await app.close(); await prisma.$disconnect();
  console.log(ok ? '\n✅ HISTORY + RESTORE OK' : '\n❌ FAILED');
  process.exit(ok ? 0 : 1);
}
main().catch(async (e) => { console.error('❌ FAILED:', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
