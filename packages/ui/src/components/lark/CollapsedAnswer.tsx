'use client';
import { messageDigest } from '../../messageDigest';
import { V } from '../../theme';
import { useI18n } from '../../i18n';

/**
 * A folded assistant answer. This is a hard SWAP of the bubble's content, not a
 * maxHeight clip — clipping would cut a GFM table's own horizontal-scroll wrapper,
 * and rendering plain text instead of markdown is what makes folding a long
 * transcript a net rendering win.
 *
 * The whole bubble is the hit target and is keyboard-reachable, so Tab + Enter walks
 * a long conversation answer by answer.
 */
export function CollapsedAnswer({
  text,
  images,
  tools,
  summary,
  onExpand,
}: {
  text: string;
  /** Attached image count, surfaced as a chip since the images themselves are hidden. */
  images?: number;
  /** Tool calls that ran for this answer, surfaced so the trail stays visible. */
  tools?: number;
  /** AI summary, once the model has produced one — it replaces the structural title,
   *  which stays on screen meanwhile so folding is never a blocking wait. */
  summary?: string;
  onExpand: () => void;
}) {
  const { t } = useI18n();
  const d = messageDigest(text);
  const chip = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 6px',
    borderRadius: 5,
    background: V.surfaceAlt,
    color: V.textSub,
    fontSize: 11,
    lineHeight: '17px',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-expanded="false"
      title={t('chat.clickToExpand', 'Bấm để mở đầy đủ')}
      onClick={onExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onExpand();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ color: V.textFaint, fontSize: 11, lineHeight: '20px', flex: '0 0 auto' }}>▸</span>
        <span
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: V.text,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {summary || d.title}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5, paddingLeft: 17 }}>
        {d.wf.length > 0 && (
          <span style={{ ...chip, background: V.chipBg, color: V.chipText, fontWeight: 600 }}>
            {d.wf.join(' · ')}
          </span>
        )}
        {d.chips.map((c) => (
          <span key={c} style={chip}>
            {c}
          </span>
        ))}
        {!!tools && <span style={chip}>{tools} {t('chat.toolsUnit', 'công cụ')}</span>}
        {!!images && <span style={chip}>🖼 {images} {t('chat.imagesUnit', 'ảnh')}</span>}
      </div>
    </div>
  );
}
