// Blueprint helpers for the design-intake stage: the JSON tool schema the model
// fills, a defensive normalizer (the model may omit/garble fields), and a
// compact text rendering injected into the spec/codegen prompt so the approved
// pages + data model actually drive generation. SQL itself is still emitted by
// the codegen stage (WEB_SYSTEM) from this spec — the Blueprint is the plan.

import { Blueprint, BackendKind, BpEntity, BpField, BpPage } from '@larkwave/shared';

/** JSON schema for the forced `emit_blueprint` tool-use. Permissive on optionals. */
export const BLUEPRINT_TOOL_SCHEMA = {
  type: 'object',
  properties: {
    appName: { type: 'string', description: 'Tên sản phẩm ngắn 2–4 từ (KHÔNG phải câu lệnh của người dùng).' },
    summary: { type: 'string', description: '1–2 câu mô tả mục đích app.' },
    backend: {
      type: 'string',
      enum: ['static', 'fullstack'],
      description:
        'fullstack khi app cần lưu/đọc dữ liệu chung nhiều phiên (CRUD, người dùng, đặt chỗ, tồn kho); ' +
        'static khi mọi thứ xử lý trong trình duyệt (máy tính, landing, game, công cụ chuyển đổi).',
    },
    pages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          title: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['list', 'detail', 'form', 'dashboard', 'landing', 'auth'],
            description:
              'list=danh sách bản ghi, detail=xem 1 bản ghi, form=tạo/sửa, dashboard=tổng quan số liệu, ' +
              'landing=trang giới thiệu, auth=đăng nhập/đăng ký.',
          },
          entity: {
            type: 'string',
            description:
              'Tên entity — PHẢI khớp đúng một entities[].name. BẮT BUỘC cho kind list/detail/form; ' +
              'nếu không có entity tương ứng, đổi kind sang dashboard/landing.',
          },
          requiresAuth: { type: 'boolean' },
        },
        required: ['path', 'title', 'kind'],
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          ownership: {
            type: 'string',
            enum: ['public', 'per-user', 'shared'],
            description:
              'public=mọi người đọc/ghi chung (CHỈ cho dữ liệu thực sự công khai); ' +
              'per-user=mỗi người chỉ thấy bản ghi của mình (mặc định an toàn cho dữ liệu cá nhân); ' +
              'shared=đăng nhập mới xem, dùng chung. Nếu không chắc, chọn per-user — KHÔNG để public dữ liệu riêng tư.',
          },
          ops: { type: 'array', items: { type: 'string', enum: ['list', 'read', 'create', 'update', 'delete'] } },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                type: {
                  type: 'string',
                  enum: ['string', 'text', 'int', 'float', 'bool', 'datetime', 'json', 'enum', 'ref'],
                  description:
                    'ref=khoá ngoại — BẮT BUỘC điền refEntity (tên một entities[].name). ' +
                    'enum=danh sách cố định — BẮT BUỘC điền enumValues (≥2 giá trị). ' +
                    'Nếu chưa biết target/giá trị, dùng "string", KHÔNG để trống.',
                },
                required: { type: 'boolean' },
                unique: { type: 'boolean' },
                enumValues: { type: 'array', items: { type: 'string' } },
                refEntity: { type: 'string' },
              },
              required: ['name', 'type'],
            },
          },
        },
        required: ['name', 'fields'],
      },
    },
    auth: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'true CHỈ khi app thực sự cần tài khoản người dùng riêng.' },
        providers: { type: 'array', items: { type: 'string', enum: ['email', 'google'] } },
        roles: { type: 'array', items: { type: 'string' } },
      },
      required: ['enabled'],
    },
    integrations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['email', 'payment', 'storage', 'webhook', 'none'] },
          note: { type: 'string' },
        },
        required: ['kind'],
      },
    },
    navigation: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, pagePath: { type: 'string' } },
        required: ['label', 'pagePath'],
      },
    },
  },
  required: ['appName', 'summary', 'pages', 'entities'],
} as const;

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const asStr = (v: unknown, fallback = ''): string => (typeof v === 'string' && v.trim() ? v : fallback);

const FIELD_TYPES = new Set(['string', 'text', 'int', 'float', 'bool', 'datetime', 'json', 'enum', 'ref']);
const PAGE_KINDS = new Set(['list', 'detail', 'form', 'dashboard', 'landing', 'auth']);

