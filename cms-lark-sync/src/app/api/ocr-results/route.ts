import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const RESULTS_PATH = '/tmp/ocr_full_results.json';
const STATE_PATH = '/tmp/ocr_review_state.json';

function readState(): Record<string, ReviewEntry> {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

interface ReviewEntry {
  status: string;
  note: string;
  correctedText?: string;
  category?: string;
}

function writeState(state: Record<string, ReviewEntry>) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// Auto-classify image quality based on OCR result
function classifyImage(item: { text: string; lines?: number; avg_confidence?: number; file: string }): string {
  const text = item.text || '';
  const lines = item.lines || 0;
  const conf = item.avg_confidence || 0;
  const charCount = text.length;

  // Detect handwriting: many garbled chars, low confidence
  const garbledRatio = (text.match(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ,.\s\-()/*+:;|!@#$%&=\[\]{}'"]/g) || []).length;
  const hasHandwriting = charCount > 50 && garbledRatio / charCount > 0.15;

  // Detect screenshot vs photo
  const isScreenshot = item.file.toLowerCase().includes('screenshot') || conf > 0.7;

  // Detect table/spreadsheet content
  const hasTable = text.includes('|') || text.includes('STT') || text.includes('Mã HS') || text.includes('Tên hàng');

  // Classify
  if (charCount < 20) return 'blank-or-unreadable';
  if (hasHandwriting) return 'handwritten';
  if (isScreenshot && hasTable) return 'screenshot-table';
  if (hasTable) return 'document-table';
  if (isScreenshot) return 'screenshot-text';
  if (conf > 0.5) return 'clear-text';
  if (conf > 0.2) return 'blurry-text';
  return 'low-quality';
}

export async function GET() {
  try {
    if (!fs.existsSync(RESULTS_PATH)) {
      // Trả về danh sách rỗng thay vì 404 — file sẽ được tạo khi chạy OCR pipeline
      return NextResponse.json({ success: true, data: [], state: {} });
    }
    const raw = fs.readFileSync(RESULTS_PATH, 'utf-8');
    const results = JSON.parse(raw);
    const state = readState();
    // Auto-classify images that don't have category yet
    for (const item of results) {
      if (item.type === 'image' && !state[item.file]?.category) {
        const cat = classifyImage(item);
        if (!state[item.file]) state[item.file] = { status: 'pending', note: '' };
        state[item.file].category = cat;
      }
    }
    return NextResponse.json({ success: true, data: results, state });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// POST — Re-OCR a single image using Claude Vision API
export async function POST(req: NextRequest) {
  try {
    const { file } = await req.json();
    if (!file) return NextResponse.json({ success: false, error: 'file required' }, { status: 400 });

    const imgDir = path.join(process.cwd(), '..', 'anh-sua-ho-so',
      '2_2 XNK - Nghiệp Vụ Dựng Hồ Sơ_3_4 OPS SỬA_Lưới_Tập tin đính kèm');
    const imgPath = path.join(imgDir, path.basename(file));
    if (!fs.existsSync(imgPath)) return NextResponse.json({ success: false, error: 'Image not found' }, { status: 404 });

    // Read image as base64
    const imgBuf = fs.readFileSync(imgPath);
    const base64 = imgBuf.toString('base64');
    const ext = path.extname(file).toLowerCase();
    const mediaType = ext === '.png' ? 'image/png' : 'image/jpeg';

    // Get Anthropic API key from the main API
    const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:6100/api';
    let anthropicKey = '';
    try {
      const cfgRes = await fetch(`${apiBase}/ai-configs`);
      const cfgData = await cfgRes.json();
      const anthropicCfg = cfgData.data?.find((c: { provider: string; apiKey?: string }) => c.provider === 'anthropic');
      if (anthropicCfg) {
        // Resolve full key
        const resolveRes = await fetch(`${apiBase}/ai-configs/${anthropicCfg._id}/resolve`);
        const resolveData = await resolveRes.json();
        anthropicKey = resolveData.data?.apiKey || '';
      }
    } catch { /* ignore */ }

    if (!anthropicKey) {
      return NextResponse.json({ success: false, error: 'No Anthropic API key found' }, { status: 400 });
    }

    // Call Claude Vision
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 },
            },
            {
              type: 'text',
              text: `Đọc CHÍNH XÁC toàn bộ nội dung trong ảnh. Đây là chứng từ XNK Việt Nam.

QUY TẮC BẮT BUỘC:
1. Phần HEADER (thông tin công ty, số hóa đơn, ngày...): ghi mỗi thông tin 1 dòng, giữ nguyên
2. Phần BẢNG DỮ LIỆU: BẮT BUỘC format mỗi dòng hàng thành 1 dòng duy nhất dùng | ngăn cách cột:
   STT | Tên hàng mô tả đầy đủ | Đơn vị tính | Số lượng | Đơn giá | Thành tiền | Mã HS
3. Chữ viết tay: ghi [viết tay: nội dung đọc được]
4. Không đọc được: ghi [không rõ]
5. Dấu ✓ hoặc tick: ghi ✓
6. Giữ nguyên tiếng Việt có dấu, số liệu giữ format gốc
7. KHÔNG tách 1 dòng hàng thành nhiều dòng. Mỗi STT = đúng 1 dòng

VÍ DỤ OUTPUT ĐÚNG:
---Header---
PINGXIANG CITY LANGYI INTERNATIONAL TRADE CO., LTD
HÓA ĐƠN THƯƠNG MẠI
Số: HN2026-LY1204-HN01
Ngày: 12/04/2026

---Bảng---
STT | Tên hàng | Đơn vị tính | Số lượng | Đơn giá | Thành tiền | Mã HS
1 | Bàn chải đánh răng, chất liệu lông nhựa, không dùng điện, dùng trong gia đình, KT(14*1.7)cm+-10%, hiệu Wanso, Mới 100% | CHIẾC | 1000 | 0.34 | 340 | 96032100
2 | Bình xịt bằng tay, chất liệu nhựa PP, dung tích 100ml, mã 2581,2583, hiệu [không rõ] | CHIẾC | 1000 | 0.474 | 474 | 84248910

Chỉ trả về nội dung, không giải thích.`,
            },
          ],
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const aiText = claudeData.content?.[0]?.text || '';

    if (!aiText) {
      return NextResponse.json({ success: false, error: 'Claude returned empty response' }, { status: 500 });
    }

    // Update the results file
    const results = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf-8'));
    const idx = results.findIndex((r: { file: string }) => r.file === file);
    if (idx >= 0) {
      results[idx].text = aiText;
      results[idx].lines = aiText.split('\n').filter(Boolean).length;
      results[idx].avg_confidence = 0.95;
      results[idx].ocr_method = 'claude-vision';
      fs.writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2), 'utf-8');
    }

    // Update state
    const state = readState();
    state[file] = {
      ...state[file],
      status: state[file]?.status || 'pending',
      note: (state[file]?.note || '') + (state[file]?.note ? '\n' : '') + '[Re-OCR by Claude Vision]',
      category: 'ai-processed',
      correctedText: aiText,
    };
    writeState(state);

    return NextResponse.json({ success: true, text: aiText, lines: aiText.split('\n').filter(Boolean).length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { file, status, note, correctedText, category } = body;
    if (!file) {
      return NextResponse.json({ success: false, error: 'file is required' }, { status: 400 });
    }
    const state = readState();
    state[file] = {
      ...state[file],
      status: status || state[file]?.status || 'pending',
      note: note ?? state[file]?.note ?? '',
      ...(correctedText !== undefined ? { correctedText } : {}),
      ...(category !== undefined ? { category } : {}),
    };
    writeState(state);
    return NextResponse.json({ success: true, data: state[file] });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
