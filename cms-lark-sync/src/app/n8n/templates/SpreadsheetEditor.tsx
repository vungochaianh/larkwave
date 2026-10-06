'use client';

/**
 * SpreadsheetEditor — Fortune Sheet + Lark Mapping overlay.
 *
 * Features:
 * - Full Excel editing (cells, formulas, formatting, undo/redo)
 * - Right-click cell → "Map to Lark field" context menu
 * - Mapped cells highlighted with badges
 * - Import xlsx, export modified data for save
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Workbook, WorkbookInstance } from '@fortune-sheet/react';
import '@fortune-sheet/react/dist/index.css';
import {
  Modal, Button, Select, Space, Typography, Tag, message, Popover, Switch,
} from 'antd';
import { ArrowDownOutlined, CloseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { parseXlsxWithStyles, type LarkField } from '@/lib/n8nApi';
import type { Sheet, Cell } from '@fortune-sheet/core';

const { Text } = Typography;

// ─── Types ──────────────────────────────────────────────────────

export interface FieldMapping {
  id: string;
  row: number;         // 0-indexed
  col: number;         // 0-indexed
  lark_field: string;
  label: string;
  repeat: boolean;
  map_type: 'direct' | 'formula' | 'static' | 'expression';
  expression?: string;
  sheet?: string;      // which sheet this mapping belongs to
}

interface Props {
  /** File to parse (sent to backend for style-preserving parse) */
  file: File | null;
  /** Pre-loaded Fortune Sheet data from MongoDB — skips file parsing when set */
  initialSheets?: unknown[];
  larkFields: LarkField[];
  mappings: FieldMapping[];
  onMappingsChange: (mappings: FieldMapping[]) => void;
  activeSheet?: string;
  onActiveSheetChange?: (name: string) => void;
  sampleData?: Record<string, unknown>[];
  showPreview?: boolean;
  height?: number;
  autoMatchRef?: React.MutableRefObject<(() => void) | null>;
  clearAllRef?: React.MutableRefObject<(() => void) | null>;
  saveRef?: React.MutableRefObject<(() => Promise<unknown[]>) | null>;
  templateName?: string;
  templateId?: string;
}

// ─── Component ──────────────────────────────────────────────────

