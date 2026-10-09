import { readFileSync, writeFileSync } from 'node:fs';
const D = process.argv[2];
const g = readFileSync(`${D}/lark-base-workflow.md`, 'utf8');
const s = readFileSync(`${D}/lark-base-workflow-schema.md`, 'utf8');
const l = readFileSync(`${D}/LICENSE.larksuite-cli`, 'utf8');
const out = `/**
 * Tài liệu chính thức về Workflow của Lark Base (Open API v3), nhúng nguyên văn vào app.
 *
 * Nguồn: github.com/larksuite/cli @ cff1bdadbf8c8ab6601330bfbfca8610f9292e84
 *   skills/lark-base/references/lark-base-workflow.md
 *   skills/lark-base/references/lark-base-workflow-schema.md
 * Copyright (c) 2026 Lark Technologies Pte. Ltd. — MIT License (xem docs/LICENSE.larksuite-cli).
 *
 * Vì sao là chuỗi TS chứ không đọc .md lúc chạy: main process được webpack gói lại, tệp .md cạnh mã
 * nguồn KHÔNG đi theo bản cài. Hai tệp .md trong thư mục này là bản gốc; bài kiểm
 * test/workflowV3.cjs đối chiếu từng byte để chuỗi dưới đây không lệch khỏi chúng.
 * Cập nhật: chép bản .md mới vào docs/ rồi chạy
 *   node apps/desktop/main/runtime/lark/docs/gen-workflow-docs.mjs apps/desktop/main/runtime/lark/docs
 */
export const LARK_WORKFLOW_GUIDE_MD: string = ${JSON.stringify(g)};

export const LARK_WORKFLOW_SCHEMA_MD: string = ${JSON.stringify(s)};

/** Giấy phép MIT của nguồn — phải đi kèm mọi bản sao, nên nằm trong mã (sống sót qua webpack). */
export const LARK_CLI_LICENSE: string = ${JSON.stringify(l)};

export const LARK_DOCS_SOURCE = 'github.com/larksuite/cli (MIT, © 2026 Lark Technologies Pte. Ltd.) — skills/lark-base/references @ cff1bdad';
`;
writeFileSync(`${D}/workflowDocs.ts`, out);
