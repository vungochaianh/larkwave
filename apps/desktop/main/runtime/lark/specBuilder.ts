/**
 * specBuilder — the "Đồng bộ đặc tả" engine.
 *
 * Builds/refreshes a LarkSpecDoc by RE-FETCHING live structured data from Lark
 * (bitable_base_overview + bitable_read_workflows), NEVER by scraping the chat transcript —
 * raw tool payloads are ephemeral (larkToolExec saves only a one-line summary), so the only
 * faithful source is a fresh read. Everything is merged into the prior doc by REAL Lark id
 * (app_token / table_id / field_id / workflow_id are stable), so a re-sync updates in place
 * instead of duplicating, and every sync yields a visible added/changed/removed diff.
 *
 * Integrity rules (do not regress):
 *  - Soft-remove ONLY inside a Base that was FULLY + successfully re-fetched this run. A Base
 *    that failed to read is silently absent — treating "absent" as "deleted" would conflate a
 *    read failure with a real deletion. We keep the prior copy (downgraded to stale) instead.
 *  - Sample ROW values are never stored — we fetch record COUNT only (page_size 1, discarded),
 *    so the spec (which syncs to the account backup) carries structure, never user data.
 *  - Workflow logic degrades honestly: no "Kết nối Lark web" → logicMissing + unverified,
 *    never an invented tree.
 */
import type {
  LarkBaseRef,
  LarkSpecDoc,
  SpecBase,
  SpecTable,
  SpecField,
  SpecWorkflow,
  SpecRelation,
  SpecSource,
  SpecStatus,
  SpecSyncEntry,
  SpecBuildResult,
} from '@larkwave/core';
import type { LarkClient } from './larkClient';
import { resolveTool } from './tools';

/** Older than this since its last live fetch → 'stale' rather than 'verified'. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;
/** Cap the sync history so the doc (and its backup blob) can't grow without bound. */
const SYNC_LOG_MAX = 50;
/** Lark field types that imply a table→table relation. */
const LINK_TYPES = new Set([18, 21]); // one-way link + two-way link
const LOOKUP_TYPES = new Set([19]);

// ── Tool result shapes (only the fields we consume) ──────────────────────────
interface OverviewField {
  name: string;
  type?: number;
  ui_type?: string;
  options_count?: number;
  options_sample?: string[];
}
interface OverviewTable {
  table_id: string;
  name: string;
  record_count?: number;
  fields?: OverviewField[];
}
interface OverviewResult {
  table_count?: number;
  tables?: OverviewTable[];
}
interface WorkflowItem {
  workflow_id: string;
  name?: string;
  status_text?: string;
  logic?: string;
  note?: string;
}
interface WorkflowResult {
  workflows?: WorkflowItem[];
}

interface Counts {
  added: number;
  changed: number;
  removed: number;
}

function statusFor(fetchedAtIso: string, now: number, unverified = false): SpecStatus {
  if (unverified) return 'unverified';
  const t = Date.parse(fetchedAtIso);
  if (!Number.isFinite(t)) return 'unverified';
  return now - t > STALE_MS ? 'stale' : 'verified';
}

/** A synthetic field id — Lark's overview doesn't return field_id, so we key fields by
 *  (tableId + fieldName). Field names are unique within a table, so this is stable. */
function fieldKey(tableId: string, name: string): string {
  return `${tableId}::${name}`;
}

function fieldChanged(a: SpecField, b: SpecField): boolean {
  return (
    a.name !== b.name ||
    a.type !== b.type ||
    a.uiType !== b.uiType ||
    a.optionsCount !== b.optionsCount
  );
}

function buildField(f: OverviewField, tableId: string, src: SpecSource, now: number): SpecField {
  return {
    fieldId: fieldKey(tableId, f.name),
    name: f.name,
    type: typeof f.type === 'number' ? f.type : undefined,
    uiType: f.ui_type,
    optionsCount: f.options_count,
    optionsSample: Array.isArray(f.options_sample) ? f.options_sample.slice(0, 20) : undefined,
    status: statusFor(src.fetchedAt, now),
    source: src,
  };
}

function buildFreshBase(overview: OverviewResult, ref: LarkBaseRef, src: SpecSource, now: number): SpecBase {
  const tables: SpecTable[] = (overview.tables ?? []).map((t) => ({
    tableId: t.table_id,
    name: t.name,
    recordCount: typeof t.record_count === 'number' ? t.record_count : undefined,
    fields: (t.fields ?? []).map((f) => buildField(f, t.table_id, src, now)),
    status: statusFor(src.fetchedAt, now),
    source: src,
  }));
  return {
    appToken: ref.appToken,
    name: ref.name || ref.appToken,
    tables,
    status: statusFor(src.fetchedAt, now),
    source: src,
  };
}

