import { detectPlatform } from './classify';
import type { GeneratedFile } from '@larkwave/shared';

const f = (path: string, content = ''): GeneratedFile => ({ path, content }) as GeneratedFile;
const pkg = (o: unknown) => f('package.json', JSON.stringify(o));

/**
 * Nhận diện nền tảng quyết định repo nào BỊ TỪ CHỐI nhập trên website, nên hai hướng sai không
 * ngang nhau: bỏ sót một repo mobile chỉ tạo ra một app không chạy được, còn chặn nhầm một repo
 * web hợp lệ là cắt mất việc của người dùng. Vì thế nửa đầu bảng dưới — các ca PHẢI ra 'web' —
 * mới là phần đáng giữ nhất.
 */
describe('detectPlatform', () => {
  describe('không được chặn nhầm (phải ra web)', () => {
    it.each([
      ['React + Vite', [pkg({ dependencies: { react: '18' }, devDependencies: { vite: '5' } }), f('index.html')]],
      ['Next.js', [pkg({ dependencies: { next: '14', react: '18' } }), f('next.config.js')]],
      ['site tĩnh', [f('index.html'), f('style.css')]],
      ['backend NestJS', [pkg({ dependencies: { '@nestjs/core': '10' } })]],
      // manifest.json KHÔNG đủ để kết luận là tiện ích — web app cài được (PWA) cũng có.
      ['PWA có manifest', [pkg({ dependencies: { react: '18' } }), f('manifest.json', JSON.stringify({ name: 'App', start_url: '/' }))]],
      // Capacitor sinh ra thư mục android/ trong một web app hoàn toàn bình thường.
      ['web app có thư mục android rỗng', [pkg({ dependencies: { react: '18' } }), f('android/app/src/main/AndroidManifest.xml')]],
      ['package.json hỏng', [f('package.json', '{ broken'), f('index.html')]],
    ])('%s', (_name, files) => {
      expect(detectPlatform(files as GeneratedFile[]).platform).toBe('web');
    });
  });

  describe('phải chặn', () => {
    it.each([
      ['React Native', 'mobile', [pkg({ dependencies: { 'react-native': '0.74' } })]],
      ['Expo', 'mobile', [pkg({ dependencies: { expo: '51' } })]],
      ['Flutter', 'mobile', [f('pubspec.yaml', 'name: app')]],
      ['Capacitor', 'mobile', [pkg({ dependencies: { '@capacitor/core': '6' } })]],
      ['Android gốc', 'mobile', [f('android/app/build.gradle')]],
      ['Electron', 'desktop', [pkg({ devDependencies: { electron: '30' } })]],
      ['Nextron', 'desktop', [pkg({ dependencies: { nextron: '9' } })]],
      ['Tauri', 'desktop', [f('src-tauri/tauri.conf.json')]],
      ['.NET', 'desktop', [f('App.csproj')]],
      ['tiện ích MV3', 'extension', [f('manifest.json', JSON.stringify({ manifest_version: 3, action: {}, permissions: ['tabs'] }))]],
    ])('%s → %s', (_name, want, files) => {
      const v = detectPlatform(files as GeneratedFile[]);
      expect(v.platform).toBe(want);
      expect(v.evidence).not.toHaveLength(0);
    });
  });
});
