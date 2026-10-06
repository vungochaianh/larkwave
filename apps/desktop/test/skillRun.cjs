/**
 * Vòng lặp chạy bộ skill: thứ tự tự suy ra, kiểm sau MỖI bước, chạy lại đúng skill gây lỗi.
 *
 * Chạy được toàn bộ vòng lặp mà KHÔNG cần mô hình thật vì `runTurn` được tiêm vào — nếu không thì
 * phần logic đắt nhất của tính năng này chỉ kiểm được bằng cách ngồi thử tay với AI, tức là không
 * kiểm được.
 */
const assert = require('node:assert');
const { parseSkillContract } = require('../.test-build/core/skillContract.js');
const { runSkillSet } = require('../.test-build/runtime/lark/skillRun.js');

const mk = (id, front) => parseSkillContract(id, id, `---\nname: ${id}\n${front}\n---\n\nnội dung ${id}`);
const facts = (o) => '```facts\n' + Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n```';

(async () => {
  // ── thứ tự tự suy ra: người dùng viết s3 trước, nhưng s3 cần khoá của s1 ─────────────
  {
    const contracts = [
      mk('s3', 'needs: [b]\nproduces: [c]'),
      mk('s1', 'produces: [a]'),
      mk('s2', 'needs: [a]\nproduces: [b]'),
    ];
    const bodies = new Map(contracts.map((c) => [c.id, 'làm việc']));
    const order = [];
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async (p) => {
        const id = p.match(/\[KỸ NĂNG: (\w+)\]/)[1];
        order.push(id);
        return facts({ s1: { a: 1 }, s2: { b: 2 }, s3: { c: 3 } }[id]);
      },
      emit: () => {},
    });
    // Dù s3 đứng ĐẦU danh sách, nó phải chạy CUỐI — thứ tự do dữ liệu quyết định.
    assert.deepStrictEqual(order, ['s1', 's2', 's3']);
    assert.deepStrictEqual(res.facts, { a: 1, b: 2, c: 3 });
    assert.strictEqual(res.blocked.length, 0);
    assert.strictEqual(res.failing.length, 0);
  }

  // ── kiểm chéo: skill sau phá ràng buộc, nó bị bắt chạy lại và sửa được ───────────────
  {
    const contracts = [
      mk('dinhgia', 'needs: [gia_von]\nproduces: [gia_ban]\nchecks:\n  - gia_ban >= gia_von'),
      mk('khuyenmai', 'needs: [gia_ban]\nproduces: [gia_km]\nchecks:\n  - gia_km >= gia_von'),
    ];
    const bodies = new Map(contracts.map((c) => [c.id, 'làm việc']));
    let kmAttempt = 0;
    const events = [];
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async (p) => {
        const id = p.match(/\[KỸ NĂNG: (\w+)\]/)[1];
        if (id === 'dinhgia') return facts({ gia_ban: 150 });
        kmAttempt += 1;
        // Lần đầu hạ giá dưới giá vốn → phải bị bắt. Lần sau sửa lại.
        return facts({ gia_km: kmAttempt === 1 ? 80 : 110 });
      },
      emit: (e) => events.push(e),
      }, { seedFacts: { gia_von: 100 } });

    assert.strictEqual(kmAttempt, 2, 'skill sai phải được chạy lại đúng một lần');
    assert.strictEqual(res.facts.gia_km, 110);
    assert.strictEqual(res.failing.length, 0, 'sửa xong thì không còn ràng buộc nào sai');
    // Phải có sự kiện mâu thuẫn nêu ĐÚNG skill gây ra, để giao diện chỉ được chỗ sai.
    const conflict = events.find((e) => e.type === 'conflict');
    assert.ok(conflict, 'phải báo mâu thuẫn');
    assert.strictEqual(conflict.retryingSkill, 'khuyenmai');
  }

  // ── KIỂM CHÉO THẬT: B làm gãy ràng buộc mà A khai → B phải bị bắt sửa ───────────────
  //
  // Đây là ca lõi của cả tính năng, và bộ kiểm đầu tiên KHÔNG chạm tới nó: hồi đó vòng lặp lọc
  // ràng buộc theo `owner === kỹ năng đang chạy`, nên ca này lặng lẽ được cho qua. Người phải sửa
  // là người VỪA ĐỔI dữ liệu, không phải người đã viết ra ràng buộc.
  {
    const contracts = [
      // A khai ràng buộc về `gia_km` — một khoá A KHÔNG sinh ra.
      mk('kiemsoat', 'produces: [gia_von]\nchecks:\n  - gia_km >= gia_von'),
      mk('khuyenmai', 'needs: [gia_von]\nproduces: [gia_km]'),
    ];
    const bodies = new Map(contracts.map((c) => [c.id, 'x']));
    let kmAttempt = 0;
    const events = [];
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async (p) => {
        const id = p.match(/\[KỸ NĂNG: (\w+)\]/)[1];
        if (id === 'kiemsoat') return facts({ gia_von: 100 });
        kmAttempt += 1;
        return facts({ gia_km: kmAttempt === 1 ? 50 : 120 });
      },
      emit: (e) => events.push(e),
    });
    assert.strictEqual(kmAttempt, 2, 'kỹ năng VỪA CHẠY phải bị bắt sửa, dù ràng buộc của kỹ năng khác');
    assert.strictEqual(res.facts.gia_km, 120);
    assert.strictEqual(res.failing.length, 0);
    const conflict = events.find((e) => e.type === 'conflict');
    assert.strictEqual(conflict.retryingSkill, 'khuyenmai');
    // Câu nhắc phải nêu ràng buộc của A, để mô hình biết nó vi phạm cái gì.
    assert.ok(conflict.failing[0].check.raw.includes('gia_km'), conflict.failing[0].check.raw);
  }

  // Ràng buộc đã gãy TỪ TRƯỚC không được bắt kỹ năng sau chạy lại — nó không gây ra cái đó.
  {
    const contracts = [
      mk('a', 'produces: [x]\nchecks:\n  - x >= 100'),
      mk('b', 'needs: [x]\nproduces: [y]'),
    ];
    const bodies = new Map(contracts.map((c) => [c.id, 'x']));
    const calls = {};
    await runSkillSet(contracts, bodies, {
      runTurn: async (p) => {
        const id = p.match(/\[KỸ NĂNG: (\w+)\]/)[1];
        calls[id] = (calls[id] || 0) + 1;
        return facts(id === 'a' ? { x: 5 } : { y: 1 });
      },
      emit: () => {},
    }, { maxRetriesPerSkill: 1 });
    // a: 1 lần đầu + 1 lần thử lại. b: đúng 1 lần — ràng buộc gãy là của a, không phải lỗi b.
    assert.strictEqual(calls.a, 2);
    assert.strictEqual(calls.b, 1, 'kỹ năng sau không bị phạt vì lỗi có sẵn');
  }

  // ── skill cố chấp: hết lượt thử vẫn sai thì phải DỪNG và báo, không quay vòng vô hạn ──
  {
    const contracts = [mk('buongbinh', 'produces: [x]\nchecks:\n  - x >= 100')];
    const bodies = new Map([['buongbinh', 'làm việc']]);
    let calls = 0;
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async () => { calls += 1; return facts({ x: 5 }); },
      emit: () => {},
    }, { maxRetriesPerSkill: 2 });
    assert.strictEqual(calls, 3, 'một lần đầu + đúng 2 lần thử lại, rồi thôi');
    assert.strictEqual(res.failing.length, 1);
    assert.ok(res.failing[0].reason.includes('SAI'));
  }

  // ── một lượt agent hỏng KHÔNG được làm sập cả bộ ────────────────────────────────────
  //
  // Bộ 7 kỹ năng chạy vài phút; ném ra ngoài vì một sự cố mạng là người dùng mất sạch công của
  // những kỹ năng đã xong. Kỹ năng hỏng bị bỏ qua, phần còn lại chạy tiếp.
  {
    const contracts = [
      mk('hong', 'produces: [a]'),
      mk('lanh', 'produces: [b]'),
    ];
    const bodies = new Map(contracts.map((c) => [c.id, 'x']));
    const events = [];
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async (p) => {
        const id = p.match(/\[KỸ NĂNG: (\w+)\]/)[1];
        if (id === 'hong') throw new Error('quá thời gian chạy');
        return facts({ b: 7 });
      },
      emit: (e) => events.push(e),
    }, { maxRetriesPerSkill: 1 });

    assert.strictEqual(res.facts.b, 7, 'kỹ năng lành vẫn phải chạy xong');
    assert.ok(!('a' in res.facts));
    // Phải NÓI ra, kèm lý do — im lặng bỏ qua thì người dùng không hiểu vì sao thiếu khoá.
    const said = events.filter((e) => e.type === 'blocked' || e.type === 'note');
    assert.ok(said.some((e) => JSON.stringify(e).includes('quá thời gian')), JSON.stringify(said));
  }

  // Lượt hỏng rồi thử lại được thì coi như bình thường — sự cố mạng thường qua nhanh.
  {
    const contracts = [mk('chapchon', 'produces: [a]')];
    const bodies = new Map([['chapchon', 'x']]);
    let n = 0;
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async () => {
        n += 1;
        if (n === 1) throw new Error('mất mạng');
        return facts({ a: 42 });
      },
      emit: () => {},
    }, { maxRetriesPerSkill: 2 });
    assert.strictEqual(res.facts.a, 42);
    assert.deepStrictEqual(res.ran, ['chapchon']);
  }

  // ── bế tắc phải NÓI thiếu khoá gì, và phân biệt "chờ" với "không ai sinh ra" ─────────
  {
    const contracts = [mk('canGiaVon', 'needs: [gia_von]\nproduces: [y]')];
    const bodies = new Map([['canGiaVon', 'làm việc']]);
    const events = [];
    const res = await runSkillSet(contracts, bodies, { runTurn: async () => '', emit: (e) => events.push(e) });
    assert.strictEqual(res.ran.length, 0, 'không đủ dữ liệu thì KHÔNG được chạy');
    assert.strictEqual(res.blocked.length, 1);
    assert.deepStrictEqual(res.blocked[0].nobodyProduces, ['gia_von']);
    const blocked = events.find((e) => e.type === 'blocked');
    assert.ok(blocked.detail.includes('gia_von'), blocked.detail);
    assert.ok(blocked.detail.includes('từ ngoài'), 'phải nói rõ là phải cung cấp từ ngoài');
  }

  // ── hai skill cùng sinh một khoá: chặn TRƯỚC khi chạy, không chạy rồi mới biết ───────
  {
    const contracts = [mk('a', 'produces: [gia]'), mk('b', 'produces: [gia]')];
    const bodies = new Map(contracts.map((c) => [c.id, 'x']));
    let called = false;
    const events = [];
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async () => { called = true; return ''; },
      emit: (e) => events.push(e),
    });
    assert.strictEqual(called, false, 'xung đột hợp đồng thì không được chạy lượt nào');
    assert.strictEqual(res.ran.length, 0);
    assert.ok(events.find((e) => e.type === 'blocked').detail.includes('gia'));
  }

  // ── skill không được ghi đè khoá của skill khác ──────────────────────────────────────
  {
    const contracts = [mk('s1', 'produces: [a]'), mk('s2', 'needs: [a]\nproduces: [b]')];
    const bodies = new Map(contracts.map((c) => [c.id, 'x']));
    const events = [];
    const res = await runSkillSet(contracts, bodies, {
      runTurn: async (p) => {
        const id = p.match(/\[KỸ NĂNG: (\w+)\]/)[1];
        // s2 cố ghi đè `a` — phải bị bỏ qua, nếu không nó âm thầm phá kết quả của s1.
        return id === 's1' ? facts({ a: 1 }) : facts({ b: 2, a: 999 });
      },
      emit: (e) => events.push(e),
    });
    assert.strictEqual(res.facts.a, 1, 'khoá của s1 phải còn nguyên');
    assert.ok(events.find((e) => e.type === 'note' && e.text.includes('a')), 'phải ghi nhận là đã bỏ qua');
  }

  // ── ràng buộc bằng lời: không có `judge` thì ở nguyên "chưa kiểm được" ───────────────
  {
    const contracts = [mk('s1', 'produces: [mo_ta, danh_muc]\nchecks:\n  - "mo_ta phai khop danh_muc"')];
    const bodies = new Map([['s1', 'x']]);
    const noJudge = await runSkillSet(contracts, bodies, {
      runTurn: async () => facts({ mo_ta: 'Ao', danh_muc: 'Thoi trang' }),
      emit: () => {},
    });
    assert.strictEqual(noJudge.checks[0].verdict, 'unknown', 'không có người phán thì KHÔNG được tự nhận đã kiểm');

    const withJudge = await runSkillSet(contracts, bodies, {
      runTurn: async () => facts({ mo_ta: 'Ao', danh_muc: 'Thoi trang' }),
      judge: async () => 'fail',
      emit: () => {},
    });
    assert.strictEqual(withJudge.checks[0].verdict, 'fail');
  }

  console.log('✓ skillRun: thứ tự tự ra, kiểm sau mỗi bước, chạy lại đúng skill sai, bế tắc nói rõ');
})().catch((e) => {
  console.error('✗', e);
  process.exit(1);
});