function normField(f: Partial<BpField>): BpField | null {
  const name = asStr(f?.name);
  if (!name) return null;
  let type = (FIELD_TYPES.has(f?.type as string) ? f!.type : 'string') as BpField['type'];
  const enumValues = Array.isArray(f?.enumValues) ? f!.enumValues.filter(Boolean) : [];
  const refEntity = asStr(f?.refEntity);
  // Demote a conditional type whose REQUIRED dependency is missing. The whole point
  // of the blueprint is to carry the FK target / allowed values the LLM can't
  // reconstruct downstream — a dangling enum (no values) or ref (no target) would
  // leak into schema.sql as a guess; a plain string column is strictly safer.
  if (type === 'enum' && enumValues.length < 1) type = 'string';
  if (type === 'ref' && !refEntity) type = 'string';
  return {
    name,
    type,
    ...(f?.required ? { required: true } : {}),
    ...(f?.unique ? { unique: true } : {}),
    ...(type === 'enum' && enumValues.length ? { enumValues } : {}),
    ...(type === 'ref' && refEntity ? { refEntity } : {}),
  };
}

function normEntity(e: Partial<BpEntity>): BpEntity | null {
  const name = asStr(e?.name);
  if (!name) return null;
  const fields = asArray<Partial<BpField>>(e?.fields).map(normField).filter((x): x is BpField => !!x);
  const ownership = (['public', 'per-user', 'shared'].includes(e?.ownership as string)
    ? e!.ownership
    : 'public') as BpEntity['ownership'];
  const ops = asArray<string>(e?.ops).filter((o) =>
    ['list', 'read', 'create', 'update', 'delete'].includes(o),
  ) as BpEntity['ops'];
  return {
    name,
    label: asStr(e?.label, name),
    fields,
    ownership,
    ops: ops.length ? ops : ['list', 'read', 'create', 'update', 'delete'],
  };
}

function normPage(p: Partial<BpPage>): BpPage | null {
  const path = asStr(p?.path);
  const title = asStr(p?.title, path || 'Trang');
  if (!path) return null;
  const kind = (PAGE_KINDS.has(p?.kind as string) ? p!.kind : 'list') as BpPage['kind'];
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    title,
    kind,
    ...(p?.entity ? { entity: asStr(p.entity) } : {}),
    ...(p?.requiresAuth ? { requiresAuth: true } : {}),
  };
}

/**
 * Coerce the model's raw tool output into a valid Blueprint, filling defaults.
 * `backend` defaults from whether any entities exist (data → fullstack) unless
 * the model stated one explicitly.
 */
export function normalizeBlueprint(
  raw: Partial<Blueprint> | undefined,
  fallbackName: string,
  lockStatic?: boolean,
): Blueprint {
  const v = raw ?? {};
  // lockStatic = the user did NOT enable a backend → force a frontend-only design:
  // drop any data entities and pin backend='static', so neither the spec nor codegen
  // is steered toward a /api + schema.sql the user never asked for.
  const entities = lockStatic
    ? []
    : asArray<Partial<BpEntity>>(v.entities).map(normEntity).filter((x): x is BpEntity => !!x);
  const pages = asArray<Partial<BpPage>>(v.pages).map(normPage).filter((x): x is BpPage => !!x);
  const explicitBackend = v.backend === 'fullstack' || v.backend === 'static' ? v.backend : null;
  const backend: BackendKind = lockStatic
    ? 'static'
    : (explicitBackend ?? (entities.length > 0 ? 'fullstack' : 'static'));

  const authRaw = (v.auth ?? {}) as Partial<Blueprint['auth']>;
  const auth: Blueprint['auth'] = {
    // Real auth needs the backend (D1 sessions); a locked-static app is purely
    // client-side, so a login screen (if any) stays cosmetic.
    enabled: lockStatic ? false : !!authRaw.enabled,
    providers: asArray<string>(authRaw.providers).filter((p) => p === 'email' || p === 'google') as (
      | 'email'
      | 'google'
    )[],
    ...(Array.isArray(authRaw.roles) ? { roles: authRaw.roles } : {}),
  };
  if (auth.enabled && auth.providers.length === 0) auth.providers = ['email'];

  const navigation = asArray<{ label?: unknown; pagePath?: unknown }>(v.navigation)
    .map((n) => ({ label: asStr(n?.label), pagePath: asStr(n?.pagePath) }))
    .filter((n) => n.label && n.pagePath);

  const integrations = asArray<{ kind?: unknown; note?: unknown }>(v.integrations)
    .map((i) => ({ kind: i?.kind, note: i?.note }))
    .filter((i) => ['email', 'payment', 'storage', 'webhook', 'none'].includes(i.kind as string))
    .map((i) => ({ kind: i.kind as Blueprint['integrations'][number]['kind'], ...(i.note ? { note: asStr(i.note) } : {}) }));

  return {
    appName: asStr(v.appName, fallbackName || 'App'),
    summary: asStr(v.summary),
    backend,
    pages,
    entities,
    auth,
    integrations,
    navigation,
  };
}

