import { randomUUID } from 'node:crypto';
import type { LarkChatEvent, LarkChatMode } from '@larkwave/core';
import type { LarkClient } from './larkClient';
import type { LarkToolDef } from './tools/types';
import {
  failureText,
  isFailurePayload,
  isSelfDeclaredFailure,
  suspectAppBugError,
  tierForError,
  tierForPayload, fileEventFor, runPreflight, runAdditiveCheck, needsConfirmation, previewFor, summarizeTool, memoForTool } from './larkToolExec';
import { withTurnFiles, type TurnFileContext } from './fileContext';

/**
 * Bộ công cụ + hàm THỰC THI dùng chung cho mọi đường chạy Lark agent (API trực tiếp và MAIC).
 *
 * Tách ra vì `execTool` không chỉ gọi tool: nó giữ cổng xác nhận thao tác ghi, phân loại thất bại
 * thành error/blocked/noise, và quyết định khi nào được nhắc "bản cài đã cũ". Chép lại cho đường
 * thứ hai là có hai bộ luật rồi trôi lệch — đúng cái bẫy mà chú thích trong ToolCallCard đã cảnh
 * báo. Nơi nào cần chạy tool Lark thì gọi hàm này, không tự dựng lại.
 */
export function createToolBridge(
  mode: LarkChatMode,
  deps: {
    client: LarkClient;
    extraTools?: LarkToolDef[];
    autoApprove?: boolean;
    autoApproveTool?: (name: string) => boolean;
    awaitConfirm(callId: string, name: string, input: unknown): Promise<boolean>;
    allowVersionHint?: boolean;
    /**
     * Bộ công cụ nền cho lượt này. TIÊM VÀO chứ không mặc định import `./tools`.
     *
     * Import cứng kéo `tools/index.ts` → larkUi/cmsSync/workflows → `larkWebSession` → `electron`,
     * nên bản dựng cho VM (tw-lark-runner) lôi luôn electron vào bundle rồi chết lúc khởi động với
     * `__dirname is not defined` — một lỗi chẳng nói gì về nguyên nhân. Máy nền tự đưa bộ headless.
     */
    baseTools: (m: LarkChatMode) => LarkToolDef[];
    /** Ghi chú "bản cài đã cũ". Máy nền không có khái niệm bản cài nên bỏ trống. */
    versionNote?: (allow?: boolean) => Promise<string>;
    /** Thư mục tệp của lượt — mọi lần thực thi công cụ chạy trong ngữ cảnh này (xem fileContext). */
    files?: TurnFileContext;
  },
  push: (e: LarkChatEvent) => void,
): {
  registry: Map<string, LarkToolDef>;
  execTool: (name: string, input: Record<string, unknown>) => Promise<unknown>;
} {
  const base = deps.baseTools(mode);
  const noteFn = deps.versionNote ?? (async () => '');
  const registry = new Map<string, LarkToolDef>([...base, ...(deps.extraTools ?? [])].map((t) => [t.name, t]));
  const execTool = async (name: string, input: Record<string, unknown>): Promise<unknown> => {
    const tool = registry.get(name);
    // Chữ ký kinh điển của bản cài cũ — xem larkToolExec (kể cả lý do phải PHÁT sự kiện).
    if (!tool) {
      const missId = `lt_${randomUUID()}`;
      push({ type: 'tool_call', callId: missId, name, input, gated: false });
      push({
        type: 'tool_result',
        callId: missId,
        ok: false,
        error: `Không tìm thấy tool ${name} trong bản cài này.`,
        suspectAppBug: true,
        tier: 'error',
      });
      throw new Error(`Không tìm thấy tool ${name}.` + (await noteFn(deps.allowVersionHint)));
    }
    const callId = randomUUID();
    // Kiểm trước hộp xác nhận — xem LarkToolDef.preflight / runPreflight.
    const pre = await withTurnFiles(deps.files, () => runPreflight(tool, input, deps.client));
    const dyn = pre ? undefined : await withTurnFiles(deps.files, () => runAdditiveCheck(tool, input, deps.client));
    const gated = needsConfirmation(tool, deps, !!pre, input, dyn);
    push({ type: 'tool_call', callId, name, input, gated, ...(gated ? await previewFor(tool, input) : {}) });
    if (gated) {
      const ok = await deps.awaitConfirm(callId, name, input);
      if (!ok) {
        push({ type: 'tool_denied', callId });
        throw new Error('Người dùng đã từ chối thao tác này.');
      }
    }
    try {
      const data = pre ?? (await withTurnFiles(deps.files, () => tool.exec(input, deps.client)));
      const failed = isSelfDeclaredFailure(data);
      // Xem larkToolExec: thất bại tự khai báo cũng phải hiện ra là lỗi.
      push(
        failed
          ? {
              type: 'tool_result',
              callId,
              ok: false,
              error: failureText(data),
              suspectAppBug: isFailurePayload(data),
              tier: tierForPayload(data, name),
            }
          : { type: 'tool_result', callId, ok: true, summary: summarizeTool(name, data), memo: memoForTool(name, data) || undefined },
      );
      // Thẻ tệp — luật nằm ở `fileEventFor`, dùng chung với mcpServer để hai đường không lệch.
      if (!failed) {
        const fe = fileEventFor(name, data);
        if (fe) push(fe);
      }
      // Ghi chú phiên bản dùng bộ lọc HẸP hơn: chỉ khi thất bại đáng ngờ là lỗi ứng dụng.
      if (isFailurePayload(data)) {
        const note = await noteFn(deps.allowVersionHint);
        // Chèn ghi chú vào chính dữ liệu trả về: đường này trả OBJECT cho runner, không phải chuỗi.
        if (note) return { ...(data as Record<string, unknown>), _phien_ban: note.trim() };
      }
      return data;
    } catch (e) {
      const message = (e as Error)?.message || 'lỗi tool';
      // Xem larkToolExec: nhánh ném cũng phải qua bộ phân loại.
      const suspect = suspectAppBugError(e);
      push({ type: 'tool_result', callId, ok: false, error: message, suspectAppBug: suspect, tier: tierForError(e) });
      throw new Error(message + (suspect ? await noteFn(deps.allowVersionHint) : ''));
    }
  };
  return { registry, execTool };
}
