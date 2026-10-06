import type { ClipboardEvent } from "react";

/**
 * Pasted plain text longer than this (characters) is turned into a `.txt`
 * attachment instead of being dropped inline — the same UX as chatting with
 * Claude, where a big paste collapses into a file chip and keeps the box tidy.
 */
export const PASTE_TO_FILE_THRESHOLD = 1600;

/**
 * Claude-style paste handling for a prompt box:
 *   • clipboard carries real files (screenshots, PDFs, Word/Excel…) → upload them
 *     as attachments;
 *   • clipboard carries a very large block of plain text → convert it to a `.txt`
 *     attachment so the textarea stays readable.
 *
 * Returns `true` when it consumed the paste (it has already called
 * `preventDefault`), `false` to let the normal inline paste happen.
 */
export function handlePromptPaste(
  e: ClipboardEvent<HTMLTextAreaElement>,
  addFiles: (files: File[]) => void | Promise<void>,
): boolean {
  const cd = e.clipboardData;
  if (!cd) return false;

  // 1) Real files on the clipboard (image screenshots, dragged-in docs, …).
  const files = Array.from(cd.files || []);
  if (files.length) {
    e.preventDefault();
    void addFiles(files);
    return true;
  }

  // 2) A large block of plain text → fold it into a .txt attachment.
  const text = cd.getData("text");
  if (text && text.length > PASTE_TO_FILE_THRESHOLD) {
    e.preventDefault();
    void addFiles([new File([text], pastedName(text), { type: "text/plain" })]);
    return true;
  }

  return false;
}

/** A friendly, informative filename for a pasted-text attachment. */
function pastedName(text: string): string {
  return `Nội dung dán (${text.length.toLocaleString("vi-VN")} ký tự).txt`;
}
