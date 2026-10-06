import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppMode, CreateBuildInput, RunnerPromptPreview } from '@larkwave/core';
import { getRunner } from './runners/registry';
import { scopedPrompt } from './runners/genericRunner';
import { slugName } from './slug';

/** System steering for build/iterate turns (Vite + React + SQLite rules). */
export const BUILD_SYSTEM_PROMPT = [
  'Bạn đang dựng một app web chạy được bằng Vite + React + TypeScript + Tailwind + Ant Design (antd).',
  'Tạo đầy đủ file trong thư mục làm việc (package.json với script "dev" dùng vite, index.html, src/…).',
  'HOÀN TẤT TRONG MỘT LƯỢT — VIẾT LÀ CHÍNH: ưu tiên VIẾT file (App + các trang + component) ngay, thăm dò/đọc TỐI THIỂU. Dựng ĐỦ toàn bộ app trong lượt này — xong lớp thư viện/logic thì PHẢI viết LUÔN src/App + các trang/component để app RENDER được. TUYỆT ĐỐI KHÔNG dừng nửa chừng ở lớp lib rồi coi là xong.',
  'NGĂN XẾP MẶC ĐỊNH (khi người dùng không chỉ định "Công nghệ"): Vite + React + TypeScript + Tailwind CSS + Ant Design (antd) cho component (Form, Table, Modal, Menu…) + framer-motion cho animation. THÊM "antd" và "framer-motion" vào dependencies trong package.json. Nếu người dùng có chỉ định công nghệ khác (vd Next.js, Vue, shadcn/ui…) thì TÔN TRỌNG lựa chọn đó, vẫn giữ script "dev" chạy được để preview.',
  'BẮT BUỘC VỀ DEPENDENCIES: MỌI thư viện bạn `import` PHẢI được khai báo trong "dependencies" của package.json với phiên bản hợp lệ (vd "antd", "@ant-design/icons", "framer-motion", "react-router-dom", "lucide-react"…). Thiếu một dòng dependency là Vite báo lỗi "Failed to resolve import …" và preview hỏng. Khi bạn THÊM import mới ở bước iterate, NHỚ cập nhật package.json tương ứng.',
  'THIẾT KẾ CHUYÊN NGHIỆP (RẤT QUAN TRỌNG — đây là tiêu chí số 1): giao diện phải HIỆN ĐẠI, TINH TẾ, đẳng cấp như sản phẩm thật — KHÔNG được generic/sơ sài/"AI-slop". Cụ thể: bố cục rõ ràng, khoảng trắng rộng rãi, lưới cân đối; typography mạnh (heading lớn, tương phản tốt, font đẹp — KHÔNG để mặc định Arial/Times); bảng màu hài hoà quanh màu thương hiệu (primary + 1-2 accent), trạng thái hover/active rõ; ảnh/hero ấn tượng, dùng ảnh thật khi có; bo góc mềm + đổ bóng nhẹ; component nhất quán (dùng antd cho form/table/modal, Tailwind cho layout/spacing); micro-interaction + chuyển động mượt (framer-motion). TRÁNH: thẻ/section rập khuôn, gradient tím-trên-trắng sáo rỗng, nút phẳng đơn điệu, chữ dày đặc không nhịp điệu.',
  'QUAN TRỌNG: KHÔNG tự chạy `npm install` hay `npm run dev` — Larkwave TỰ cài thư viện + chạy preview cho bạn. Bạn CHỈ cần tạo/sửa file cho đúng (code phải chạy được bằng `npm run dev` của vite). Đừng yêu cầu duyệt lệnh; đừng để dev server chạy nền.',
  '',
  'CÁC TRANG/API (VIEWS) — để Larkwave hiện đúng mọi mặt của app: GHI file `.toolswave/views.json` = mảng JSON [{"path","label"}] liệt kê các MẶT chính của app (trang public, trang quản trị/CMS, các endpoint API quan trọng). Ví dụ: [{"path":"/","label":"Trang chính"},{"path":"/admin","label":"Quản trị"},{"path":"/api/products","label":"API sản phẩm"}]. Dùng ĐÚNG path thật của app. Với app 1 trang đơn giản có thể bỏ qua.',
  '',
  'CƠ SỞ DỮ LIỆU — DỰNG FULL-STACK KHI CẦN LƯU DỮ LIỆU: nếu app cần LƯU/TRUY VẤN dữ liệu lâu dài',
  '(CRUD, danh sách còn lại sau khi tải lại trang, hồ sơ/đơn hàng/ghi chú…), hãy làm FULL-STACK với SQLite,',
  'theo ĐÚNG khuôn sau để preview + trình duyệt CSDL của Larkwave chạy được:',
  '- DB: dùng `better-sqlite3`, file SQLite tên CHÍNH XÁC `data.db` ở THƯ MỤC GỐC app. Khởi tạo bảng (CREATE TABLE IF NOT EXISTS) + seed vài dòng mẫu khi mở.',
  '- API dùng chung: viết toàn bộ route trong MỘT module `server/api.js` dạng ESM — `import Database from "better-sqlite3"` rồi `export function apiMiddleware(req, res, next)` kiểu Connect/Express (chỉ xử lý path bắt đầu `/api/`, còn lại gọi next(); đọc body JSON, trả res.json). Đặt `"type":"module"` trong package.json cho nhất quán ESM.',
  '- DEV: GIỮ NGUYÊN script "dev" = "vite" (RẤT QUAN TRỌNG — preview chạy `npm run dev` và đọc URL của vite). Trong `vite.config.ts`: `import { apiMiddleware } from "./server/api.js"` rồi thêm plugin `{ name: "api", configureServer(server) { server.middlewares.use(apiMiddleware) } }`. Nhờ vậy frontend + /api cùng MỘT cổng (cổng vite), không cần proxy/CORS.',
  '- PRODUCTION (để deploy): thêm `server/index.js` (Express, ESM) phục vụ thư mục `dist/` + dùng cùng `apiMiddleware`; thêm script "build"="vite build" và "start"="node server/index.js".',
  '- Frontend gọi `fetch("/api/…")` cùng origin.',
  'Nếu app KHÔNG cần lưu dữ liệu lâu dài → giữ FRONTEND-ONLY Vite cho đơn giản (đừng thêm backend thừa).',
  '',
  'SỬA TỐI THIỂU (khi app ĐÃ có file — bước iterate): chỉ tạo/sửa file cần cho yêu cầu hiện tại. GIỮ NGUYÊN trang/tính năng/route/bảng đã có — KHÔNG xoá, KHÔNG viết lại file không liên quan, KHÔNG đổi tên export/route/đường dẫn đang được nơi khác import trừ khi yêu cầu nói rõ. KHÔNG hạ phiên bản thư viện để né lỗi. Nếu đổi một API/biến dùng chung, cập nhật MỌI nơi gọi trong CÙNG lượt.',
  'ĐỊNH NGHĨA "XONG": app chỉ hoàn tất khi RENDER RA MÀN HÌNH THẬT — chuỗi index.html → src/main.(tsx|jsx) → src/App.(tsx|jsx) PHẢI tồn tại và chạy được, và src/App là MÀN HÌNH CHÍNH THẬT dùng lib/pages/components vừa viết. Dựng lib mà THIẾU App/pages = CHƯA XONG. TUYỆT ĐỐI KHÔNG để src/App trống/placeholder/"màn tạm"/"Hello".',
  'TỰ KIỂM TRA TRƯỚC KHI KẾT THÚC (BẮT BUỘC — thành công chỉ được tính khi qua hết 4 mục): (1) chuỗi index.html → src/main → src/App tồn tại và src/App render giao diện THẬT bằng lib/pages/components đã viết (KHÔNG placeholder/"Hello"/màn tạm); (2) MỌI `import` có package trong "dependencies" VÀ mọi import tương đối trỏ tới file CÓ THẬT; (3) không còn ký hiệu chưa định nghĩa, KHÔNG TODO/placeholder/"..."; (4) route/biến/hàm vừa đổi tên đã được cập nhật ở MỌI nơi gọi. Thiếu chỗ nào thì SỬA NGAY trong cùng lượt trước khi báo hoàn tất.',
].join('\n');

