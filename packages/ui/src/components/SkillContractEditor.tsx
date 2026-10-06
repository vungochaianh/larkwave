/**
 * Ô nhập HỢP ĐỒNG cho một kỹ năng — `needs` / `produces` / `checks` / `target`.
 *
 * Vì sao có file này: động cơ kiểm chéo đã chạy từ 1.0.309, nhưng cách duy nhất để khai hợp đồng
 * là tự mở SKILL.md gõ YAML. Nghĩa là tính năng chỉ dùng được bởi người biết đọc frontmatter —
 * tức là gần như không ai.
 *
 * Hai lối vào cố ý để cạnh nhau, không phải chọn một:
 *   • "AI đề xuất" đọc phần mô tả tiếng Việt rồi điền sẵn. Đây là lối chính, vì phần khó không
 *     phải gõ mà là NGHĨ RA tên khoá khớp được giữa bảy kỹ năng.
 *   • Các ô bên dưới luôn sửa được. Đề xuất chỉ là đề xuất; không có đường sửa tay thì một đề xuất
 *     sai là ngõ cụt.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Collapse, Input, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import type { RuntimeAdapter, SkillContractFields } from '@larkwave/core';
import { useI18n } from '../i18n';
import { V } from '../theme';

const { Text } = Typography;

/** Tên khoá hợp lệ — cùng luật với `KEY_RE` trong core. Sai luật thì frontmatter đọc không ra. */
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Câu tiếng Việt → tên khoá.
 *
 * Vì sao cần: trước đây ô này bắt người dùng tự nghĩ ra `tt_kh_trung`, `gia_von`. Đó là bắt họ làm
 * việc của máy bằng một thứ ngôn ngữ họ không có lý do gì phải biết — và tên gõ tay thì lệch nhau
 * ngay giữa hai kỹ năng, khiến chúng không bao giờ nối được.
 *
 * Nay họ gõ "Số khách hàng trùng", máy ra `so_khach_hang_trung`. Khoá vẫn hiện ra để họ thấy, chỉ
 * là không phải tự nghĩ.
 */
export function keyFromText(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
}

const OPS = ['>=', '<=', '==', '!=', '>', '<'] as const;

export interface SkillContractEditorProps {
  value: SkillContractFields;
  onChange: (next: SkillContractFields) => void;
  /** Khoá mọi kỹ năng KHÁC đã khai → tên kỹ năng đó. Dùng để gợi ý và để cảnh báo trùng. */
  keyOwners?: Record<string, string>;
  /** Bấm "AI đề xuất". Bỏ trống = ẩn nút (bản app cũ chưa có đường này). */
  onSuggest?: () => void;
  suggesting?: boolean;
  /** Câu mô hình giải thích vì sao chọn các khoá đó — hiện lại để người dùng duyệt có căn cứ. */
  note?: string;
  /** Runtime — để đọc bảng/cột của Base. Bỏ trống = ẩn phần lấy cột. */
  runtime?: RuntimeAdapter;
}

