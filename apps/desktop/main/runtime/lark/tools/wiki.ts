import { type LarkToolDef, enc, str } from './types';

/** Wiki — list spaces and their nodes (read-only). */
export const wikiTools: LarkToolDef[] = [
  {
    name: 'wiki_list_spaces',
    description: 'Liệt kê các không gian (spaces) Wiki mà app truy cập được.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { page_size: { type: 'integer' } },
    },
    gated: false,
    exec: (i, c) => c.request('GET', '/open-apis/wiki/v2/spaces', { params: { page_size: i.page_size ?? 50 } }),
  },
  {
    name: 'wiki_list_nodes',
    description: 'Liệt kê các node (trang) trong một không gian Wiki theo space_id.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: { space_id: str('space_id'), page_token: str('Token trang tiếp theo') },
      required: ['space_id'],
    },
    gated: false,
    exec: (i, c) =>
      c.request('GET', `/open-apis/wiki/v2/spaces/${enc(i.space_id)}/nodes`, {
        params: { page_size: 50, page_token: i.page_token },
      }),
  },
];