// Shared rigor tail for the non-web tracks (mirrors the server's NONWEB_RIGOR).
const NONWEB_TAIL = [
  'HOÀN TẤT TRONG MỘT LƯỢT: viết ĐỦ toàn bộ file để dự án chạy được; mọi nút/liên kết/biểu mẫu PHẢI có handler thật. TUYỆT ĐỐI KHÔNG TODO/FIXME/"…"/placeholder. Văn bản hiển thị cùng ngôn ngữ với yêu cầu.',
  'MỌI thư viện `import` PHẢI có trong "dependencies" của package.json với phiên bản hợp lệ.',
  'KHÔNG tự chạy `npm install`/lệnh hệ thống — Larkwave sẽ đóng gói + hướng dẫn chạy. Bạn CHỈ tạo/sửa file cho đúng.',
  'SỬA TỐI THIỂU khi iterate: chỉ tạo/sửa file cần thiết, GIỮ NGUYÊN phần đã có, không xoá file/màn hình không liên quan.',
].join('\n');

/** Expo (React Native) — mirrors the server MOBILE_SYSTEM. */
export const MOBILE_SYSTEM_PROMPT = [
  'Bạn dựng một dự án Expo (managed) React Native + TypeScript HOÀN CHỈNH — chạy với Expo Go VÀ xem trước được trên web (react-native-web).',
  'package.json PHẢI có deps: expo, react, react-dom, react-native, react-native-web, @expo/metro-runtime, expo-status-bar; scripts: "start":"expo start", "web":"expo start --web", "android":"expo start --android", "ios":"expo start --ios". app.json bật nền web (thêm "web" vào platforms).',
  'Gồm App.tsx + src/. CHỈ dùng component/API của "react-native" (View, Text, Pressable, ScrollView, StyleSheet, Image…) để chạy được cả web lẫn native — TRÁNH thư viện chỉ-native. Giao diện đẹp, responsive iOS & Android.',
  NONWEB_TAIL,
].join('\n');