export function SkillContractEditor({
  value,
  onChange,
  keyOwners = {},
  onSuggest,
  suggesting,
  note,
  runtime,
}: SkillContractEditorProps) {
  const { t } = useI18n();
  const [targetOpen, setTargetOpen] = useState<string[]>([]);
  /** Câu tiếng Việt người dùng gõ, theo khoá — chỉ để HIỆN LẠI, không lưu vào SKILL.md. */
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [cbLeft, setCbLeft] = useState<string | undefined>();
  const [cbOp, setCbOp] = useState<(typeof OPS)[number]>('>=');
  const [cbRight, setCbRight] = useState('');
  /** Bảng + cột của Base — nguồn khoá chắc chắn nhất, vì người dùng nhìn thấy chúng hằng ngày. */
  // Giữ TÊN Base và TÊN bảng riêng: hợp đồng trong SKILL.md khai bằng TÊN (người đọc hiểu được và
  // chép sang máy khác vẫn đúng), còn token/id chỉ để đọc cột ngay lúc này.
  const [tables, setTables] = useState<
    { token: string; id: string; name: string; base: string; table: string }[] | null
  >(null);
  const [tableId, setTableId] = useState<string | undefined>();
  const [cols, setCols] = useState<string[] | null>(null);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingCols, setLoadingCols] = useState(false);
  /** Cột của BẢNG ĐÍCH — khác bảng nguồn: đọc ở bảng này, ghi sang bảng khác là chuyện bình thường. */
  const [targetCols, setTargetCols] = useState<string[] | null>(null);
  const [loadingTargetCols, setLoadingTargetCols] = useState(false);

  const loadTargetCols = async (table: string, base?: string) => {
    const t = (tables ?? []).find((x) => x.table === table && (!base || x.base === base));
    if (!t || !runtime?.larkListFieldNames) return;
    setTargetCols(null);
    setLoadingTargetCols(true);
    try {
      setTargetCols(await runtime.larkListFieldNames(t.token, t.id));
    } catch {
      setTargetCols([]);
    } finally {
      setLoadingTargetCols(false);
    }
  };

  const loadTables = async () => {
    if (!runtime?.larkListBases) return;
    setLoadingTables(true);
    try {
      const bases = await runtime.larkListBases();
      const out: { token: string; id: string; name: string; base: string; table: string }[] = [];
      // Chỉ 5 Base đầu: tài khoản thật có hàng chục Base, nạp hết là bắt chờ rất lâu cho một ô chọn.
      for (const b of bases.slice(0, 5)) {
        const ts = (await runtime.larkListTables?.(b.appToken)) ?? [];
        for (const t of ts)
          out.push({ token: b.appToken, id: t.tableId, name: `${b.name} · ${t.name}`, base: b.name, table: t.name });
      }
      setTables(out);
    } catch {
      setTables([]);
    } finally {
      setLoadingTables(false);
    }
  };

  const pickTable = async (id: string) => {
    setTableId(id);
    setCols(null);
    const t = (tables ?? []).find((x) => x.id === id);
    if (!t || !runtime?.larkListFieldNames) return;
    setLoadingCols(true);
    try {
      const names = await runtime.larkListFieldNames(t.token, t.id);
      setCols(names);
      // Nhớ tên cột gốc theo khoá, để ô chọn ràng buộc hiện "Số điện thoại (so_dien_thoai)" thay vì
      // chỉ một cái khoá không dấu — người dùng nhận ra cột của mình, không phải dịch ngược trong đầu.
      setLabels((cur) => ({ ...cur, ...Object.fromEntries(names.map((n) => [keyFromText(n), n])) }));
    } catch {
      setCols([]);
    } finally {
      setLoadingCols(false);
    }
  };

  /**
   * NẠP LẠI. Đọc lại cả bảng lẫn cột.
   *
   * Vì sao cần nút này chứ không nạp một lần rồi thôi: người dùng vẫn đang mở Base ở cửa sổ khác và
   * thêm cột giữa chừng. Không có nút này thì họ phải đóng hộp thoại, mất hết những gì vừa khai, chỉ
   * để thấy một cột mới.
   */
  const refreshTables = async () => {
    setTables(null);
    setCols(null);
    await loadTables();
    if (tableId) await pickTable(tableId);
    if (target?.table) await loadTargetCols(target.table, target.base);
  };

  /** Gợi ý ô chọn: khoá kỹ năng khác đã dùng. Dùng lại tên có sẵn là điều kiện để nối được. */
  const options = useMemo(
    () => Object.keys(keyOwners).sort().map((k) => ({ value: k, label: `${k} — ${keyOwners[k]}` })),
    [keyOwners],
  );

  /**
   * Danh sách chọn, gộp hai nguồn và NÓI RÕ nguồn nào.
   *
   * Cột trong bảng để trước: đó là thứ người dùng nhìn thấy hằng ngày, còn khoá của kỹ năng khác thì
   * họ phải nhớ ra. Nhãn giữ tên gốc (có dấu) để tìm được, giá trị là khoá máy đọc.
   */
  const keyOptions = useMemo(() => {
    const g: { label: string; options: { value: string; label: string }[] }[] = [];
    if (cols?.length) {
      g.push({
        label: 'Cột trong bảng đã chọn',
        options: cols.map((c) => ({ value: keyFromText(c), label: `${c}  ·  ${keyFromText(c)}` })),
      });
    }
    const others = options.filter((o) => !cols?.some((c) => keyFromText(c) === o.value));
    if (others.length) g.push({ label: 'Khoá kỹ năng khác đã dùng', options: others });
    return g;
  }, [cols, options]);

  const needs = value.needs ?? [];
  const produces = value.produces ?? [];
  const checks = value.checks ?? [];
  const target = value.target;

  const set = (patch: Partial<SkillContractFields>) => onChange({ ...value, ...patch });

  // Kỹ năng ĐÃ CÓ bảng đích: nạp sẵn cột của nó, nếu không thì mở ra thấy các ô chọn cột rỗng và
  // tưởng bảng không có cột nào.
  useEffect(() => {
    if (target?.table && tables && !targetCols && !loadingTargetCols) void loadTargetCols(target.table, target.base);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.table, tables]);

  // Hai kỹ năng cùng sinh một khoá ⇒ kết quả đổi theo thứ tự chạy, đúng thứ tính năng này sinh ra
  // để loại bỏ. Động cơ đã chặn lúc bấm Chạy, nhưng lúc đó người dùng đã viết xong cả bộ rồi —
  // nói ngay tại đây thì họ sửa được khi còn nhớ mình định làm gì.
  const clashes = produces.filter((p) => keyOwners[p]);
  // Khoá vừa cần vừa sinh ra ⇒ kỹ năng tự chờ chính nó, `readySkills` không bao giờ chọn tới, và
  // người dùng chỉ thấy báo "bế tắc" mà không hiểu vì sao.
  const selfWait = needs.filter((n) => produces.includes(n));
  const badKeys = [...needs, ...produces].filter((k) => !KEY_RE.test(k));

  const known = new Set([...needs, ...produces]);
  /** Ràng buộc nhắc tới khoá không kỹ năng nào biết ⇒ mãi ở trạng thái "chưa biết" — vô dụng. */
  const orphanChecks = checks.filter((c) => {
    const used = (c.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).filter((w) => !/^(and|or|not)$/i.test(w));
    return used.length > 0 && !used.some((w) => known.has(w));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Space align="start" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12, maxWidth: 460, display: 'block' }}>
          {t(
            'skills.contract.intro',
            'Mặc định các kỹ năng trong một bộ chạy LẦN LƯỢT — bỏ trống cả phần này là đủ. Chỉ khai khi một kỹ năng THẬT SỰ cần kết quả của kỹ năng khác: lúc đó máy đảm bảo nó không chạy sớm, và nếu cần thì đảo thứ tự (có thể chạy bước 2 trước, rồi 5, rồi 3). Tên kết quả là tên BẠN tự đặt, không cần liên quan tới cột nào.',
          )}
        </Text>
        {onSuggest && (
          <Button size="small" onClick={onSuggest} loading={suggesting}>
            {t('skills.contract.suggest', 'AI đề xuất')}
          </Button>
        )}
      </Space>

      {note && <Alert type="info" showIcon message={note} style={{ fontSize: 12 }} />}

      {/* NGUỒN KHOÁ: bảng trong Base. Đặt lên TRƯỚC hai ô dưới, vì chọn bảng xong thì hai ô đó mới
          có gì để chọn — đặt sau là bắt người dùng nhìn hai ô rỗng rồi tự đoán phải làm gì. */}
      {runtime?.larkListBases ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('skills.contract.fromTableOpt', 'Gợi ý tên từ cột trong Base (tuỳ chọn):')}
          </Text>
          <Select
            size="small"
            style={{ flex: 1, minWidth: 220, maxWidth: 420 }}
            value={tableId}
            onChange={(v) => void pickTable(v)}
            loading={loadingTables}
            placeholder={t('skills.contract.pickTable', 'Chọn bảng trong Base')}
            showSearch
            optionFilterProp="label"
            onDropdownVisibleChange={(open) => {
              if (open && !tables) void loadTables();
            }}
            options={(tables ?? []).map((x) => ({ value: x.id, label: x.name }))}
          />
          <Tooltip title={t('skills.contract.refreshTip', 'Đọc lại bảng và cột — dùng khi bạn vừa thêm/đổi cột trong Base')}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              loading={loadingTables || loadingCols}
              onClick={() => void refreshTables()}
            />
          </Tooltip>
          {cols ? (
            <Text type="secondary" style={{ fontSize: 11.5 }}>
              {cols.length ? `${cols.length} cột` : 'bảng này chưa có cột nào'}
            </Text>
          ) : null}
        </div>
      ) : null}


      <div>
        <Text strong style={{ fontSize: 13 }}>
          {t('skills.contract.step2', 'Bước 2 — Cần có trước')}
        </Text>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          {t('skills.contract.needsHint', 'thứ kỹ năng này CẦN NHẬN từ một kỹ năng khác')}
        </Text>
        <Select
          mode="multiple"
          value={needs}
          onChange={(v) => set({ needs: v })}
          options={keyOptions}
          style={{ width: '100%', marginTop: 4 }}
          placeholder={t('skills.contract.needsPh', 'Để trống nếu kỹ năng này chạy được ngay, không chờ ai')}
          showSearch
          optionFilterProp="label"
        />
        <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
          {t(
            'skills.contract.needsWhy',
            'Đa số kỹ năng để TRỐNG ô này — chúng cứ chạy theo lượt của mình. Chỉ chọn khi kỹ năng này sẽ hỏng nếu thiếu kết quả của kỹ năng khác: chọn vào đây là máy đảm bảo nó CHỜ, không chạy sớm.',
          )}
        </Text>
      </div>

      <div>
        <Text strong style={{ fontSize: 13 }}>
          {t('skills.contract.produces', 'Sinh ra')}
        </Text>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          {t('skills.contract.producesHint', 'kết quả kỹ năng này làm ra, để kỹ năng khác dùng lại')}
        </Text>
        <Select
          mode="tags"
          value={produces}
          onChange={(v) => set({ produces: v.map((x) => keyFromText(x) || x) })}
          options={keyOptions}
          style={{ width: '100%', marginTop: 4 }}
          placeholder={t('skills.contract.producesPh', 'Gõ tên kết quả rồi Enter — vd: số khách trùng')}
          showSearch
          optionFilterProp="label"
        />
        <Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: 4 }}>
          {t(
            'skills.contract.keyHint',
            'Cứ gõ bằng tiếng Việt rồi Enter — vd "số khách trùng", "danh sách đơn thiếu". Đây là tên BẠN đặt cho kết quả, không cần là cột nào cả. Đây cũng là chỗ dây chuyền được nối: tên này chính là thứ kỹ năng sau chọn ở ô "Cần có trước". Nếu kết quả đúng là một cột trong Base thì chọn từ danh sách cho khỏi gõ.',
          )}
        </Text>
      </div>

      <div>
        <Text strong style={{ fontSize: 13 }}>
          {t('skills.contract.checks', 'Ràng buộc (tuỳ chọn)')}
        </Text>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
          {t('skills.contract.checksHint', 'điều phải LUÔN đúng — máy tự kiểm sau mỗi bước')}
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {checks.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input
                style={{ flex: 1, minWidth: 220, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5 }}
                value={c}
                onChange={(e) => {
                  const next = [...checks];
                  next[i] = e.target.value;
                  set({ checks: next.filter((x, k) => x.trim() || k !== i) });
                }}
              />
              <Button size="small" onClick={() => set({ checks: checks.filter((_, k) => k !== i) })}>
                Bỏ
              </Button>
            </div>
          ))}
          {/* Dựng ràng buộc bằng Ô CHỌN, không bắt gõ cú pháp.
              Ô tự do vẫn giữ ở trên cho ràng buộc viết bằng lời — nhưng người dùng KHÔNG phải bắt
              đầu từ một ô trống và tự đoán cú pháp, vốn là chỗ khó hiểu nhất của cả màn hình. */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select
              style={{ minWidth: 168 }}
              value={cbLeft}
              onChange={setCbLeft}
              placeholder={t('skills.contract.cbLeft', 'khoá')}
              options={[...produces, ...needs].map((k) => ({ value: k, label: labels[k] ? `${labels[k]} (${k})` : k }))}
            />
            <Select style={{ width: 78 }} value={cbOp} onChange={setCbOp} options={OPS.map((o) => ({ value: o, label: o }))} />
            <Input
              style={{ width: 168 }}
              value={cbRight}
              onChange={(e) => setCbRight(e.target.value)}
              placeholder={t('skills.contract.cbRight', 'khoá khác hoặc một số')}
            />
            <Button
              size="small"
              type="primary"
              ghost
              disabled={!cbLeft || !cbRight.trim()}
              onClick={() => {
                set({ checks: [...checks, `${cbLeft} ${cbOp} ${cbRight.trim()}`] });
                setCbLeft(undefined);
                setCbRight('');
              }}
            >
              + Thêm ràng buộc
            </Button>
          </div>
          <Text type="secondary" style={{ fontSize: 11.5 }}>
            {t(
              'skills.contract.checksWhy',
              'Ví dụ: "tổng số vấn đề = số khách trùng + số đơn thiếu". Nếu kỹ năng nào tính sai, phép tính này lệch và máy BẮT NÓ LÀM LẠI ngay tại bước gây lỗi — không phải chờ tới cuối mới biết. Đây là chỗ các kỹ năng bắt lỗi lẫn nhau. Đa số bộ không cần ràng buộc nào — cứ để trống.',
            )}
          </Text>
        </div>
      </div>

      {badKeys.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={t('skills.contract.badKeys', 'Tên khoá không hợp lệ — sẽ không đọc được')}
          description={
            <span>
              {badKeys.map((k) => (
                <Tag key={k} color="red">
                  {k}
                </Tag>
              ))}
              {t('skills.contract.badKeysHint', ' Dùng chữ thường không dấu, nối bằng gạch dưới: gia_von.')}
            </span>
          }
        />
      )}
      {selfWait.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={t('skills.contract.selfWait', 'Khoá vừa cần vừa sinh ra — kỹ năng sẽ tự chờ chính nó')}
          description={selfWait.join(', ')}
        />
      )}
      {clashes.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('skills.contract.clash', 'Khoá này đã có kỹ năng khác sinh ra')}
          description={
            <span>
              {clashes.map((k) => (
                <div key={k}>
                  <Tag>{k}</Tag> — {keyOwners[k]}
                </div>
              ))}
              {t(
                'skills.contract.clashHint',
                'Mỗi khoá chỉ được một kỹ năng sinh ra, nếu không kết quả sẽ đổi theo thứ tự chạy. Bộ kỹ năng sẽ bị chặn khi bấm Chạy.',
              )}
            </span>
          }
        />
      )}
      {orphanChecks.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('skills.contract.orphanCheck', 'Ràng buộc nhắc tới khoá chưa khai — sẽ luôn ở trạng thái "chưa biết"')}
          description={orphanChecks.join(' · ')}
        />
      )}

      {/* CHƯƠNG TRÌNH SẼ CHẠY THẾ NÀO — dựng lại từ chính những gì vừa khai.
          Người dùng khai xong vẫn không hình dung được điều gì sẽ xảy ra, vì `needs`/`produces` là
          khai báo chứ không phải kịch bản. Đoạn này dịch khai báo đó thành một câu kể. */}
      <div
        style={{
          border: `1px solid ${V.borderSub}`,
          borderRadius: 10,
          padding: '10px 12px',
          background: V.layer,
        }}
      >
        <Text strong style={{ fontSize: 12.5 }}>
          {t('skills.contract.preview', 'Khi chạy, kỹ năng này sẽ:')}
        </Text>
        <ol style={{ margin: '6px 0 0', paddingLeft: 20, fontSize: 12.5, color: V.textSub, lineHeight: 1.7 }}>
          <li>
            {needs.length ? (
              <>
                Chờ cho tới khi có đủ{' '}
                {needs.map((k) => (
                  <Tag key={k} color="blue" style={{ marginInlineEnd: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5 }}>
                    {k}
                  </Tag>
                ))}
                — tức là chạy <b>sau</b> kỹ năng sinh ra chúng.
              </>
            ) : (
              <>
                Chạy được <b>ngay từ đầu</b> — không chờ kỹ năng nào.
              </>
            )}
          </li>
          <li>Làm theo phần nội dung hướng dẫn bạn viết ở trên.</li>
          {produces.length ? (
            <li>
              Kết thúc bằng khối <Text code>facts</Text> ghi{' '}
              {produces.map((k) => (
                <Tag key={k} color="green" style={{ marginInlineEnd: 4, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 10.5 }}>
                  {k}
                </Tag>
              ))}
              . Kỹ năng khác cần các khoá này sẽ được mở khoá.
            </li>
          ) : (
            <li>Không sinh ra khoá nào — kỹ năng khác không chờ nó.</li>
          )}
          {checks.length ? (
            <li>
              Máy kiểm lại {checks.length} ràng buộc. Sai thì kỹ năng <b>vừa chạy</b> bị bắt làm lại (tối đa 2 lần).
            </li>
          ) : null}
          {target?.table ? (
            <li>
              Ghi kết quả vào bảng <Text code>{target.table}</Text> — chỉ dòng qua được mọi ràng buộc.
            </li>
          ) : null}
        </ol>
      </div>

      <Collapse
        size="small"
        ghost
        activeKey={targetOpen}
        onChange={(k) => setTargetOpen(k as string[])}
        items={[
          {
            key: 'target',
            label: (
              <Tooltip
                title={t(
                  'skills.contract.targetTip',
                  'Chỉ dùng cho kỹ năng trích xuất rồi ghi thành bản ghi. Khai ở đây chứ không chọn lúc chạy, để cùng loại chứng từ thì lần nào cũng ra đúng bấy nhiêu cột.',
                )}
              >
                <Text style={{ fontSize: 13 }}>
                  {t('skills.contract.target', 'Bảng đích (tuỳ chọn)')}
                  {target?.table ? <Tag style={{ marginLeft: 8 }}>{target.table}</Tag> : null}
                </Text>
              </Tooltip>
            ),
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* NÓI RÕ DÙNG ĐỂ LÀM GÌ trước khi hỏi điền gì. Trước đây chỉ có ba ô trống — người
                    dùng không biết nó phục vụ việc gì nên không biết có cần điền hay không. */}
                <Alert
                  type="info"
                  showIcon
                  message={t('skills.contract.targetWhat', 'Phần này chỉ dùng cho kỹ năng ĐỌC TỆP rồi ghi thành dòng')}
                  description={
                    <div style={{ fontSize: 12.5 }}>
                      Ví dụ: chọn 20 hoá đơn PDF, kỹ năng đọc từng tệp rồi ghi mỗi tệp thành <b>một dòng</b> trong
                      bảng bạn chọn dưới đây. Dòng nào không qua được ràng buộc thì <b>không được ghi</b>.
                      <div style={{ marginTop: 4, color: V.textFaint }}>
                        Kỹ năng chỉ tính toán rồi chuyền kết quả cho kỹ năng khác thì <b>bỏ trống phần này</b>.
                      </div>
                    </div>
                  }
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text type="secondary" style={{ fontSize: 12.5 }}>
                    {t('skills.contract.targetPick', 'Ghi vào bảng:')}
                  </Text>
                  <Select
                    style={{ flex: 1, minWidth: 230 }}
                    value={target?.table ? `${target.base ?? ''}|${target.table}` : undefined}
                    onChange={(v) => {
                      const [base, table] = String(v).split('|');
                      set({ target: { base: base || undefined, table, map: target?.map ?? {} } });
                      void loadTargetCols(table, base);
                    }}
                    loading={loadingTables}
                    placeholder={t('skills.contract.targetPh', 'Chọn bảng sẽ ghi kết quả vào')}
                    showSearch
                    optionFilterProp="label"
                    allowClear
                    onClear={() => set({ target: undefined })}
                    onDropdownVisibleChange={(open) => {
                      if (open && !tables) void loadTables();
                    }}
                    options={(tables ?? []).map((x) => ({ value: `${x.base}|${x.table}`, label: x.name }))}
                  />
                  {targetCols ? (
                    <Text type="secondary" style={{ fontSize: 11.5 }}>
                      {targetCols.length} cột
                    </Text>
                  ) : null}
                </div>

                {target?.table ? (
                  <>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t('skills.contract.map', 'Mỗi kết quả ghi vào cột nào — bỏ trống thì không ghi kết quả đó.')}
                    </Text>
                    {produces.length ? (
                      produces.map((k) => (
                        <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <Tag style={{ minWidth: 150, marginInlineEnd: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11 }}>
                            {labels[k] ? `${labels[k]} · ${k}` : k}
                          </Tag>
                          <Select
                            style={{ flex: 1, minWidth: 180 }}
                            value={target?.map?.[k]}
                            onChange={(v) => {
                              const map = { ...(target?.map ?? {}) };
                              if (v) map[k] = v;
                              else delete map[k];
                              set({ target: { ...(target ?? { table: '' }), table: target?.table ?? '', map } });
                            }}
                            placeholder={t('skills.contract.column', 'Chọn cột trong bảng đích')}
                            loading={loadingTargetCols}
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={(targetCols ?? []).map((c) => ({ value: c, label: c }))}
                          />
                        </div>
                      ))
                    ) : (
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {t('skills.contract.mapEmpty', 'Khai "Sinh ra" ở trên trước, rồi mới gán được cột.')}
                      </Text>
                    )}
                  </>
                ) : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Hợp đồng rỗng thật sự? Dùng để KHÔNG gửi một object rỗng làm xoá mất hợp đồng đang có. */
export function isEmptyContract(c: SkillContractFields | undefined): boolean {
  if (!c) return true;
  return !c.needs?.length && !c.produces?.length && !c.checks?.length && !c.target?.table;
}
