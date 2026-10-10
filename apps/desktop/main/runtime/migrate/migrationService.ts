import { homedir } from 'node:os';
import {
  findToolswaveDataDirs,
  migrateFromToolswave,
  readMarker,
  toolswaveDataDirCandidates,
  writeMarker,
  type MigrateReport,
} from './toolswaveMigrator';
import type { ToolswaveMigrationEvent, ToolswaveMigrationStatus } from '@larkwave/core';

/**
 * Điều phối việc nhập dữ liệu Toolswave ở tiến trình chính: tìm thư mục nguồn, chạy tự động MỘT
 * lần cho mỗi tài khoản (dấu ở `<userData>/migrations/toolswave-<userId>.json`), chạy lại theo
 * yêu cầu, chạy thử. Không bao giờ chạy khi chưa đăng nhập (không có user id để ánh xạ).
 */
export class ToolswaveMigrationService {
  private userId: string | null = null;
  private running: Promise<MigrateReport> | null = null;

  constructor(
    private readonly dest: string,
    private readonly emit: (ev: ToolswaveMigrationEvent) => void,
    /** Sau khi chép kỹ năng: dựng lại bản sao `larkwave-<id>` ở thư mục của các CLI. */
    private readonly afterImport: (report: MigrateReport) => void,
    private readonly env: { platform: string; home: string; appData?: string } = {
      platform: process.platform,
      home: homedir(),
      appData: process.env.APPDATA,
    },
  ) {}

  sources(): string[] {
    // Biến môi trường cho kiểm/thử nghiệm: trỏ sang một thư mục fixture thay vì dữ liệu thật.
    const override = (process.env.LARKWAVE_TOOLSWAVE_DATA_DIR ?? '').trim();
    const cands = override ? [override] : toolswaveDataDirCandidates(this.env.platform, this.env.home, this.env.appData);
    return findToolswaveDataDirs(cands, this.dest);
  }

  async status(): Promise<ToolswaveMigrationStatus> {
    const src = this.sources();
    return {
      found: src.length > 0,
      sources: src.length,
      userId: this.userId,
      last: this.userId ? await readMarker(this.dest, this.userId) : null,
      running: !!this.running,
    };
  }

  /** Gọi mỗi khi renderer đặt tài khoản. Lần đầu của một tài khoản ⇒ tự nhập (không chờ). */
  setAccount(userId: string | null): void {
    this.userId = userId || null;
    if (!this.userId) return;
    if (process.env.LARKWAVE_NO_AUTO_MIGRATE === '1') return;
    const uid = this.userId;
    void (async () => {
      const marker = await readMarker(this.dest, uid);
      if (!this.sources().length) return;
      if (!marker) {
        await this.run({ dryRun: false, auto: true }).catch(() => undefined);
        return;
      }
      // Đã nhập bằng bản CŨ (trước khi có bước nối phiên Claude): bản cũ bỏ id phiên CLI nên mọi
      // hội thoại nhập về đều "quên" ngữ cảnh gốc. Chạy MỘT lần riêng hạng mục hội thoại để nối
      // lại — không chạy lại các hạng mục khác (kỹ năng/lịch người dùng đã xoá sẽ không quay về).
      let m: MigrateReport = marker;
      if (!m.claudeRelink) {
        await this.relink(uid, m).catch(() => undefined);
        m = (await readMarker(this.dest, uid)) ?? m;
      }
      // Đã nhập bằng bản chỉ chép tệp ≤ 5 MB của hội thoại VỪA nhập: thẻ tệp cũ còn trỏ vào thư mục
      // Toolswave và chốt mở tệp từ chối. Chép bù MỘT lần mọi tệp làm việc + trỏ lại thẻ tệp.
      if (!m.filesRelink) await this.relinkFiles(uid, m).catch(() => undefined);
    })();
  }

  /** Lượt bổ sung: hội thoại + tệp làm việc + thẻ tệp. Im lặng, ghi kết quả vào dấu đã nhập. */
  private async relinkFiles(uid: string, marker: MigrateReport): Promise<void> {
    if (this.running) return;
    const report = await migrateFromToolswave({ sources: this.sources(), dest: this.dest, userId: uid, filesOnly: true });
    await writeMarker(this.dest, {
      ...marker,
      filesRelink: { at: report.at, files: report.counts.workFiles.added, links: report.counts.fileLinks.merged, skipped: report.skipped.length },
    });
  }

  /** Lượt bổ sung: chỉ hội thoại + phiên Claude, ghi kết quả vào dấu đã nhập. Im lặng (không hộp thoại). */
  private async relink(uid: string, marker: MigrateReport): Promise<void> {
    if (this.running) return;
    const report = await migrateFromToolswave({ sources: this.sources(), dest: this.dest, userId: uid, sessionsOnly: true });
    const c = report.counts.claudeSessions;
    await writeMarker(this.dest, { ...marker, claudeRelink: { at: report.at, added: c.added, merged: c.merged, unchanged: c.unchanged } });
    try {
      this.afterImport(report);
    } catch {
      /* phụ */
    }
  }

  async run(o: { dryRun: boolean; auto?: boolean }): Promise<MigrateReport> {
    if (!this.userId) throw new Error('Cần đăng nhập tài khoản (chung với Toolswave) trước khi nhập dữ liệu.');
    if (this.running) return this.running;
    const auto = !!o.auto;
    const uid = this.userId;
    this.emit({ phase: 'start', dryRun: o.dryRun, auto });
    this.running = (async () => {
      try {
        const report = await migrateFromToolswave({ sources: this.sources(), dest: this.dest, userId: uid, dryRun: o.dryRun });
        if (!o.dryRun) {
          // Lượt nhập đầy đủ đã gồm bước nối phiên Claude → đánh dấu luôn để không chạy bù.
          const c = report.counts.claudeSessions;
          report.claudeRelink = { at: report.at, added: c.added, merged: c.merged, unchanged: c.unchanged };
          report.filesRelink = { at: report.at, files: report.counts.workFiles.added, links: report.counts.fileLinks.merged, skipped: report.skipped.length };
          await writeMarker(this.dest, report);
          try {
            this.afterImport(report);
          } catch {
            /* đồng bộ kỹ năng sang CLI là phụ — không làm hỏng kết quả nhập */
          }
        }
        this.emit({ phase: 'done', report, auto });
        return report;
      } catch (e) {
        this.emit({ phase: 'error', message: (e as Error).message, auto });
        throw e;
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }
}