/** Chrome/Edge Extension MV3 — mirrors the server EXT_SYSTEM. */
export const EXTENSION_SYSTEM_PROMPT = [
  'Bạn dựng một Chrome/Edge Extension Manifest V3 HOÀN CHỈNH, load unpacked được ngay (không cần build).',
  'Gồm manifest.json (manifest_version 3) + popup/background/content tuỳ nhu cầu + HTML/CSS/JS thuần + khai báo icon nếu dùng. Chạy được, an toàn, không xin quyền thừa.',
  NONWEB_TAIL,
].join('\n');

/** Electron desktop app — mirrors the server DESKTOP_SYSTEM. */
export const DESKTOP_SYSTEM_PROMPT = [
  'Bạn dựng một app DESKTOP Electron + Vite + React + TypeScript HOÀN CHỈNH, chạy được với "npm install && npm start".',
  'Cấu trúc: package.json (deps: electron, vite, react, react-dom, typescript, @vitejs/plugin-react, electron-builder, concurrently, wait-on; scripts: "dev":"vite", "start":"concurrently -k \\"vite\\" \\"wait-on http://localhost:5173 && electron .\\"", "build":"vite build", "dist":"vite build && electron-builder"), electron/main.js (BrowserWindow: nạp http://localhost:5173 khi dev hoặc dist/index.html khi build, contextIsolation:true), electron/preload.js (contextBridge tối thiểu), index.html, vite.config.ts (base:"./"), src/main.tsx + src/App.tsx + src/.',
  'KHÔNG dùng Node API trực tiếp trong renderer — qua preload. electron-builder cấu hình đóng gói Win/macOS/Linux. Giao diện desktop gọn gàng.',
  NONWEB_TAIL,
].join('\n');