/** Re-mark a kept-but-not-refreshed prior base as stale (its live data wasn't confirmed). */
function downgradeBase(base: SpecBase, now: number): SpecBase {
  const restale = (s: SpecStatus): SpecStatus => (s === 'verified' ? 'stale' : s);
  return {
    ...base,
    status: restale(base.status),
    tables: base.tables.map((t) => ({
      ...t,
      status: restale(t.status),
      fields: t.fields.map((f) => ({ ...f, status: restale(f.status) })),
    })),
  };
}

/**
 * Merge a freshly-fetched base into its prior copy by id, soft-removing entities that vanished
 * from this (successful) fetch, and counting the diff. `prior` undefined → everything is "added".
 */
function mergeBaseInto(prior: SpecBase | undefined, fresh: SpecBase): { base: SpecBase; counts: Counts } {
  const counts: Counts = { added: 0, changed: 0, removed: 0 };
  if (!prior) {
    for (const t of fresh.tables) counts.added += 1 + t.fields.length;
    return { base: fresh, counts };
  }
  const priorTables = new Map(prior.tables.map((t) => [t.tableId, t]));
  const freshIds = new Set(fresh.tables.map((t) => t.tableId));
  const tables: SpecTable[] = [];

  for (const ft of fresh.tables) {
    const pt = priorTables.get(ft.tableId);
    if (!pt) {
      counts.added += 1 + ft.fields.length;
      tables.push(ft);
      continue;
    }
    if (pt.name !== ft.name || !!pt.removed) counts.changed += 1;
    const priorFields = new Map(pt.fields.map((f) => [f.fieldId, f]));
    const freshFieldIds = new Set(ft.fields.map((f) => f.fieldId));
    const fields: SpecField[] = [];
    for (const ff of ft.fields) {
      const pf = priorFields.get(ff.fieldId);
      if (!pf) counts.added += 1;
      else if (fieldChanged(pf, ff) || pf.removed) counts.changed += 1;
      fields.push(ff);
    }
    for (const pf of pt.fields) {
      if (!freshFieldIds.has(pf.fieldId)) {
        if (!pf.removed) counts.removed += 1;
        fields.push({ ...pf, removed: true });
      }
    }
    tables.push({ ...ft, fields, removed: false });
  }
  // Prior tables gone from this fetch → soft-remove (keep, greyed).
  for (const pt of prior.tables) {
    if (!freshIds.has(pt.tableId)) {
      if (!pt.removed) counts.removed += 1;
      tables.push({ ...pt, removed: true });
    }
  }
  return { base: { ...fresh, tables }, counts };
}

function wfChanged(a: SpecWorkflow, b: SpecWorkflow): boolean {
  return a.name !== b.name || a.statusText !== b.statusText || a.logicTree !== b.logicTree;
}

/** Infer link/lookup relations from the final merged table set (no extra API calls): a
 *  link/lookup field whose name matches another table's name in the same Base → a relation.
 *  Always inferred (Lark's overview doesn't return the target table id). */
