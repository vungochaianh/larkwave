// Fast Video-Schedule CRUD + cron verification (no render). Run ON THE SERVER from
// /home/app/toolswave/apps/api:  node e2e-video-schedule.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true, email: true }, orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('no admin');
  console.log('user:', user.email);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('/home/app/toolswave/apps/api/dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const { VideoScheduleService } = await import('/home/app/toolswave/apps/api/dist/video/video-schedule.service.js');
  const svc = app.get(VideoScheduleService);

  console.log('create daily 08:00…');
  const s = await svc.create(user.id, { topic: 'Test lịch tự động video', cron: '0 8 * * *', template: 'pixel', aspect: '16:9', title: 'E2E schedule' });
  console.log('  id=%s cron=%s nextRunAt=%s enabled=%s', s.id, s.cron, s.nextRunAt, s.enabled);
  if (!s.nextRunAt) throw new Error('nextRunAt not computed');

  console.log('update → weekly Mon 09:30, disable…');
  const u = await svc.update(user.id, s.id, { cron: '30 9 * * 1', enabled: false });
  console.log('  cron=%s nextRunAt=%s enabled=%s', u.cron, u.nextRunAt, u.enabled);
  if (u.enabled !== false || u.nextRunAt !== null) throw new Error('disable should null nextRunAt');

  console.log('list…');
  const list = await svc.list(user.id);
  console.log('  count=%d', list.length);

  console.log('bad cron rejected?');
  let rejected = false;
  try { await svc.create(user.id, { topic: 'x bad', cron: 'not a cron' }); } catch { rejected = true; }
  console.log('  rejected=%s', rejected);
  if (!rejected) throw new Error('bad cron should be rejected');

  console.log('cleanup…');
  await svc.remove(user.id, s.id);
  await app.close();
  await prisma.$disconnect();
  console.log('\n✅ SCHEDULE CRUD OK');
  process.exit(0);
}
main().catch(async (e) => { console.error('❌ FAILED:', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