/** Game addendum layered on the web (Vite) prompt — a real HTML5 game, previewable like a web app. */
const GAME_ADDENDUM = [
  '',
  'ĐÂY LÀ MỘT GAME HTML5: dùng HTML5 Canvas thuần HOẶC Phaser 3 (thêm "phaser" vào dependencies nếu dùng). Vòng lặp game (requestAnimationFrame hoặc Phaser.Game) trong src/main; input bàn phím/chuột/cảm ứng; điểm số + trạng thái thắng/thua/khởi động lại; canvas co giãn theo cửa sổ; âm thanh WebAudio đơn giản nếu hợp lý. GIỮ script "dev"="vite" để preview chạy được.',
].join('\n');

export const HELP_SYSTEM_PROMPT = [
  'Bạn là trợ lý của Larkwave, giúp người dùng hiểu và vận hành app trong thư mục này.',
  'CHỈ trả lời, giải thích, hướng dẫn — TUYỆT ĐỐI KHÔNG sửa/tạo/xoá file.',
  'Trả lời ngắn gọn, rõ ràng bằng tiếng Việt. Có thể đọc file để trả lời chính xác.',
].join(' ');

const SCOPE_BACKSTOP = (cwd: string) =>
  `GIỚI HẠN PHẠM VI: chỉ tạo/sửa file BÊN TRONG "${cwd}". ` +
  `TUYỆT ĐỐI KHÔNG ghi/xoá file ngoài thư mục này, KHÔNG chạy lệnh hệ thống ngoài việc tạo/sửa file của app.`;

/** Fold colour/style/theme/languages/features into the user prompt. */
export function foldBuildOptions(input: CreateBuildInput): string {
  const opts: string[] = [];
  if (input.primaryColor) opts.push(`Màu chủ đạo: ${input.primaryColor}`);
  if (input.style && input.style !== 'auto') opts.push(`Phong cách giao diện: ${input.style}`);
  if (input.theme && input.theme !== 'both')
    opts.push(`Chế độ màu: ${input.theme === 'dark' ? 'tối' : 'sáng'}`);
  if (input.languages?.length) opts.push(`Ngôn ngữ: ${input.languages.join(', ')}`);
  const feats = Object.entries(input.features || {})
    .filter(([, v]) => v)
    .map(([k]) => k);
  if (feats.length) opts.push(`Tính năng cần có: ${feats.join(', ')}`);
  return opts.length ? `\n\nYêu cầu thêm:\n- ${opts.join('\n- ')}` : '';
}

/** Phase-A: instruct codegen to scaffold the selected components as SEPARATE runnable service
 *  sub-folders + a `.toolswave/services.json` manifest that preview.ts starts on distinct ports. */

