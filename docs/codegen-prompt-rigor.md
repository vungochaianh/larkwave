# Codegen upgrade + fix — prompt rigor audit & changelog

> Tự đánh giá toàn bộ hệ thống **upgrade (iterate)** + **vá lỗi (auto-fix)** và siết chặt prompt.
> Lần audit: 2026-06-29 (27 agents, ~1.2M tokens, mỗi tightening được verify đối kháng với
> giao thức delta/JSON trước khi áp dụng). Dùng file này làm **checklist re-check** cho mọi
> lần sửa prompt sau.

## Đánh giá tổng thể

Bộ khung vận chuyển (transport/loop) **vững**: delta-merge bằng Map-overlay (không chỉ lời văn),
`errorSignature` chặn retry trùng, `joinFilesBudgeted` không cắt giữa file, salvage cứu JSON cụt,
`ensureBackend`/`ensureAuth` là backstop thật, SSRF + hàng rào clone có tư duy đối kháng.

Điểm yếu hệ thống — **đảm bảo bằng lời văn, không có code backstop / không validate** — đúng những
chỗ model dễ sai nhất.

> ⚠️ **Rủi ro lớn nhất:** *output thiếu/regression được ghi nhận là "thành công"*. Ba mặt:
> (1) `done:true` được tin tưởng không kiểm backend → ship app mất backend dưới tick xanh;
> (2) file bị lược `...` lọt parser rồi last-write-wins ghi đè file đang chạy tốt;
> (3) desktop CLI exit-0 bịa "Đã hoàn tất." không tự kiểm tra, không smoke-fix.

## Changelog từng phần (rigor verdict trước → sau)