/** Compact markdown rendering of an approved Blueprint, injected into the spec prompt. */
export function renderBlueprint(bp: Blueprint | null | undefined): string {
  if (!bp) return '';
  const lines: string[] = [
    '',
    'THIẾT KẾ ĐÃ DUYỆT — NGƯỜI DÙNG ĐÃ XÁC NHẬN. BẮT BUỘC bám sát đúng danh sách dưới đây:',
    `- App: ${bp.appName}`,
  ];
  if (bp.summary) lines.push(`- Tóm tắt: ${bp.summary}`);
  lines.push(`- Backend: ${bp.backend === 'fullstack' ? 'full-stack (cần lưu dữ liệu)' : 'tĩnh'}`);
  const pages = bp.pages ?? [];
  if (pages.length) {
    lines.push('- Trang:');
    for (const p of pages) {
      lines.push(`  • ${p.title} (${p.path}, ${p.kind}${p.entity ? `, dữ liệu: ${p.entity}` : ''})`);
    }
    lines.push(
      '- BẮT BUỘC: tạo ĐỦ các trang ở trên — KHÔNG bỏ sót trang nào. Chỉ thêm trang mới khi yêu cầu/đặc tả ' +
        'nêu rõ, hoặc khi cần cho đăng nhập/khu quản trị (/admin) đã được chỉ định.',
    );
  }
  const entities = bp.entities ?? [];
  if (entities.length) {
    lines.push('- Model dữ liệu (sinh schema.sql + functions/api tương ứng):');
    for (const e of entities) {
      // Carry the constraints the LLM genuinely cannot reconstruct from field
      // names alone — enum value sets and explicit FK targets above all — plus
      // required/unique so schema.sql + forms honour the approved data model.
      const f = e.fields
        .map(
          (x) =>
            `${x.name}:${x.type}` +
            (x.required ? ' bắt buộc' : '') +
            (x.unique ? ' duy nhất' : '') +
            (x.enumValues?.length ? ` ∈{${x.enumValues.join('|')}}` : '') +
            (x.refEntity ? ` → ${x.refEntity}` : ''),
        )
        .join(', ');
      lines.push(`  • ${e.name} [${e.ownership}] { ${f} }`);
    }
    lines.push(
      '- BẮT BUỘC: sinh schema.sql + functions/api cho ĐỦ MỌI entity ở trên — KHÔNG được thiếu entity nào. ' +
        '(Bảng/route phụ trợ như đăng nhập/CMS/admin nếu cần thì vẫn được thêm.)',
    );
  }
  if (bp.auth?.enabled) lines.push(`- Đăng nhập: ${bp.auth.providers.join(', ') || 'email'}`);
  // Defensive (?? []): a blueprint loaded from an OLDER stored row (iterate path)
  // may predate the navigation/integrations fields.
  const nav = bp.navigation ?? [];
  if (nav.length) {
    lines.push('- Điều hướng: ' + nav.map((n) => `${n.label}→${n.pagePath}`).join(', '));
  }
  const realIntegrations = (bp.integrations ?? []).filter((i) => i.kind !== 'none');
  if (realIntegrations.length) {
    lines.push(
      '- Tích hợp: ' + realIntegrations.map((i) => i.kind + (i.note ? ` (${i.note})` : '')).join(', '),
    );
  }
  return lines.join('\n');
}