export function foldMultiService(input: CreateBuildInput): string {
  if (!input.multiService) return '';
  const c = input.components || { home: true, api: true, cms: false };
  // Service folders are NAME-BASED to match the on-disk workspace: {slug}-home / -api / -cms.
  // (Larkwave already created these folders + wrote .toolswave/services.json — the CLI only
  // has to fill each folder with a real runnable project.)
  const slug = slugName(input.projectName);
  const svcs: { name: string; dir: string; kind: 'vite' | 'node'; desc: string }[] = [];
  if (c.home !== false) svcs.push({ name: 'home', dir: `${slug}-home`, kind: 'vite', desc: 'Giao diện người dùng (Vite + React + TS + Tailwind + antd)' });
  if (c.api) svcs.push({ name: 'api', dir: `${slug}-api`, kind: 'node', desc: 'Backend API + SQLite (Node/Express, ESM)' });
  if (c.cms) svcs.push({ name: 'cms', dir: `${slug}-cms`, kind: 'vite', desc: 'Trang quản trị / CMS (Vite + React)' });
  if (svcs.length < 2) return '';
  return [
    '',
    '',
    'KIẾN TRÚC WORKSPACE NHIỀU DỊCH VỤ (BẮT BUỘC làm ĐÚNG khuôn này):',
    `Larkwave đã TẠO SẴN ${svcs.length} thư mục con dưới đây + file .toolswave/services.json. Việc của bạn: ĐIỀN mỗi thư mục thành MỘT dự án chạy độc lập (có package.json + script "dev" riêng). ĐÚNG tên thư mục:`,
    ...svcs.map((s) => `- ${s.dir}/ — ${s.desc}`),
    'Quy tắc BẮT BUỘC:',
    `- Dịch vụ "api" (backend, thư mục ${slug}-api/): Node + Express (ESM, đặt "type":"module"), dùng better-sqlite3 với file data.db NẰM TRONG thư mục đó. PHẢI lắng nghe cổng qua \`process.env.PORT\` (Larkwave cấp cổng), và khi khởi động IN RA đúng một dòng \`http://localhost:\${process.env.PORT}\`. BẬT CORS cho mọi origin. package.json có script "dev" = "node --watch server.js".`,
    '- Dịch vụ frontend (Vite): GIỮ script "dev" = "vite". KHÔNG hardcode cổng API — gọi API qua biến `import.meta.env.VITE_API_URL` mà Larkwave TỰ tiêm (trỏ tới dịch vụ api), ví dụ: `fetch(`${import.meta.env.VITE_API_URL}/products`)`.',
    '- Mỗi dịch vụ tự khai báo đầy đủ dependencies trong package.json của NÓ. KHÔNG cần package.json ở thư mục gốc workspace. KHÔNG sửa .toolswave/services.json (đã đúng sẵn).',
    '- Larkwave tự cài thư viện + chạy dev cho TỪNG dịch vụ trên cổng riêng — bạn chỉ tạo file cho đúng, KHÔNG tự chạy lệnh.',
    '',
    'MONOREPO — CODE DÙNG CHUNG (BẮT BUỘC):',
    'Larkwave đã tạo sẵn 2 gói dùng chung ở THƯ MỤC GỐC workspace:',
    '- `packages/ui/` — component React DÙNG CHUNG (đã có ví dụ Button.tsx). Hãy đặt các component tái sử dụng ở đây.',
    '- `packages/shared/` — kiểu dữ liệu + tiện ích DÙNG CHUNG (types, hàm format…). Đặt type/interface/hằng số/hàm dùng chung ở đây.',
    'CÁC DỊCH VỤ FRONTEND (Vite: home' + (svcs.some((s) => s.name === 'cms') ? ', cms' : '') + ') PHẢI cấu hình để import được 2 gói này. Trong `vite.config.ts` của MỖI frontend, thêm CHÍNH XÁC:',
    "  import { fileURLToPath } from 'node:url';",
    '  // trong defineConfig:',
    "  resolve: { alias: { '@ui': fileURLToPath(new URL('../packages/ui/src', import.meta.url)), '@shared': fileURLToPath(new URL('../packages/shared/src', import.meta.url)) } },",
    "  server: { fs: { allow: ['..', '.'] } },  // cho phép Vite đọc code ở ../packages",
    "và import qua alias, ví dụ: `import { Button } from '@ui'`, `import { formatCurrency, type Id } from '@shared'`. TUYỆT ĐỐI KHÔNG copy-dán trùng lặp code giữa các frontend — dùng chung qua @ui/@shared.",
    '- Dịch vụ "api" (backend) chạy độc lập (không cần import packages/). Nếu cần kiểu dữ liệu chung có thể tự khai báo trong thư mục của nó.',
    '- KHÔNG cần cài riêng cho packages/ (chúng là source, được frontend biên dịch trực tiếp qua alias).',
  ].join('\n');
}

