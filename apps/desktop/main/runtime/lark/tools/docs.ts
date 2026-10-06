import { type LarkToolDef, enc, str } from './types';

/** Docs/Wiki — read document content (read-only in M1). */
export const docsTools: LarkToolDef[] = [
  {
    name: 'docs_read_document',
    description:
      'Đọc toàn bộ nội dung văn bản thô của một tài liệu Lark Docx theo document_id. Gọi khi người dùng hỏi về nội dung một tài liệu.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { document_id: str('document_id của tài liệu Docx') },
      required: ['document_id'],
    },
    gated: false,
    exec: (i, c) => c.request('GET', `/open-apis/docx/v1/documents/${enc(i.document_id)}/raw_content`),
  },
];
