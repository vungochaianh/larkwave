import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../config/app-config.service';

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/**
 * Resolves user-uploaded attachments (the shared `Upload` table, /v1/uploads) into what the Marketing
 * generators can use: concatenated SOURCE TEXT (docx/txt/md/csv…) fed into the prompt, and IMAGE URLs
 * (uploaded images written to a served file) to embed in the output. PDFs (stored for Claude vision)
 * are skipped here since MAIC is text-only.
 */
@Injectable()
export class AttachmentService {
  private readonly log = new Logger(AttachmentService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async resolve(userId: string, ids: string[] | undefined): Promise<{ sourceText: string; imageUrls: string[] }> {
    if (!ids?.length) return { sourceText: '', imageUrls: [] };
    const rows = await this.prisma.upload.findMany({ where: { id: { in: ids.slice(0, 20) }, ownerId: userId } });
    const texts: string[] = [];
    const imageUrls: string[] = [];
    for (const r of rows) {
      if (r.kind === 'image') {
        const url = await this.writeImage(r.mime, r.data).catch(() => '');
        if (url) imageUrls.push(url);
      } else if (r.kind === 'text') {
        texts.push(`----- TÀI LIỆU: ${r.name} -----\n${r.data}`);
      }
      // r.kind === 'pdf' (base64 for Claude vision) is not usable by MAIC → skipped.
    }
    return { sourceText: texts.join('\n\n').slice(0, 24000), imageUrls: imageUrls.slice(0, 10) };
  }

  private async writeImage(mime: string, base64: string): Promise<string> {
    const ext = EXT[mime] || 'png';
    const dir = join(this.config.uploadsDir, 'attachments');
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    await fs.writeFile(join(dir, name), Buffer.from(base64, 'base64'));
    return `${this.config.publicApiUrl}/uploads/attachments/${name}`;
  }
}