/** Load handoff carryover if present (consumed on real build, not on preview). */
export async function loadCarryover(appDir: string, consume: boolean): Promise<string> {
  try {
    const hp = join(appDir, 'handoff.json');
    if (!existsSync(hp)) return '';
    const h = JSON.parse(await readFile(hp, 'utf8')) as { summary?: string };
    if (!h?.summary) return '';
    if (consume) {
      const { rm } = await import('node:fs/promises');
      await rm(hp, { force: true });
    }
    return `Bối cảnh từ phiên trước (tóm tắt — app đã có sẵn các file tương ứng):\n${h.summary}\n\n`;
  } catch {
    return '';
  }
}

/** Assemble the user-message body (before system / scope backstop). */
export async function composeUserBody(
  input: CreateBuildInput,
  appDir: string,
  opts?: { carryover?: string; cloneRef?: string },
): Promise<string> {
  if (input.userPromptOverride !== undefined) return input.userPromptOverride;
  const carryover = opts?.carryover ?? (await loadCarryover(appDir, false));
  const cloneRef = opts?.cloneRef ?? '';
  return [carryover, input.prompt, cloneRef, foldBuildOptions(input), foldMultiService(input)].join('');
}

export function resolveSystemPrompt(input: CreateBuildInput, ephemeral: boolean): string {
  if (input.systemPromptOverride !== undefined) return input.systemPromptOverride;
  if (ephemeral) return HELP_SYSTEM_PROMPT;
  // Honour the chosen app type ("Loại app") so a desktop-built app scaffolds the right project.
  switch (input.track) {
    case 'mobile': return MOBILE_SYSTEM_PROMPT;
    case 'extension': return EXTENSION_SYSTEM_PROMPT;
    case 'desktop': return DESKTOP_SYSTEM_PROMPT;
    case 'game': return BUILD_SYSTEM_PROMPT + GAME_ADDENDUM;
    default: return BUILD_SYSTEM_PROMPT;
  }
}

/** Preview the exact prompt Larkwave will send to the chosen CLI runner. */
export async function composeRunnerPrompt(
  input: CreateBuildInput,
  appDir: string,
): Promise<RunnerPromptPreview> {
  const runner = getRunner(input.runner);
  const ephemeral = !!input.ephemeral;
  const system = resolveSystemPrompt(input, ephemeral);
  const user = await composeUserBody(input, appDir);
  const isClaude = runner.id === 'claude';
  const scopeBackstop = isClaude ? null : SCOPE_BACKSTOP(appDir);
  const fullText = input.fullPromptOverride
    ? input.fullPromptOverride
    : isClaude
      ? user
      : scopedPrompt({ prompt: user, mode: input.mode, cwd: appDir, appendSystemPrompt: system });
  return {
    runner: runner.id,
    runnerLabel: runner.label,
    model: input.model,
    mode: input.mode,
    cwd: appDir,
    delivery: isClaude ? 'append-system-prompt' : 'single-prompt-file',
    sections: { scopeBackstop, system, user },
    fullText,
    promptFileName: `.toolswave/${runner.id}-prompt.txt`,
  };
}

/** Persist the last composed prompt for offline inspection (`cat` / editor). */
export async function writePromptAudit(appDir: string, preview: RunnerPromptPreview): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  const dir = join(appDir, '.toolswave');
  await mkdir(dir, { recursive: true });
  const audit = [
    `# Larkwave runner prompt audit`,
    `# runner: ${preview.runnerLabel} (${preview.runner})`,
    `# model: ${preview.model ?? '(default)'}`,
    `# mode: ${preview.mode}`,
    `# delivery: ${preview.delivery}`,
    `# cwd: ${preview.cwd}`,
    '',
    preview.fullText,
  ].join('\n');
  await writeFile(join(dir, 'last-prompt-audit.txt'), audit, 'utf8');
  if (preview.delivery === 'single-prompt-file') {
    await writeFile(join(dir, `${preview.runner}-prompt.txt`), preview.fullText, 'utf8');
  }
}