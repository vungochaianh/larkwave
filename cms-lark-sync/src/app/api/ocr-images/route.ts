import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const IMAGE_DIR = path.join(
  process.cwd(),
  '..',
  'anh-sua-ho-so',
  '2_2 XNK - Nghiệp Vụ Dựng Hồ Sơ_3_4 OPS SỬA_Lưới_Tập tin đính kèm',
);

export async function GET(req: NextRequest) {
  const filename = req.nextUrl.searchParams.get('file');
  if (!filename) {
    return NextResponse.json({ error: 'file param required' }, { status: 400 });
  }

  // Prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(IMAGE_DIR, safe);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const ext = path.extname(safe).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  };
  const contentType = mimeMap[ext] || 'application/octet-stream';

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
