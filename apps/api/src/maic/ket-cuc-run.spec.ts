import { laKetCucRun } from './ket-cuc-run';

describe('laKetCucRun', () => {
  it('các kết cục MAIC thực sự trả về đều là xong', () => {
    // Đo ngày 23/09/2026 bằng chính GET /v1/runs/:id trên máy chủ: hai lượt `interrupted` — trong
    // khi phía ta ghi “terminated” với usage 0 và đóng dấu vĩnh viễn.
    for (const s of ['succeeded', 'failed', 'cancelled', 'canceled', 'interrupted', 'timeout', 'timed_out', 'error']) {
      expect(laKetCucRun(s)).toBe(true);
    }
    expect(laKetCucRun('SUCCEEDED')).toBe(true);
    expect(laKetCucRun(' interrupted ')).toBe(true);
  });

  it('lượt còn đang chạy thì chưa xong — cứ hỏi tiếp', () => {
    // KHÔNG được coi “running” là kết cục: lúc luồng đứt mà lượt vẫn chạy, bỏ cuộc ở đây là
    // ném bỏ đúng thứ người dùng đang chợ — và đã trả tiền.
    expect(laKetCucRun('running')).toBe(false);
    expect(laKetCucRun('queued')).toBe(false);
    expect(laKetCucRun('')).toBe(false);
  });
});
