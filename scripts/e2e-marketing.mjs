// E2E for the new Make Picture + Make Blog pipelines. Run ON SERVER from /home/app/toolswave/apps/api:
//   node e2e-marketing.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({ where: { role: 'admin' }, select: { id: true, email: true }, orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('no admin');
  console.log('user:', user.email);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('/home/app/toolswave/apps/api/dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const { PictureService } = await import('/home/app/toolswave/apps/api/dist/picture/picture.service.js');
  const { MakeBlogService } = await import('/home/app/toolswave/apps/api/dist/makeblog/makeblog.service.js');

  console.log('\n=== PICTURE (quote, 1:1) ===');
  const pic = await app.get(PictureService).createAndAwait(user.id, { topic: 'Câu quote tạo động lực buổi sáng', template: 'quote', aspect: '1:1', title: 'E2E picture' });
  console.log('picture:', pic.status, 'img=', pic.imageUrl, 'caption=', (pic.caption || '').slice(0, 60), pic.error ? 'ERR:' + pic.error : '');

  console.log('\n=== BLOG (listicle) ===');
  const blog = await app.get(MakeBlogService).createAndAwait(user.id, { topic: '5 mẹo tập trung làm việc hiệu quả', template: 'listicle', title: 'E2E blog' });
  console.log('blog:', blog.status, 'cover=', blog.coverUrl, 'bodyLen=', (blog.body || '').length, 'excerpt=', (blog.caption || '').slice(0, 60), blog.error ? 'ERR:' + blog.error : '');

  await app.close();
  await prisma.$disconnect();
  const ok = pic.status === 'done' && !!pic.imageUrl && blog.status === 'done' && (blog.body || '').length > 100;
  console.log(ok ? '\n✅ MARKETING E2E OK' : '\n❌ E2E incomplete');
  process.exit(ok ? 0 : 1);
}
main().catch(async (e) => { console.error('❌ FAILED:', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
