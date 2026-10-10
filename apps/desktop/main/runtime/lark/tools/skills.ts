import type { LarkToolDef } from './types';
import { str } from './types';
import { getAgentSkillAuthor, getAgentSkillEditor, getAgentSkillFullLister, getAgentSkillLearner, getAgentSkillLister, getAgentSkillReader } from '../skillBridge';

/**
 * Cho agent TỰ TẠO kỹ năng — cả kỹ năng thường lẫn bộ kỹ năng có hợp đồng (kiểm chéo).
 *
 * Trước đây agent lên lịch được cho chính nó (`schedule_agent_job`) nhưng kỹ năng thì người dùng
 * phải tự mở màn hình Kỹ năng gõ tay. Đó là chỗ mất mát lớn nhất: agent vừa đọc xong cấu trúc
 * Base, nó biết chính xác từng bước cần khoá gì và sinh ra khoá gì — bắt người dùng chép tay lại
 * sang màn hình khác là vứt đi đúng phần ngữ cảnh khó kiếm nhất, và tên khoá chép tay thì lệch
 * nhau ngay (`gia_von` ở bước này thành `giaVon` ở bước kia, và hai cái đó không bao giờ nối được).
 */
export const skillTools: LarkToolDef[] = [
  {
    name: 'skill_list',
    description:
      'LIỆT KÊ kỹ năng trên máy (của người dùng, AI tự học, và bộ dựng sẵn "Larkwave · Tệp & dữ liệu"): id, tên, mô tả, từ khoá gọi, lệnh "/". ' +
      'Gọi TRƯỚC khi lưu kỹ năng mới (`skill_save`) để CẬP NHẬT kỹ năng đã có thay vì tạo bản trùng, hoặc khi người dùng hỏi "có kỹ năng gì".',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: { query: str('Lọc theo chữ trong tên/mô tả/từ khoá (tuỳ chọn).') } },
    exec: async (input) => {
      const list = getAgentSkillFullLister();
      if (!list) throw new Error('Chức năng đọc kỹ năng chưa sẵn sàng.');
      const q = String(input.query || '').trim().toLowerCase();
      const items = (await list()).filter((s) => !q || [s.name, s.description, ...(s.triggers ?? [])].join(' ').toLowerCase().includes(q));
      return {
        count: items.length,
        skills: items.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          enabled: s.enabled,
          ...(s.command ? { command: `/${s.command}` } : {}),
          ...(s.triggers?.length ? { triggers: s.triggers } : {}),
          kind: s.builtin ? 'dựng sẵn' : s.learned ? 'AI tự học' : 'người dùng',
        })),
      };
    },
  },
  {
    name: 'skill_save',
    description:
      'TỰ HỌC: lưu một KỸ NĂNG (chữ hướng dẫn cách làm) vào thư viện của người dùng để lần sau tự làm đúng như vậy — trong chat, lệnh "/" và lịch tự động.\n' +
      'GỌI NGAY (origin "explicit") khi người dùng đặt quy tắc lâu dài: "từ giờ…", "lần sau…", "nhớ cách này", "luôn luôn…", "mỗi khi … thì …", "from now on", "next time", "always…". ' +
      'GỌI (origin "correction") khi người dùng SỬA cách bạn làm ("không phải thế, phải là…") và cách đúng sẽ còn dùng lại. ' +
      'ĐỀ XUẤT (origin "experience") sau một việc NHIỀU BƯỚC đã đọc lại khớp mà rất có thể lặp lại, hoặc khi cùng loại yêu cầu lặp lại lần 2–3 — thẻ đề xuất hiện ra để người dùng bấm "Lưu kỹ năng". ' +
      'Học từ một Base → origin "base" (cũng là đề xuất).\n' +
      'LUẬT: gọi `skill_list` TRƯỚC — trùng ý một kỹ năng đã có thì truyền `update_id` (tool cũng tự nhận ra và cập nhật thay vì tạo bản trùng). ' +
      '`instructions` viết thành các bước rõ ràng (khi nào áp dụng → làm gì → kiểm gì), tự chứa; `triggers` 3–8 cụm từ gọi (VI + EN nếu được). ' +
      'TUYỆT ĐỐI KHÔNG ghi bí mật (mật khẩu, khoá, token, cookie) và KHÔNG viết câu cấp quyền (tự duyệt, bỏ qua xác nhận, luôn xoá/ghi đè/gửi) — tool sẽ gỡ những phần đó. ' +
      'Kỹ năng dựng sẵn (lw-*) không bị sửa: quy tắc riêng thành kỹ năng bổ sung. Xong thì nói MỘT dòng: "Đã học: «tên» — có thể hoàn tác."',
    gated: false,
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'instructions', 'origin'],
      properties: {
        name: str('Tên kỹ năng ngắn, nói rõ việc — vd "Xuất Excel kèm dòng tổng".'),
        instructions: str('Các bước hướng dẫn (markdown): khi nào áp dụng, làm gì (công cụ nào), kiểm gì, báo gì.'),
        triggers: { type: 'array', items: { type: 'string' }, description: 'Cụm từ gọi kỹ năng (VI/EN), vd ["xuất excel", "export excel"].' },
        origin: { type: 'string', enum: ['explicit', 'correction', 'experience', 'base'], description: 'explicit = người dùng dạy; correction = người dùng sửa; experience = rút từ việc vừa làm (đề xuất); base = học từ Base (đề xuất).' },
        reason: str('Một câu: vì sao học (vd "Người dùng: từ giờ khi xuất Excel thì luôn thêm dòng tổng").'),
        update_id: str('Id kỹ năng đã có cần cập nhật (từ skill_list) — bỏ trống để tool tự dò trùng ý.'),
        mode: { type: 'string', enum: ['merge', 'replace'], description: 'Cập nhật: merge (mặc định) = nối thêm mục "Bổ sung"; replace = thay toàn bộ thân (chỉ khi bạn đã đọc kỹ năng cũ bằng skill_get và viết lại đầy đủ).' },
      },
    },
    exec: async (input) => {
      const learn = getAgentSkillLearner();
      if (!learn) throw new Error('Chức năng tự học kỹ năng chưa sẵn sàng.');
      const origin = ['explicit', 'correction', 'experience', 'base'].includes(String(input.origin)) ? (String(input.origin) as 'explicit') : 'experience';
      const r = await learn({
        name: String(input.name || ''),
        instructions: String(input.instructions || ''),
        triggers: Array.isArray(input.triggers) ? input.triggers.map(String) : [],
        origin,
        reason: input.reason ? String(input.reason) : undefined,
        updateId: input.update_id ? String(input.update_id) : undefined,
        mode: input.mode === 'replace' ? 'replace' : 'merge',
      });
      if (r.mode === 'disabled') return { ok: false, error: 'Người dùng đang TẮT "Tự học kỹ năng" (màn Kỹ năng). Không lưu — nếu cần, nhắc họ bật lại.' };
      const cleaned = [
        r.removedSecrets.length ? `đã gỡ bí mật (${r.removedSecrets.join(', ')})` : '',
        r.removedGrants.length ? `đã gỡ ${r.removedGrants.length} câu cấp quyền` : '',
      ].filter(Boolean);
      if (r.mode === 'proposal') {
        return {
          ok: true,
          proposal: r.proposal,
          ...(cleaned.length ? { cleaned } : {}),
          note: 'Đã gửi ĐỀ XUẤT kỹ năng thành thẻ trong hội thoại — người dùng bấm "Lưu kỹ năng" thì mới lưu. Nói một dòng giới thiệu đề xuất, đừng lặp lại toàn bộ nội dung.',
        };
      }
      return {
        ok: true,
        learned: { id: r.id, name: r.name, action: r.action, origin, ...(r.supplementOf ? { supplementOf: r.supplementOf } : {}) },
        ...(cleaned.length ? { cleaned } : {}),
        note: `${r.action === 'create' ? 'ĐÃ HỌC' : 'ĐÃ CẬP NHẬT'} kỹ năng «${r.name}» (id ${r.id})${r.supplementOf ? ` — bổ sung cho kỹ năng dựng sẵn «${r.supplementOf}»` : ''}. Nói MỘT dòng: "Đã học: «${r.name}» — có thể hoàn tác." Áp dụng ngay từ lượt sau (chat, lệnh "/", lịch tự động).`,
      };
    },
  },
  {
    name: 'skill_get',
    description:
      'ĐỌC ĐỦ các bước của một kỹ năng theo `id` (lấy từ mục lục kỹ năng trong prompt hoặc `skill_list`). Gọi khi việc người dùng nhờ khớp một kỹ năng mà các bước chưa có sẵn trong prompt — rồi làm ĐÚNG theo các bước đó.',
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, required: ['id'], properties: { id: str('Id kỹ năng (vd "lw-xuat-bang").') } },
    exec: async (input) => {
      const read = getAgentSkillReader();
      if (!read) throw new Error('Chức năng đọc kỹ năng chưa sẵn sàng.');
      const id = String(input.id || '').trim();
      if (!id) throw new Error('Thiếu id kỹ năng.');
      const r = await read(id);
      return { ...r, kind: r.builtin ? 'dựng sẵn' : r.learned ? 'AI tự học' : 'người dùng' };
    },
  },
  {
    name: 'list_skills',
    description:
      'LIỆT KÊ các kỹ năng đã có trên máy, kèm khoá `needs`/`produces` của từng cái. ' +
      'GỌI TOOL NÀY TRƯỚC khi tạo một bộ kỹ năng nhiều bước, để DÙNG LẠI tên khoá đã có thay vì đặt ' +
      'tên đồng nghĩa — hai tên khác nhau cho cùng một thứ thì hai kỹ năng không nối được với nhau.',
    // Chỉ đọc danh sách kỹ năng trên máy — không hỏi xác nhận.
    gated: false,
    inputSchema: { type: 'object', additionalProperties: false, properties: {} },
    exec: async () => {
      const list = getAgentSkillLister();
      if (!list) throw new Error('Chức năng đọc kỹ năng chưa sẵn sàng (cần bản desktop mới hơn).');
      const items = await list();
      return {
        count: items.length,
        skills: items,
        khoa_da_dung: [...new Set(items.flatMap((s) => [...s.needs, ...s.produces]))].sort(),
      };
    },
  },
  {
    name: 'update_skill',
    description:
      'SỬA một kỹ năng ĐÃ CÓ — đổi nội dung hướng dẫn và/hoặc hợp đồng (needs/produces/checks). ' +
      'Gọi khi người dùng bảo "sửa lại kỹ năng X", hoặc khi lịch sử chạy cho thấy một kỹ năng làm sai.\n' +
      'Lấy `id` từ `list_skills`. Chỉ gửi trường muốn đổi; trường bỏ trống thì GIỮ NGUYÊN.\n' +
      'Gửi `needs`/`produces`/`checks` là THAY THẾ TOÀN BỘ danh sách cũ, không phải thêm vào — nên ' +
      'muốn thêm một khoá thì phải gửi lại cả danh sách. Đổi tên một khoá mà quên sửa kỹ năng dùng ' +
      'nó là làm ĐỨT dây nối, và bộ sẽ dừng giữa chừng.\n' +
      'Mỗi lần sửa đều được chụp lại một bản lưu, người dùng lùi về được.\n' +
      'Đây là hành động GHI — sẽ hỏi xác nhận.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: {
        id: str('Id kỹ năng cần sửa, lấy từ `list_skills`.'),
        instructions: str('Thân SKILL.md mới. Bỏ trống = giữ nguyên nội dung cũ.'),
        needs: { type: 'array', items: { type: 'string' }, description: 'THAY THẾ toàn bộ danh sách needs.' },
        produces: { type: 'array', items: { type: 'string' }, description: 'THAY THẾ toàn bộ danh sách produces.' },
        checks: { type: 'array', items: { type: 'string' }, description: 'THAY THẾ toàn bộ danh sách ràng buộc.' },
      },
    },
    gated: true,
    exec: async (input) => {
      const edit = getAgentSkillEditor();
      if (!edit) throw new Error('Chức năng sửa kỹ năng chưa sẵn sàng (cần bản desktop mới hơn).');
      const id = String(input.id || '').trim();
      if (!id) throw new Error('Thiếu id kỹ năng.');
      const list = (v: unknown): string[] | undefined =>
        Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : undefined;
      const needs = list(input.needs);
      const produces = list(input.produces);
      const checks = list(input.checks);
      const both = (needs ?? []).filter((n) => (produces ?? []).includes(n));
      if (both.length) {
        throw new Error(`Khoá vừa ở needs vừa ở produces: ${both.join(', ')} — kỹ năng sẽ tự chờ chính nó.`);
      }
      return edit({
        id,
        ...(input.instructions !== undefined ? { instructions: String(input.instructions) } : {}),
        ...(needs || produces || checks
          ? { contract: { needs: needs ?? [], produces: produces ?? [], checks: checks ?? [] } }
          : {}),
      });
    },
  },
  {
    name: 'create_skill',
    description:
      'TẠO một kỹ năng mới trên máy người dùng (ghi ra SKILL.md, bật sẵn). Gọi khi người dùng muốn ' +
      '"tạo skill", "dạy cho nhớ cách làm", hoặc muốn một QUY TRÌNH NHIỀU BƯỚC tự kiểm chéo nhau.\n' +
      '\n' +
      'HAI KIỂU:\n' +
      '• Kỹ năng thường — chỉ cần `name` + `instructions`.\n' +
      '• Bộ kỹ năng kiểm chéo — thêm `needs`/`produces`/`checks`. Khi đó THỨ TỰ CHẠY TỰ SUY RA từ dữ ' +
      'liệu, không cần đánh số bước: kỹ năng nào đủ khoá trong `needs` thì chạy được. Muốn một bộ N ' +
      'bước thì GỌI TOOL NÀY N LẦN, mỗi lần một kỹ năng, nối nhau bằng tên khoá.\n' +
      '\n' +
      'LUẬT KHOÁ (quan trọng, sai là bộ không chạy):\n' +
      '1. Tên khoá: chữ thường không dấu, nối bằng gạch dưới — vd `gia_von`, `ten_hang`.\n' +
      '2. `needs` chỉ gồm khoá kỹ năng này ĐỌC mà không tự tạo ra. Bước đầu tiên để mảng rỗng.\n' +
      '3. `produces` chỉ gồm khoá nó THỰC SỰ tính ra. Mỗi khoá chỉ được ĐÚNG MỘT kỹ năng sinh ra.\n' +
      '4. Một khoá không được vừa ở `needs` vừa ở `produces` (kỹ năng sẽ tự chờ chính nó).\n' +
      '5. `checks` là ràng buộc phải LUÔN đúng kể cả sau khi kỹ năng khác chạy, vd "gia_ban >= gia_von * 1.2". ' +
      'Không nghĩ ra ràng buộc thật thì để rỗng — ràng buộc bịa còn hại hơn không có.\n' +
      '6. Gọi `list_skills` TRƯỚC để dùng lại tên khoá đã có.\n' +
      '\n' +
      'Trong `instructions`, kỹ năng có `produces` PHẢI kết thúc bằng một khối ```facts ghi các khoá đó, ' +
      'mỗi dòng `khoa: giá trị`.\n' +
      'Đây là hành động GHI (tạo tệp trên máy) — sẽ hỏi xác nhận.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'instructions'],
      properties: {
        name: str('Tên kỹ năng, ngắn và nói rõ việc — vd "Tra giá vốn".'),
        instructions: str(
          'Thân SKILL.md: KHI NÀO dùng và LÀM GÌ, dạng các bước. Có `produces` thì kết thúc bằng khối ```facts.',
        ),
        command: str('"/lệnh" tắt, không kèm dấu "/" (tuỳ chọn), vd "tra-gia-von".'),
        tags: { type: 'array', items: { type: 'string' }, description: 'Nhãn phân loại, vd ["Lark"].' },
        needs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Khoá cần có TRƯỚC khi chạy. Bỏ trống = chạy được ngay từ đầu.',
        },
        produces: {
          type: 'array',
          items: { type: 'string' },
          description: 'Khoá kỹ năng này sinh ra. Bỏ trống = kỹ năng thường, không tham gia kiểm chéo.',
        },
        checks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Ràng buộc luôn phải đúng. Ưu tiên biểu thức so sánh máy tự tính được.',
        },
        target_table: str('Chỉ cho kỹ năng trích xuất rồi GHI bảng: tên bảng đích trong Base.'),
        target_base: str('Tên Base chứa bảng đích (bỏ trống = Base đang dùng).'),
        target_map: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'khoá trong `produces` → TÊN CỘT trong bảng đích. Khoá không có ở đây thì không ghi.',
        },
      },
    },
    gated: true,
    exec: async (input) => {
      const author = getAgentSkillAuthor();
      if (!author) throw new Error('Chức năng tạo kỹ năng chưa sẵn sàng (cần bản desktop mới hơn).');
      const name = String(input.name || '').trim();
      const instructions = String(input.instructions || '').trim();
      if (!name) throw new Error('Thiếu tên kỹ năng.');
      if (!instructions) throw new Error('Thiếu nội dung kỹ năng (instructions).');

      const list = (v: unknown): string[] =>
        Array.isArray(v) ? v.map((x) => String(x ?? '').trim()).filter(Boolean) : [];
      const needs = list(input.needs);
      const produces = list(input.produces);
      const checks = list(input.checks);

      // Chặn ngay tại đây chứ không đợi lúc chạy bộ: một kỹ năng vừa cần vừa sinh ra cùng một khoá
      // sẽ không bao giờ được `readySkills` chọn tới, và người dùng chỉ thấy báo "bế tắc" mà không
      // hiểu vì sao. Nói thẳng cho agent sửa lại còn rẻ hơn nhiều.
      const both = needs.filter((n) => produces.includes(n));
      if (both.length) {
        throw new Error(
          `Khoá vừa nằm ở needs vừa ở produces: ${both.join(', ')}. Kỹ năng sẽ tự chờ chính nó — bỏ khỏi một trong hai.`,
        );
      }

      const table = String(input.target_table || '').trim();
      const contract =
        needs.length || produces.length || checks.length || table
          ? {
              needs,
              produces,
              checks,
              ...(table
                ? {
                    target: {
                      table,
                      base: input.target_base ? String(input.target_base) : undefined,
                      map: (input.target_map as Record<string, string>) || {},
                    },
                  }
                : {}),
            }
          : undefined;

      return author({
        name,
        instructions,
        command: input.command ? String(input.command) : undefined,
        tags: list(input.tags),
        contract,
      });
    },
  },
];
