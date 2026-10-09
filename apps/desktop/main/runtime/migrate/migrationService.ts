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
      if (await readMarker(this.dest, uid)) return; // đã nhập rồi — lần sau chỉ chạy khi bấm nút
      if (!this.sources().length) return;
      await this.run({ dryRun: false, auto: true }).catch(() => undefined);
    })();
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