| Phần | Trước | Sau | Đã siết |
|---|---|---|---|
| Fix-loop orchestrator ([pipeline.service.ts](../apps/api/src/pipeline/pipeline.service.ts)) | adequate | **+** | smoke-fix symptom nêu cả base-path/asset-404 + neo priority `main.tsx`/`index.html`/`vite.config`; fence clone tái khẳng định sau payload |
| Codegen prompts ([codegen.service.ts](../apps/api/src/engine/codegen.service.ts)) | adequate | **+** | directive web chỉ gắn cho track web; EXT/MOBILE_SYSTEM thêm anti-stub + same-language + delta; fix() thêm luật chống cắt; fallback `DEFAULT_CONFIG` mọi chỗ đọc cfg |
| LLM/JSON layer ([anthropic.service.ts](../apps/api/src/engine/anthropic.service.ts)) | adequate | **+** | `ELISION_STUB` reject file lược (3 filter: single-shot/batched/salvage); `toolJson` throw rõ khi cụt/rỗng (gated `requireNonEmpty`) |
| Blueprint schema ([blueprint.ts](../apps/api/src/engine/blueprint.ts)) | loose | **adequate** | demote `ref`→string khi thiếu refEntity, `enum`→string khi thiếu enumValues; siết mô tả field/page; ownership nudge per-user; renderBlueprint MUST "sinh đủ entity/trang" |
| Clone-from-URL ([site-clone.ts](../apps/api/src/engine/site-clone.ts)) | loose | **adequate** | defang bất biến dấu/homoglyph + strip zero-width + collapse en-dash/box-drawing + mốc đa-ngôn-ngữ |
| Editable templates ([settings.service.ts](../apps/api/src/settings/settings.service.ts)) | fragile | **adequate** | validate đủ 6 key + `{{placeholder}}` bắt buộc lúc admin lưu; codegen fallback `DEFAULT_CONFIG` nếu config DB thiếu key |
| Desktop runners ([runtime/*](../apps/desktop/main/runtime)) | fragile | **loose→adequate** | `scopedPrompt()` backstop phạm vi ghi cho codex/gemini/grok; SYSTEM thêm SỬA-TỐI-THIỂU + TỰ-KIỂM-TRA |

## Đã áp dụng (lần này) — 14 tightening / 11 file

Tất cả đã verify đối kháng + typecheck sạch (api + desktop). Regex `ELISION_STUB` và `defang`
đã test runtime (0 false-positive trên các case nhạy cảm như `const unchanged = …`, spread `[...]`).

- **#1** Validate key + `{{placeholder}}` lúc admin lưu prompt — chặn đường duy nhất hạ toàn bộ build.
- **#2** Fallback `DEFAULT_CONFIG.prompts.*` ở classify/spec/codegen/fix/guide.
- **#4** Luật chống-cắt trong `fix()` + parser `ELISION_STUB` reject (regex thu hẹp, phrase đa-từ).
- **#5/#6** Blueprint: demote ref/enum thiếu phụ thuộc; siết mô tả; ownership→per-user nudge.
- **#7** `toolJson` throw khi tool JSON cụt/rỗng thay vì trả `{}` "đã duyệt".
- **#8** Directive web chỉ cho track web; vá EXT/MOBILE_SYSTEM (anti-stub/language/delta).
- **#9** `scopedPrompt()` giới hạn phạm vi ghi cho 3 CLI non-Claude (auto-apply).
- **#10** renderBlueprint MUST + desktop SYSTEM "SỬA TỐI THIỂU" (anti-regression iterate).
- **#11** Defang clone bất biến dấu/homoglyph + tái khẳng định fence đa-ngôn-ngữ.
- **#13** Smoke-fix neo priority + symptom đỡ chỉ sai (base-path/asset-404).
- **#15** Desktop SYSTEM "TỰ KIỂM TRA TRƯỚC KHI KẾT THÚC" (import↔deps, no-stub, rename↔callers).

### Bị bỏ sau verify (KHÔNG áp dụng)

- **#3** Backend-gate trên `done:true` — verify chứng minh `accumulated` chỉ chứa delta trên path
  fix/iterate → sẽ **phá giao thức delta** (ép re-emit/bỏ sót backend). Để hậu xử lý
  (`ensureBackend`) gánh, không gate ở LLM layer.
- **#9-codex `--sandbox`** — flag theo version, codex chưa cài trên máy → sai flag là abort mọi build.
  Giữ `--dangerously-bypass`, chỉ siết bằng prompt; sandbox flag để follow-up sau khi verify version.

### Đợt 2 — đã làm nốt (hand-verified vs parser/merge + typecheck sạch)

- **#12** `fix()` attemptLine escalate từ attempt≥2: báo "bản sửa trước THẤT BẠI, đừng lặp",
  nghi ngờ giả định cũ; bỏ "sửa DỨT ĐIỂM mọi lỗi" (mâu thuẫn luật 1-nguyên-nhân-gốc).
- **#14** Fence untrusted-content đồng đều: `attachText` (text đính kèm), `ATTACHMENT_FENCE` ở
  cả `userContent` (single-shot) + `stableBlocks` (batched, trong cached prefix), và clone-scrape
  desktop (tiêu đề/URL ảnh) — đóng injection asymmetry so với cloneRef.
- **#16** `ensureBackend` thêm batch-note backend-scoped (done=false khi còn /api chưa xong) — không
  dùng BATCH_NOTE chung (nó ưu tiên App.tsx, sai ngữ cảnh).
- **#17** `DEFAULT_CONFIG.prompts` (packages/shared): codegen "Xuất qua emit_project" thay cho
  "trả JSON"; fix nói rõ delta ("CHỈ file đổi, KHÔNG xuất lại") — giữ nguyên các `{{placeholder}}`
  bắt buộc nên không vướng validation #1. → **Cross-cutting "delta phát biểu 3 kiểu" đã đóng.**

## Checklist re-check prompt (dùng cho lần sửa sau)

Mỗi prompt sinh/sửa code phải qua 13 cửa:

1. **Ambiguity** — không câu nào model đọc được 2 nghĩa.
2. **Output-contract** — delta protocol ("CHỈ file đổi, FULL content, KHÔNG re-emit, KHÔNG `...`")
   nêu rõ **VÀ** parser enforce (xem `ELISION_STUB`).
3. **Anti-regression** — cấm drop backend/file không liên quan, hạ version, đổi tên export đang import.
4. **Root-cause** (fix) — ép 1 nguyên nhân gốc, sửa nhỏ nhất, không refactor.
5. **Self-verification** — bắt model tự kiểm import↔deps, no-stub, rename↔callers.
6. **Loop-safety** — attempt N mạnh hơn attempt 1; `errorSignature` chặn lặp trùng.
7. **Token-budget** — `joinFilesBudgeted` không truncate file đang lỗi (priority anchors đúng).
8. **Context-anchoring** — blueprint đã duyệt + history được feed (MUST, không "bám sát" mềm).
9. **Backend/auth-guarantee** — prompt nhất quán với `ensureBackend`/`ensureAuth`, không mâu thuẫn.
10. **Salvage/parse** — prompt giảm xác suất JSON hỏng; salvage degrade an toàn.
11. **Injection** — mọi nội dung untrusted (clone/attach/scrape) trong fence, có re-assert đa-ngôn-ngữ.
12. **Desktop↔cloud consistency** — prompt CLI local đòi cùng mức verify + scope như cloud.
13. **Localization** — tiếng Việt không mâu thuẫn, thuật ngữ nhất quán.

**Cross-cutting cần canh:** delta protocol đang phát biểu 3 kiểu (iterate cấm `...`, fix nay đã cấm,
default `fix` editable vẫn ghi "trả JSON" — xem #17); desktop runner chưa có delta contract; fence
untrusted-content chưa đồng đều giữa cloneRef và attachText.
