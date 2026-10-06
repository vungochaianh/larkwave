// Verify the built-in FALLBACK scene renders to a valid mp4 (the resilience fix for MAIC timeouts).
// Run ON SERVER from /home/app/toolswave/apps/api:  node e2e-fallback-scene.mjs
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('/home/app/toolswave/apps/api/dist/app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const { RenderService } = await import('/home/app/toolswave/apps/api/dist/video/render.service.js');
  const { TtsService } = await import('/home/app/toolswave/apps/api/dist/video/tts.service.js');
  const { buildFallbackScene } = await import('/home/app/toolswave/apps/api/dist/video/fallback-scene.js');

  const script = 'Xin chào các bạn. Đây là video kiểm tra cảnh dự phòng của Toolswave. Mỗi ngày một điều tử tế. Hãy bắt đầu từ những bước nhỏ nhất.';
  console.log('synth voice…');
  const audio = await app.get(TtsService).synth(script, 'FakNc5gCZMILOW8jXlh1');
  console.log('  audio', audio.durationSec, 's');
  const html = buildFallbackScene({ script, durationSec: audio.durationSec, template: 'draw', w: 1080, h: 1920 });
  console.log('render fallback scene…');
  const out = await app.get(RenderService).render({ sceneHtml: html, audioPath: audio.path, durationSec: audio.durationSec, w: 1080, h: 1920 });
  console.log('  video =', out.url);
  console.log('  thumb =', out.thumbnailUrl);
  await app.close();
  await prisma.$disconnect();
  console.log('\n✅ FALLBACK SCENE OK');
  process.exit(0);
}
main().catch(async (e) => { console.error('❌ FAILED:', e.message); await prisma.$disconnect().catch(() => {}); process.exit(1); });
