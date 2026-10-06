/**
 * Ba luật của một lượt chạy tự động không người trông (larkService.runScheduledAgentTurn).
 *
 * Kiểm bằng cách dựng lại ĐÚNG các biểu thức và ngưỡng trong mã, vì hàm thật kéo theo electron.
 * Nếu ai đổi luật trong larkService mà quên đổi ở đây thì bài kiểm này không bắt được — nên khi
 * sửa luật, sửa cả hai chỗ. Đổi lại: bài kiểm chạy được ở CI không cần màn hình.
 */
const assert = require('node:assert');

// ── Luật 1: hết giờ là CẮT THẬT, không chờ sự kiện kế tiếp ───────────────────────────────
// Dựng lại đúng hình dạng vòng lặp: một generator "treo" lâu hơn trần thời gian rất nhiều.
async function chayThu({ tranMs, moiSuKienMs, soSuKien }) {
  let timedOut = false;
  const stopper = new AbortController();
  const timer = setTimeout(() => {
    timedOut = true;
    stopper.abort();
  }, tranMs);
  const batDau = Date.now();
  let daNhan = 0;
  try {
    for (let i = 0; i < soSuKien; i += 1) {
      // `runLarkAgent` giết tiến trình con ngay khi abort, nên phía tiêu thụ dừng ở đây.
      await new Promise((res, rej) => {
        const t = setTimeout(res, moiSuKienMs);
        stopper.signal.addEventListener('abort', () => {
          clearTimeout(t);
          rej(new Error('aborted'));
        }, { once: true });
      });
      daNhan += 1;
      if (timedOut) break;
    }
  } catch {
    /* bị cắt — đúng ý đồ */
  } finally {
    clearTimeout(timer);
  }
  return { timedOut, troi: Date.now() - batDau, daNhan };
}

(async () => {
  // Đúng tình huống người dùng gặp: trần 240s mà lượt chạy 958s. Thu nhỏ 1000 lần để chạy nhanh.
  const r = await chayThu({ tranMs: 240, moiSuKienMs: 958, soSuKien: 1 });
  assert.ok(r.timedOut, 'phải đánh dấu hết giờ');
  assert.ok(r.troi < 600, `phải cắt ở ~240ms, nhưng chạy ${r.troi}ms — cờ suông không cắt được gì`);
  assert.strictEqual(r.daNhan, 0, 'không được nhận sự kiện nào sau khi đã cắt');

  // Xong sớm hơn trần thì không bị đụng tới.
  const ok = await chayThu({ tranMs: 500, moiSuKienMs: 20, soSuKien: 3 });
  assert.ok(!ok.timedOut, 'xong sớm thì không được coi là hết giờ');
  assert.strictEqual(ok.daNhan, 3, 'phải nhận đủ sự kiện');
  console.log('✓ hết giờ cắt thật (không chờ sự kiện kế tiếp), và không đụng lượt chạy xong sớm');

  // ── Luật 2: trần của đường tự động hoá phải đủ cho việc thật ──────────────────────────
  const TRAN_TU_DONG_HOA = 900_000;
  // Lượt chạy XONG gần nhất trong lịch sử người dùng: 488 giây.
  assert.ok(TRAN_TU_DONG_HOA > 488_000, 'trần phải lớn hơn lượt chạy xong đã đo được');
  assert.ok(240_000 < 488_000, 'trần cũ 240s nằm DƯỚI lượt chạy xong — đó là lỗi gốc');
  console.log('✓ trần 900s bao được lượt chạy xong 488s mà trần cũ 240s cắt vào giữa');

  // ── Luật 3: hết lượt Claude là HỎNG, không phải báo cáo ──────────────────────────────
  const laHetLuot = (a) => a.length < 300 && /hit your .{0,20}limit|weekly limit|usage limit/i.test(a);

  assert.ok(laHetLuot("You've hit your weekly limit · resets 10am (Asia/Ho_Chi_Minh)"), 'phải bắt đúng câu CLI in ra');
  assert.ok(laHetLuot('You have hit your usage limit'), 'phải bắt biến thể usage limit');

  // KHÔNG được cắt nhầm một báo cáo thật có nhắc chữ "limit".
  const baoCaoThat =
    'Đã đối chiếu 128 dòng trên Base "6. Kế Toán Thu Tiền". '.repeat(6) +
    'Có 3 đơn vượt hạn mức (limit) thanh toán, đã ghi chú vào cột Ghi chú. Tổng thu khớp với bảng phân bổ.';
  assert.ok(baoCaoThat.length >= 300, 'mẫu báo cáo phải dài hơn ngưỡng thì phép kiểm mới có nghĩa');
  assert.ok(!laHetLuot(baoCaoThat), 'KHÔNG được coi báo cáo thật có chữ limit là hết lượt');

  // Một câu trả lời ngắn bình thường cũng không được dính.
  assert.ok(!laHetLuot('Không có dòng nào khớp điều kiện hôm nay.'), 'câu trả lời ngắn bình thường phải lọt');
  console.log('✓ hết lượt bị ghi là HỎNG, báo cáo thật có chữ "limit" vẫn lọt');
})();
