/**
 * Shared field-matching utilities for n8n mapping.
 * Used by both TemplateWizardModal and MappingsPage.
 */
import type { LarkField, Column } from './n8nApi';

export interface MappingRow {
  key: string;
  lark_field: string;
  excel_column: string;
  excel_header: string;
  map_type: string;
  expression: string | null;
  scope: string;
  confidence?: number;
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[àáảã��ăắằẳẵặâấầẩẫậ]/g, 'a')
    .replace(/[èéẻẽẹêếềểễệ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôốồổỗộơớờởỡợ]/g, 'o')
    .replace(/[ùúủũụưứừửữự]/g, 'u')
    .replace(/[ỳýỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  const wa = new Set(na.split(/[\s_\-./]+/).filter(Boolean));
  const wb = new Set(nb.split(/[\s_\-./]+/).filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;

  let common = 0;
  for (const w of wa) {
    for (const w2 of wb) {
      if (w === w2) { common++; break; }
      if (w.length > 2 && w2.length > 2 && (w.includes(w2) || w2.includes(w))) { common += 0.7; break; }
    }
  }
  return common / Math.max(wa.size, wb.size);
}

export function autoMatchFields(larkFields: LarkField[], excelColumns: Column[]): MappingRow[] {
  const rows: MappingRow[] = [];
  const usedCols = new Set<string>();

  for (const lf of larkFields) {
    const lName = lf.field_name.toLowerCase().trim();
    let bestMatch: Column | null = null;
    let bestScore = 0;

    for (const ec of excelColumns) {
      if (usedCols.has(ec.letter)) continue;
      const eName = ec.header.toLowerCase().trim();
      const score = similarity(lName, eName);
      if (score > bestScore && score >= 0.4) {
        bestScore = score;
        bestMatch = ec;
      }
    }

    if (bestMatch && bestScore >= 0.4) {
      usedCols.add(bestMatch.letter);
      rows.push({
        key: `auto_${rows.length}`,
        lark_field: lf.field_name,
        excel_column: bestMatch.letter,
        excel_header: bestMatch.header,
        map_type: 'direct',
        expression: null,
        scope: 'row',
        confidence: Math.round(bestScore * 100),
      });
    }
  }

  rows.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  return rows;
}

/** Convert 0-based column index to Excel letter (0=A, 25=Z, 26=AA) */
export function colIndexToLetter(index: number): string {
  let letter = '';
  let i = index;
  while (i >= 0) {
    letter = String.fromCharCode((i % 26) + 65) + letter;
    i = Math.floor(i / 26) - 1;
  }
  return letter;
}