function inferRelations(bases: SpecBase[]): SpecRelation[] {
  const out: SpecRelation[] = [];
  const seen = new Set<string>();
  for (const base of bases) {
    if (base.removed) continue;
    const live = base.tables.filter((t) => !t.removed);
    const byNorm = new Map(live.map((t) => [t.name.toLowerCase().trim(), t]));
    for (const t of live) {
      for (const f of t.fields) {
        if (f.removed || typeof f.type !== 'number') continue;
        const isLink = LINK_TYPES.has(f.type);
        const isLookup = LOOKUP_TYPES.has(f.type);
        if (!isLink && !isLookup) continue;
        // Match the field name to a sibling table name (link columns are usually named after
        // their target table). No confident match → skip rather than fabricate a target.
        const target = byNorm.get(f.name.toLowerCase().trim());
        if (!target || target.tableId === t.tableId) continue;
        const key = `${t.tableId}->${target.tableId}:${f.fieldId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          fromTableId: t.tableId,
          toTableId: target.tableId,
          viaFieldId: f.fieldId,
          viaFieldName: f.name,
          kind: isLookup ? 'lookup' : 'link',
          inferred: true,
        });
      }
    }
  }
  return out;
}

/**
 * Build (or refresh) the spec by re-fetching every applied Base. Pure w.r.t. persistence —
 * the caller saves the returned doc + queues the backup, so token/scope handling stays in the
 * service. `bases` = the union of Bases applied across the account's conversations.
 */
export async function buildSpec(opts: {
  client: LarkClient;
  bases: LarkBaseRef[];
  prior: LarkSpecDoc | null;
  now?: number;
}): Promise<SpecBuildResult> {
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const prior = opts.prior;
  const overviewTool = resolveTool('bitable_base_overview');
  const workflowsTool = resolveTool('bitable_read_workflows');

  const priorBaseByToken = new Map((prior?.bases ?? []).map((b) => [b.appToken, b]));
  const priorWfById = new Map((prior?.workflows ?? []).map((w) => [w.workflowId, w]));
  const scopeTokens = new Set(opts.bases.map((b) => b.appToken));

  const resultBases: SpecBase[] = [];
  const resultWorkflows: SpecWorkflow[] = [];
  const failedBases: SpecBuildResult['failedBases'] = [];
  const succeededTokens = new Set<string>();
  const counts: Counts = { added: 0, changed: 0, removed: 0 };

  // Dedupe scope by appToken (a Base can be applied on several conversations).
  const uniqueBases = [...new Map(opts.bases.map((b) => [b.appToken, b])).values()];

  for (const ref of uniqueBases) {
    const appToken = ref.appToken;
    const structSrc: SpecSource = { tool: 'bitable_base_overview', fetchedAt: nowIso };

    // ── structure ──
    let overview: OverviewResult | null = null;
    try {
      overview = (await overviewTool?.exec(
        { app_token: appToken, sample_records: 1 }, // 1 → get record_count; row values are discarded
        opts.client,
      )) as OverviewResult;
    } catch (e) {
      failedBases.push({ appToken, name: ref.name || appToken, error: (e as Error)?.message || 'lỗi đọc Base' });
    }

    if (!overview || !Array.isArray(overview.tables)) {
      // Failed read → keep the prior copy (stale), never soft-remove, and pass its workflows through.
      if (!failedBases.some((f) => f.appToken === appToken))
        failedBases.push({ appToken, name: ref.name || appToken, error: 'Base rỗng hoặc không đọc được' });
      const pb = priorBaseByToken.get(appToken);
      if (pb) resultBases.push(downgradeBase(pb, now));
      for (const w of priorWfById.values()) if (w.appToken === appToken) resultWorkflows.push(w);
      continue;
    }

    succeededTokens.add(appToken);
    const fresh = buildFreshBase(overview, ref, structSrc, now);
    const merged = mergeBaseInto(priorBaseByToken.get(appToken), fresh);
    counts.added += merged.counts.added;
    counts.changed += merged.counts.changed;
    counts.removed += merged.counts.removed;
    resultBases.push(merged.base);

    // ── workflows ──
    let wfRes: WorkflowResult | null = null;
    try {
      wfRes = (await workflowsTool?.exec({ app_token: appToken }, opts.client)) as WorkflowResult;
    } catch {
      wfRes = null;
    }
    if (wfRes && Array.isArray(wfRes.workflows)) {
      const wfSrc: SpecSource = { tool: 'bitable_read_workflows', fetchedAt: nowIso };
      const freshIds = new Set<string>();
      for (const w of wfRes.workflows) {
        if (!w.workflow_id) continue;
        freshIds.add(w.workflow_id);
        const logicMissing = !w.logic;
        const fresh: SpecWorkflow = {
          workflowId: w.workflow_id,
          appToken,
          name: w.name || '(không tên)',
          statusText: w.status_text || '',
          logicTree: w.logic || undefined,
          logicMissing,
          status: statusFor(nowIso, now, logicMissing),
          source: wfSrc,
        };
        const pw = priorWfById.get(w.workflow_id);
        if (!pw) counts.added += 1;
        else if (wfChanged(pw, fresh) || pw.removed) counts.changed += 1;
        // Keep a previously-read logic tree if this run couldn't read it (web disconnected),
        // so a temporary disconnect doesn't wipe good data — but mark it unverified.
        if (logicMissing && pw?.logicTree) {
          fresh.logicTree = pw.logicTree;
          fresh.logicMissing = true;
          fresh.status = 'unverified';
        }
        resultWorkflows.push(fresh);
      }
      // Workflows gone from this successful read → soft-remove.
      for (const pw of priorWfById.values()) {
        if (pw.appToken === appToken && !freshIds.has(pw.workflowId)) {
          if (!pw.removed) counts.removed += 1;
          resultWorkflows.push({ ...pw, removed: true });
        }
      }
    } else {
      // Couldn't read workflows at all → keep prior ones (unverified).
      for (const pw of priorWfById.values()) {
        if (pw.appToken === appToken) resultWorkflows.push({ ...pw, status: 'unverified' });
      }
    }
  }

  // Prior bases/workflows OUT of the current scope pass through untouched (absence from scope
  // is not deletion — the user simply didn't apply that Base to any open conversation).
  for (const pb of prior?.bases ?? []) {
    if (!scopeTokens.has(pb.appToken)) resultBases.push(pb);
  }
  for (const pw of prior?.workflows ?? []) {
    if (!scopeTokens.has(pw.appToken)) resultWorkflows.push(pw);
  }

  const diff: SpecSyncEntry = {
    at: nowIso,
    added: counts.added,
    changed: counts.changed,
    removed: counts.removed,
    basesFetched: succeededTokens.size,
    basesFailed: failedBases.length,
  };

  const doc: LarkSpecDoc = {
    v: 1,
    updatedAt: nowIso,
    overview: prior?.overview ?? { text: '', updatedAt: nowIso },
    bases: resultBases,
    workflows: resultWorkflows,
    relations: inferRelations(resultBases),
    insights: prior?.insights ?? [],
    syncLog: [diff, ...(prior?.syncLog ?? [])].slice(0, SYNC_LOG_MAX),
  };

  return { doc, diff, failedBases };
}