export default function SpreadsheetEditor({
  file, initialSheets, larkFields, mappings, onMappingsChange,
  activeSheet, onActiveSheetChange,
  sampleData = [], showPreview = false, height = 500,
  autoMatchRef, clearAllRef, saveRef, templateName, templateId,
}: Props) {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
  const [mapPopoverOpen, setMapPopoverOpen] = useState(false);
  const workbookRef = useRef<WorkbookInstance>(null);

  // Load sheets: prefer pre-loaded MongoDB data, fallback to file parsing
  useEffect(() => {
    if (initialSheets && initialSheets.length > 0) {
      console.log('[SpreadsheetEditor] Using pre-loaded Fortune Sheet data from MongoDB');
      setSheets(initialSheets as Sheet[]);
      setLoading(false);
      return;
    }
    if (!file) return;
    (async () => {
      setLoading(true);
      try {
        const parsed = await parseXlsxWithStyles(file);
        setSheets(parsed as Sheet[]);
      } catch (e) {
        message.error(`Failed to parse: ${e instanceof Error ? e.message : 'Unknown'}`);
      }
      setLoading(false);
    })();
  }, [file, initialSheets]);

  // ─── Mapping helpers ──────────────────────────────────────────

  /** Repeat preview: show badge on anchor + 3 rows below as visual indicator.
   *  The actual data filling (insert/delete rows) is handled by the backend filler
   *  which auto-detects the data region. This is cosmetic only.
   */
  const REPEAT_PREVIEW_ROWS = 3;
  const repeatStopRow = useMemo(() => {
    const repeats = mappings.filter(m => m.repeat && m.sheet === activeSheet);
    if (!repeats.length) return 99999;
    const anchor = Math.min(...repeats.map(m => m.row));
    return anchor + REPEAT_PREVIEW_ROWS + 1;
  }, [mappings, activeSheet]);

  // Mappings filtered to current active sheet — strict match only
  // (mappings without a sheet or with empty sheet are NOT shown on all tabs)
  const sheetMappings = useMemo(() =>
    mappings.filter(m => m.sheet === activeSheet),
  [mappings, activeSheet]);

  const getMappingAt = useCallback((r: number, c: number): FieldMapping | undefined => {
    const direct = sheetMappings.find(m => m.row === r && m.col === c);
    if (direct) return direct;
    // Repeat match — stop before footer, and don't overlap non-repeat mappings
    const repeat = sheetMappings.find(m => m.repeat && m.col === c && r > m.row && r < repeatStopRow);
    if (repeat) {
      const hasSingle = sheetMappings.find(m => !m.repeat && m.row === r);
      if (hasSingle) return undefined;
      return repeat;
    }
    return undefined;
  }, [sheetMappings, repeatStopRow]);

  const setMapping = useCallback((r: number, c: number, larkField: string, repeat: boolean, mapType: 'direct' | 'formula' | 'static' | 'expression' = 'direct', expression?: string) => {
    const sheet = activeSheet || '';
    if (!sheet) { message.warning('No active sheet'); return; }
    const id = `${sheet}:${r}:${c}`;
    const label = '';
    let updated = mappings.filter(m => m.id !== id);
    // Remove any existing repeat mapping on the same column+sheet (only one repeat per column per sheet)
    if (repeat) updated = updated.filter(m => !(m.col === c && m.repeat && m.sheet === sheet));
    if (larkField || mapType !== 'direct') {
      updated.push({ id, row: r, col: c, lark_field: larkField, label, repeat, map_type: mapType, expression, sheet });
    }
    onMappingsChange(updated);
    setMapPopoverOpen(false);
  }, [mappings, onMappingsChange, activeSheet]);

  const removeMapping = useCallback((id: string) => {
    onMappingsChange(mappings.filter(m => m.id !== id));
  }, [mappings, onMappingsChange]);

  /** Get plain text value of a cell (skip formulas).
   *  Reads from sheet.celldata first, then sheet.data[][], for auto-match.
   */
  const getCellText = useCallback((sheet: Sheet, r: number, c: number): string | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = sheet as any;
    let v: Record<string, unknown> | null = null;

    // Try celldata (available during initial parse)
    if (s.celldata && Array.isArray(s.celldata)) {
      const cd = s.celldata.find((cell: { r: number; c: number }) => cell.r === r && cell.c === c);
      if (cd?.v) v = cd.v;
    }
    // Try data[][] (Fortune Sheet live format)
    if (!v && s.data && Array.isArray(s.data) && s.data[r]) {
      const cell = s.data[r]?.[c];
      if (cell && typeof cell === 'object') v = cell;
    }
    if (!v) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cv = v as any;
    if (cv.f) return null; // skip formulas
    const val = cv.v ?? cv.m;
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str || null;
  }, []);

  /** Auto-match: find the header row and match columns to Lark fields.
   *
   * Strategy:
   * 1. Score each row by how many cells fuzzy-match a Lark field name
   * 2. Pick the row with highest score (minimum 1 match)
   * 3. For each cell in that row, find the best matching Lark field
   * 4. Create repeat mappings on the first data row below the header
   */
  const handleAutoMatch = useCallback(() => {
    if (!larkFields.length || !sheets.length) { message.warning('Need connection with fields'); return; }

    const sheet = sheets.find(s => s.name === activeSheet) || sheets[0];
    if (!sheet) return;

    const maxR = sheet.row || 60;
    const maxC = sheet.column || 30;

    // Score each row: how many cells match a Lark field name?
    let bestRow = -1;
    let bestScore = 0;
    for (let r = 0; r < Math.min(maxR, 50); r++) {
      let score = 0;
      for (let c = 0; c < maxC; c++) {
        const val = getCellText(sheet, r, c);
        if (!val) continue;
        if (val.length < 2 || !isNaN(Number(val))) continue;
        for (const lf of larkFields) {
          if (quickSim(val, lf.field_name) > 0.3) { score++; break; }
        }
      }
      if (score > bestScore) { bestScore = score; bestRow = r; }
    }

    if (bestRow < 0 || bestScore < 1) { message.warning('No matching row found — try mapping manually'); return; }

    // Match columns in bestRow to Lark fields
    const newMappings: FieldMapping[] = [...mappings.filter(m => !m.repeat)];
    const usedFields = new Set<string>();
    let matched = 0;

    // Build scored candidates
    const candidates: { c: number; field: string; score: number; label: string }[] = [];
    for (let c = 0; c < maxC; c++) {
      const val = getCellText(sheet, bestRow, c);
      if (!val || val.length < 2 || !isNaN(Number(val))) continue;

      let bestField = '';
      let bestS = 0;
      for (const lf of larkFields) {
        const s = quickSim(val, lf.field_name);
        if (s > bestS) { bestS = s; bestField = lf.field_name; }
      }
      if (bestField && bestS > 0.25) {
        candidates.push({ c, field: bestField, score: bestS, label: val });
      }
    }

    // Sort by score descending — best matches get priority
    candidates.sort((a, b) => b.score - a.score);

    for (const { c, field, label } of candidates) {
      if (usedFields.has(field)) continue;
      usedFields.add(field);

      const dataRow = bestRow + 1;
      const id = `${activeSheet}:${dataRow}:${c}`;
      if (!newMappings.some(m => m.id === id)) {
        newMappings.push({
          id, row: dataRow, col: c, lark_field: field,
          label, repeat: true, map_type: 'direct', sheet: activeSheet,
        });
        matched++;
      }
    }

    onMappingsChange(newMappings);
    message.success(`Matched ${matched} fields from header row ${bestRow + 1}`);
  }, [larkFields, sheets, activeSheet, mappings, onMappingsChange, getCellText]);

  /** Clear all mappings */
  const handleClearAll = useCallback(() => {
    onMappingsChange([]);
    message.info('All mappings cleared');
  }, [onMappingsChange]);

  /** Save: export current Fortune Sheet data as celldata array for backend.
   *  With onChange callback, `sheets` state is always up-to-date with user edits.
   *
   *  Config (merge, borderInfo) may live on ctx.config instead of the sheet
   *  returned by getAllSheets(), so we deep-clone via JSON to detach from
   *  immer proxies and reconstruct merge from cell mc properties as fallback.
   */
  const handleSave = useCallback(async (): Promise<unknown[]> => {
    const wb = workbookRef.current;
    const live = wb?.getAllSheets();
    const source = (live && live.length > 0) ? live : sheets;
    console.log('[Save] source:', live ? 'getAllSheets' : 'state', 'count:', source.length);

    return source.map(s => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sheet = s as any;
      const celldata: { r: number; c: number; v: unknown }[] = [];

      // Primary: data[][] (2D matrix from Fortune Sheet)
      if (sheet.data && Array.isArray(sheet.data)) {
        for (let r = 0; r < sheet.data.length; r++) {
          const row = sheet.data[r];
          if (!row || !Array.isArray(row)) continue;
          for (let c = 0; c < row.length; c++) {
            const cell = row[c];
            if (cell == null) continue;
            if (typeof cell === 'object' && Object.keys(cell).length === 0) continue;
            celldata.push({ r, c, v: cell });
          }
        }
      }

      // Fallback: celldata[] (sparse format)
      if (celldata.length === 0 && sheet.celldata && Array.isArray(sheet.celldata)) {
        for (const cd of sheet.celldata) {
          if (cd?.r >= 0 && cd?.c >= 0 && cd?.v != null) {
            celldata.push({ r: cd.r, c: cd.c, v: cd.v });
          }
        }
      }

      // ── Deep-clone config to detach from immer proxy ──
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let config: any = {};
      try {
        config = structuredClone(sheet.config || {});
      } catch {
        try {
          config = JSON.parse(JSON.stringify(sheet.config || {}));
        } catch {
          const src = sheet.config || {};
          config = {};
          for (const k of Object.keys(src)) {
            try { config[k] = JSON.parse(JSON.stringify(src[k])); } catch { /* skip */ }
          }
        }
      }

      // ── Reconstruct merge from cell mc properties (fallback) ──
      const cfgMergeCount = Object.keys(config.merge || {}).length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const reconstructedMerge: Record<string, any> = {};
      for (const cd of celldata) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const v = cd.v as any;
        if (v?.mc && typeof v.mc.rs === 'number' && v.mc.rs > 0) {
          const key = `${v.mc.r}_${v.mc.c}`;
          reconstructedMerge[key] = { r: v.mc.r, c: v.mc.c, rs: v.mc.rs, cs: v.mc.cs };
        }
      }
      const reconstructedCount = Object.keys(reconstructedMerge).length;
      if (reconstructedCount > 0 && reconstructedCount > cfgMergeCount) {
        console.log(`[Save] Merge fallback: config had ${cfgMergeCount}, cells have ${reconstructedCount} → using cell-based merge`);
        config.merge = reconstructedMerge;
      }

      // ── Extract per-cell borders into borderInfo (fallback) ──
      if (!config.borderInfo || config.borderInfo.length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cellBorders: any[] = [];
        for (const cd of celldata) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = cd.v as any;
          if (v?.bd && typeof v.bd === 'object') {
            cellBorders.push({
              rangeType: 'cell',
              value: { row_index: cd.r, col_index: cd.c, ...v.bd },
            });
          }
        }
        if (cellBorders.length > 0) {
          console.log(`[Save] Border fallback: config.borderInfo empty, found ${cellBorders.length} per-cell borders`);
          config.borderInfo = cellBorders;
        }
      }

      // ── Preserve additional style config ──
      // Copy rowlen, columnlen, rowhidden, colhidden, customHeight, customWidth
      for (const prop of ['rowlen', 'columnlen', 'rowhidden', 'colhidden', 'customHeight', 'customWidth', 'authority'] as const) {
        if (sheet.config?.[prop] && !config[prop]) {
          try { config[prop] = JSON.parse(JSON.stringify(sheet.config[prop])); } catch { /* skip */ }
        }
      }

      // Strip null/None values from config
      for (const k of Object.keys(config)) {
        if (config[k] === null) delete config[k];
      }

      console.log(`[Save] Sheet "${sheet.name}": ${celldata.length} cells, merge: ${Object.keys(config.merge || {}).length}, borderInfo: ${(config.borderInfo || []).length}, config keys: ${Object.keys(config).join(',')}`);

      return {
        name: sheet.name || 'Sheet',
        celldata,
        row: sheet.row || 100,
        column: sheet.column || 30,
        config,
        // Preserve frozen panes
        frozen: sheet.frozen || undefined,
        // Preserve default row/col size
        defaultRowHeight: sheet.defaultRowHeight || undefined,
        defaultColWidth: sheet.defaultColWidth || undefined,
      };
    });
  }, [sheets]);

  // Expose functions to parent via refs
  useEffect(() => {
    if (autoMatchRef) autoMatchRef.current = handleAutoMatch;
    if (clearAllRef) clearAllRef.current = handleClearAll;
    if (saveRef) saveRef.current = handleSave;
  }, [autoMatchRef, clearAllRef, saveRef, handleAutoMatch, handleClearAll, handleSave]);

  // ─── Fortune Sheet hooks ──────────────────────────────────────

  const hooks = useMemo(() => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    afterSelectionChange: (_sheetId: string, sel: any) => {
      // Fortune Sheet may pass different selection formats
      const r = sel?.row?.[0] ?? sel?.r ?? sel?.startRow;
      const c = sel?.column?.[0] ?? sel?.c ?? sel?.startColumn;
      if (r != null && c != null && r >= 0 && c >= 0) {
        setSelectedCell({ r, c });
      }
    },
    afterActivateSheet: (id: string) => {
      const sheet = sheets.find(s => s.id === id);
      if (sheet?.name && onActiveSheetChange) onActiveSheetChange(sheet.name);
    },
    // Render mapping badges on cells
    afterRenderCell: (cell: Cell | null, info: { row: number; column: number; startX: number; startY: number; endX: number; endY: number }, ctx: CanvasRenderingContext2D) => {
      const m = getMappingAt(info.row, info.column);
      if (!m) return;
      const isAnchor = m.row === info.row && m.col === info.column;
      const isPreview = m.repeat && !isAnchor; // preview rows below anchor

      if (isAnchor) {
        // Draw badge on the anchor cell
        const badgeText = m.map_type === 'formula' ? 'fx' : m.map_type === 'expression' ? 'expr' : m.lark_field.substring(0, 10);
        const bgColor = m.map_type === 'formula' ? '#ca8a04' : m.repeat ? '#16a34a' : '#2563eb';

        ctx.save();
        ctx.font = '9px sans-serif';
        const textWidth = ctx.measureText(badgeText).width;
        const badgeW = textWidth + (m.repeat ? 14 : 6);
        const badgeH = 14;
        const x = info.endX - badgeW;
        const y = info.startY;

        ctx.fillStyle = bgColor;
        ctx.fillRect(x, y, badgeW, badgeH);
        ctx.fillStyle = '#fff';
        ctx.fillText(badgeText, x + 3, y + 10);
        if (m.repeat) ctx.fillText('↓', info.endX - 10, y + 10);
        ctx.restore();
      }

      // Draw border — solid for anchor, dashed for preview rows
      ctx.save();
      ctx.strokeStyle = m.map_type === 'formula' ? '#ca8a04' : m.repeat ? '#16a34a' : '#2563eb';
      ctx.lineWidth = isPreview ? 1 : 1.5;
      ctx.globalAlpha = isPreview ? 0.4 : 1;
      ctx.setLineDash(isPreview ? [3, 3] : []);
      ctx.strokeRect(info.startX + 0.5, info.startY + 0.5, info.endX - info.startX - 1, info.endY - info.startY - 1);
      ctx.restore();
    },
  }), [sheets, getMappingAt, onActiveSheetChange]);

  // ─── Render ───────────────────────────────────────────────────

  if (loading) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading spreadsheet...</div>;
  }

  if (!sheets.length) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No data</div>;
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Fortune Sheet */}
      <div className="fortune-sheet-wrapper" style={{ height, border: '1px solid var(--border-color)', borderRadius: 6 }}>
        <Workbook
          ref={workbookRef}
          data={sheets}
          lang="en"
          showToolbar
          showFormulaBar
          showSheetTabs
          allowEdit
          hooks={hooks}
          defaultFontSize={12}
          onChange={(data) => { setSheets(data as Sheet[]); }}
          toolbarItems={[
            'undo', 'redo', '|',
            'format-painter', '|',
            'currency-format', 'percentage-format', 'number-decrease', 'number-increase', '|',
            'font-family', 'font-size', '|',
            'bold', 'italic', 'underline', 'strike-through', '|',
            'font-color', 'background', '|',
            'horizontal-align', 'vertical-align', 'text-wrap', 'text-rotation', '|',
            'merge-cell', 'border', '|',
            'number-format', '|',
            'freeze', 'conditional-format',
          ]}
          cellContextMenu={['copy', 'paste', '|', 'insert-row', 'insert-column', 'delete-row', 'delete-column', '|', 'clear', 'sort', 'filter']}
        />
      </div>

      {/* Mapping floating button — shows when cell selected (works even without connection for formula/static) */}
      {selectedCell && (
        <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 100 }}>
          <Popover
            open={mapPopoverOpen}
            onOpenChange={setMapPopoverOpen}
            trigger="click"
            placement="bottomRight"
            content={
              <MappingPopover
                key={`${selectedCell.r}:${selectedCell.c}`}
                row={selectedCell.r}
                col={selectedCell.c}
                mapping={getMappingAt(selectedCell.r, selectedCell.c)}
                larkFields={larkFields}
                sampleData={sampleData}
                allMappings={mappings}
                onMap={(f, r, mt, ex) => setMapping(selectedCell.r, selectedCell.c, f, r, mt, ex)}
                onRemove={(id) => { removeMapping(id); setMapPopoverOpen(false); }}
              />
            }
          >
            <Button type="primary" size="small" icon={<ThunderboltOutlined />}>
              Map Cell
            </Button>
          </Popover>
        </div>
      )}

      {/* Mapping tags — only show current sheet's mappings */}
      {sheetMappings.length > 0 && (
        <div style={{ marginTop: 4, padding: '4px 6px', background: 'var(--bg-secondary)', borderRadius: 4, maxHeight: 60, overflowY: 'auto' }}>
          <Space size={4} wrap>
            {sheetMappings.map(m => (
              <Tag key={m.id} color={m.map_type === 'formula' ? 'orange' : m.map_type === 'expression' ? 'purple' : m.repeat ? 'green' : 'blue'}
                style={{ fontSize: 10 }} closable onClose={() => removeMapping(m.id)}>
                R{m.row + 1}C{m.col + 1}{m.repeat ? '↓' : ''} → {m.map_type === 'formula' ? 'fx' : m.map_type === 'expression' ? 'expr' : m.lark_field}
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}

// ─── Mapping Popover ────────────────────────────────────────────

function MappingPopover({ row, col, mapping, larkFields, sampleData, onMap, onRemove, allMappings }: {
  row: number; col: number;
  mapping?: FieldMapping;
  larkFields: LarkField[];
  sampleData: Record<string, unknown>[];
  onMap: (field: string, repeat: boolean, mapType: 'direct' | 'formula' | 'static' | 'expression', expression?: string) => void;
  onRemove: (id: string) => void;
  allMappings?: FieldMapping[];
}) {
  const [mapType, setMapType] = useState<'direct' | 'formula' | 'static' | 'expression'>(mapping?.map_type || 'direct');
  const [field, setField] = useState(mapping?.lark_field || '');
  const [repeat, setRepeat] = useState(mapping?.repeat ?? false);
  const [expr, setExpr] = useState(mapping?.expression || '');

  // Column letter for current cell
  const colLetter = String.fromCharCode(65 + (col % 26));

  // Quick formula templates
  const formulaTemplates = [
    { label: 'SUM column', value: `=SUM(${colLetter}{start}:${colLetter}{end})`, desc: 'Sum all data rows' },
    { label: 'A × B', value: '={colA}{row}*{colB}{row}', desc: 'Multiply two columns' },
    { label: 'A + B', value: '={colA}{row}+{colB}{row}', desc: 'Add two columns' },
    { label: 'A - B', value: '={colA}{row}-{colB}{row}', desc: 'Subtract' },
    { label: 'A / B', value: '={colA}{row}/{colB}{row}', desc: 'Divide' },
    { label: 'ROUND', value: '=ROUND({colA}{row}, 0)', desc: 'Round to integer' },
    { label: 'IF', value: '=IF({colA}{row}>0, {colA}{row}*{colB}{row}, 0)', desc: 'Conditional' },
    { label: 'VLOOKUP', value: '=VLOOKUP($F{row},Sheet2!$A:$D,3,0)', desc: 'Lookup from another sheet' },
  ];

  // Insert column reference into formula
  const insertColRef = (letter: string) => {
    setExpr(prev => prev + letter + '{row}');
  };

  // Get mapped columns for quick reference buttons
  const mappedCols = (allMappings || [])
    .filter(m => m.map_type === 'direct' && m.lark_field)
    .map(m => ({ letter: String.fromCharCode(65 + (m.col % 26)) + (m.col >= 26 ? String.fromCharCode(65 + Math.floor(m.col / 26) - 1) : ''), field: m.lark_field, col: m.col }))
    .filter((v, i, arr) => arr.findIndex(x => x.col === v.col) === i);

  return (
    <div style={{ width: 340 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Tag color="blue" style={{ margin: 0, fontFamily: 'monospace', fontSize: 11 }}>
          {colLetter}{row + 1}
        </Tag>
        <Text strong style={{ fontSize: 12 }}>Map Cell</Text>
        {mapping && <Tag color="green" style={{ fontSize: 9, margin: 0 }}>Mapped</Tag>}
        {mapping && <Button size="small" danger icon={<CloseOutlined />} onClick={() => onRemove(mapping.id)} style={{ marginLeft: 'auto' }} />}
      </div>

      {/* Type tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 10, background: 'var(--bg-tertiary, #f1f5f9)', borderRadius: 6, padding: 2 }}>
        {([['direct', 'Lark Field'], ['expression', 'Lark Res'], ['formula', 'Formula'], ['static', 'Static']] as const).map(([key, label]) => (
          <Button key={key} size="small"
            type={mapType === key ? 'primary' : 'text'}
            style={{
              flex: 1, fontSize: 10, borderRadius: 4, padding: '0 4px',
              ...(mapType === key && key === 'formula' ? { background: 'var(--warning)', borderColor: 'var(--warning)' } : {}),
              ...(mapType === key && key === 'expression' ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}),
            }}
            onClick={() => setMapType(key)}>{label}</Button>
        ))}
      </div>

      {/* ── Direct: Lark Field ── */}
      {mapType === 'direct' && (
        <>
          <Select size="small" style={{ width: '100%', marginBottom: 8 }} placeholder="Select Lark field..."
            showSearch allowClear value={field || undefined} onChange={v => setField(v || '')}
            filterOption={(input, opt) => (opt?.label as string || '').toLowerCase().includes(input.toLowerCase())}
            options={larkFields.map(f => ({
              value: f.field_name,
              label: `${f.field_name} (${f.type_name || ''})`,
            }))} />

          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <Button size="small" type={!repeat ? 'primary' : 'default'} onClick={() => setRepeat(false)} style={{ flex: 1 }}>
              Single cell
            </Button>
            <Button size="small" type={repeat ? 'primary' : 'default'} icon={<ArrowDownOutlined />}
              onClick={() => setRepeat(true)} style={{ flex: 1 }}>
              Repeat ↓ rows
            </Button>
          </div>

          {/* Sample preview */}
          {field && sampleData.length > 0 && (
            <div style={{ marginBottom: 8, padding: '4px 8px', background: 'var(--bg-tertiary, #f0fdf4)', borderRadius: 4, fontSize: 10, maxHeight: 60, overflowY: 'auto' }}>
              <Text type="secondary" style={{ fontSize: 10 }}>Preview:</Text>
              {sampleData.slice(0, 3).map((rec, i) => {
                const v = rec[field];
                const display = v == null ? '(empty)' : typeof v === 'object' ? JSON.stringify(v).substring(0, 50) : String(v).substring(0, 50);
                return <div key={i} style={{ color: '#16a34a', fontFamily: 'monospace' }}>{display}</div>;
              })}
            </div>
          )}

          <Button block size="small" type="primary" disabled={!field} onClick={() => onMap(field, repeat, 'direct')}>
            Apply
          </Button>
        </>
      )}

      {/* ── Expression: Lark field values with computation ── */}
      {mapType === 'expression' && (
        <>
          <Select size="small" style={{ width: '100%', marginBottom: 6 }} placeholder="Select Lark field..."
            showSearch allowClear value={field || undefined} onChange={v => setField(v || '')}
            filterOption={(input, opt) => (opt?.label as string || '').toLowerCase().includes(input.toLowerCase())}
            options={larkFields.map(f => ({
              value: f.field_name,
              label: `${f.field_name} (${f.type_name || ''})`,
            }))} />

          <div style={{ marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>Quick expressions:</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {[
                { label: '× rate', value: '{value} * 0.08', desc: 'Multiply by rate' },
                { label: '+ add', value: '{value} + 100', desc: 'Add number' },
                { label: '÷ divide', value: '{value} / 1000', desc: 'Divide' },
                { label: 'Round', value: 'round({value}, 2)', desc: 'Round to 2 decimals' },
                { label: 'IF > 0', value: '{value} if {value} and float({value}) > 0 else 0', desc: 'If positive' },
                { label: 'IF/ELSE', value: '"Yes" if {value} else "No"', desc: 'Boolean to text' },
                { label: 'Text', value: 'f"INV-{{{value}}}"', desc: 'Format as text' },
                { label: '% format', value: 'f"{float({value})*100:.1f}%"', desc: 'Percent format' },
              ].map(t => (
                <Button key={t.label} size="small" style={{ fontSize: 10, padding: '0 6px', height: 22 }}
                  title={t.desc} onClick={() => setExpr(t.value)}>
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Insert other field refs */}
          {larkFields.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 3 }}>Insert other field:</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, maxHeight: 44, overflowY: 'auto' }}>
                {larkFields.slice(0, 20).map(f => (
                  <Button key={f.field_name} size="small"
                    style={{ fontSize: 9, padding: '0 4px', height: 20 }}
                    onClick={() => setExpr(prev => prev + `{${f.field_name}}`)}>
                    {f.field_name.substring(0, 12)}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <textarea
            style={{
              width: '100%', height: 55, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color, #d1d5db)',
              background: 'var(--bg-secondary, #f8fafc)', color: 'var(--foreground, #1e293b)',
              resize: 'vertical',
            }}
            placeholder="{value} * 0.08  or  {Số lượng} * {Đơn giá}"
            value={expr} onChange={e => setExpr(e.target.value)}
          />

          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 6, lineHeight: 1.4 }}>
            <code style={{ background: 'var(--bg-tertiary)', padding: '0 3px', borderRadius: 2 }}>{'{value}'}</code> = selected field &nbsp;
            <code style={{ background: 'var(--bg-tertiary)', padding: '0 3px', borderRadius: 2 }}>{'{Field Name}'}</code> = any field by name<br />
            Supports: <code>+ - * /</code>, <code>round()</code>, <code>if/else</code>, <code>f&quot;text&quot;</code>
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <Button size="small" type={!repeat ? 'primary' : 'default'} onClick={() => setRepeat(false)} style={{ flex: 1 }}>
              Single
            </Button>
            <Button size="small" type={repeat ? 'primary' : 'default'} icon={<ArrowDownOutlined />}
              onClick={() => setRepeat(true)} style={{ flex: 1 }}>
              Repeat ↓
            </Button>
          </div>

          <Button block size="small" disabled={!field && !expr} onClick={() => onMap(field, repeat, 'expression', expr)}
            style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
            Apply Expression
          </Button>
        </>
      )}

      {/* ── Formula ── */}
      {mapType === 'formula' && (
        <>
          {/* Quick templates */}
          <div style={{ marginBottom: 6 }}>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 4 }}>Quick formulas:</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {formulaTemplates.map(t => (
                <Button key={t.label} size="small" style={{ fontSize: 10, padding: '0 6px', height: 22 }}
                  title={t.desc} onClick={() => setExpr(t.value)}>
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Column reference buttons */}
          {mappedCols.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 3 }}>Insert column ref:</Text>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {mappedCols.map(mc => (
                  <Button key={mc.col} size="small"
                    style={{ fontSize: 9, padding: '0 4px', height: 20, fontFamily: 'monospace' }}
                    title={mc.field} onClick={() => insertColRef(mc.letter)}>
                    {mc.letter} <span style={{ opacity: 0.6 }}>({mc.field.substring(0, 8)})</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          <textarea
            style={{
              width: '100%', height: 55, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
              padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-color, #d1d5db)',
              background: 'var(--bg-secondary, #f8fafc)', color: 'var(--text-color, #1e293b)',
              resize: 'vertical',
            }}
            placeholder="=H{row}*J{row}  or  =SUM(D{start}:D{end})"
            value={expr} onChange={e => setExpr(e.target.value)}
          />

          <div style={{ fontSize: 10, color: 'var(--text-tertiary, #94a3b8)', marginBottom: 6, lineHeight: 1.4 }}>
            <code style={{ background: 'var(--bg-tertiary, #f1f5f9)', padding: '0 3px', borderRadius: 2 }}>{'{row}'}</code> = current row &nbsp;
            <code style={{ background: 'var(--bg-tertiary, #f1f5f9)', padding: '0 3px', borderRadius: 2 }}>{'{row-N}'}</code> / <code style={{ background: 'var(--bg-tertiary, #f1f5f9)', padding: '0 3px', borderRadius: 2 }}>{'{row+N}'}</code> = offset &nbsp;
            <code style={{ background: 'var(--bg-tertiary, #f1f5f9)', padding: '0 3px', borderRadius: 2 }}>{'{start}'}</code> / <code style={{ background: 'var(--bg-tertiary, #f1f5f9)', padding: '0 3px', borderRadius: 2 }}>{'{end}'}</code> = data range
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <Button size="small" type={!repeat ? 'primary' : 'default'} onClick={() => setRepeat(false)} style={{ flex: 1 }}>
              Single
            </Button>
            <Button size="small" type={repeat ? 'primary' : 'default'} icon={<ArrowDownOutlined />}
              onClick={() => setRepeat(true)} style={{ flex: 1 }}>
              Repeat ↓
            </Button>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', lineHeight: 1.3 }}>
            <b>Repeat ↓</b> = each data row. <b>Single</b> = footer/header (1 cell). Footer rows cần tạo riêng cho từng dòng (KCT, 0%, 5%...).
          </div>

          <Button block size="small" disabled={!expr} onClick={() => onMap('', repeat, 'formula', expr)}
            style={{ marginTop: 6, background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' }}>
            Apply Formula
          </Button>
        </>
      )}

      {/* ── Static ── */}
      {mapType === 'static' && (
        <>
          <input
            style={{
              width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6,
              border: '1px solid var(--border-color, #d1d5db)', marginBottom: 6,
              background: 'var(--bg-secondary, #f8fafc)', color: 'var(--text-color, #1e293b)',
            }}
            placeholder="Fixed value (text or number)"
            value={expr} onChange={e => setExpr(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <Button size="small" type={!repeat ? 'primary' : 'default'} onClick={() => setRepeat(false)} style={{ flex: 1 }}>
              Single
            </Button>
            <Button size="small" type={repeat ? 'primary' : 'default'} icon={<ArrowDownOutlined />}
              onClick={() => setRepeat(true)} style={{ flex: 1 }}>
              Repeat {'↓'}
            </Button>
          </div>
          <Button block size="small" type="primary" disabled={!expr} onClick={() => onMap('', repeat, 'static', expr)}>
            Apply Static
          </Button>
        </>
      )}

      {/* Remove */}
      {mapping && (
        <Button block size="small" danger onClick={() => onRemove(mapping.id)} style={{ marginTop: 8 }}>
          Remove mapping
        </Button>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────

/** Remove Vietnamese diacritics for fuzzy comparison. */
function removeDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/**
 * Fuzzy similarity between two strings (0-1).
 * Handles Vietnamese text: normalizes diacritics, splits on whitespace/punctuation,
 * checks word-level containment and partial matches.
 */
function quickSim(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Also compare without diacritics
  const da = removeDiacritics(na);
  const db = removeDiacritics(nb);
  if (da === db) return 0.95;
  if (da.includes(db) || db.includes(da)) return 0.8;

  // Word-level matching
  const wa = na.split(/[\s_\-./()，,]+/).filter(Boolean);
  const wb = nb.split(/[\s_\-./()，,]+/).filter(Boolean);
  if (!wa.length || !wb.length) return 0;

  // Also split without diacritics
  const wda = da.split(/[\s_\-./()，,]+/).filter(Boolean);
  const wdb = db.split(/[\s_\-./()，,]+/).filter(Boolean);

  let matchCount = 0;
  const usedB = new Set<number>();

  for (let i = 0; i < wa.length; i++) {
    const w = wa[i];
    const wd = wda[i] || w;
    for (let j = 0; j < wb.length; j++) {
      if (usedB.has(j)) continue;
      const w2 = wb[j];
      const wd2 = wdb[j] || w2;
      // Exact match, or diacritics-stripped match, or substring containment (>2 chars)
      if (w === w2 || wd === wd2 ||
          (w.length > 2 && (w2.includes(w) || w.includes(w2))) ||
          (wd.length > 2 && (wd2.includes(wd) || wd.includes(wd2)))) {
        matchCount++;
        usedB.add(j);
        break;
      }
    }
  }

  return matchCount / Math.max(wa.length, wb.length);
}
