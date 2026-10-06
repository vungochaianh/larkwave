import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppConfigService } from '../config/app-config.service';

const pexec = promisify(execFile);

export interface TtsVoice {
  id: string;
  name: string;
  previewUrl: string;
  category?: string;
  /** BCP-47-ish language from the voice's labels (e.g. 'vi', 'en'). */
  language?: string;
  labels?: Record<string, string>;
}

/** Per-character timing from ElevenLabs (for caption↔speech sync). */
export interface TtsAlignment {
  chars: string[];
  starts: number[];
  ends: number[];
}

/** ElevenLabs v3 (multilingual, native Vietnamese) — model used for narration. */
const TTS_MODEL = 'eleven_v3';
/** Safe Vietnamese default (Hà Giang — Sweet & Clear Vietnamese) if the caller passes none. */
const DEFAULT_VI_VOICE = 'FakNc5gCZMILOW8jXlh1';

/**
 * Derive an ISO-ish language code for a voice, robust across ElevenLabs response shapes.
 * Our account's voices carry it in `labels.language` ('vi'), but library/premade voices may
 * only expose it via `fine_tuning.language` or `verified_languages[].language`, and creators
 * sometimes write a free-text 'vietnamese' — normalise all of these to 'vi'.
 */
function deriveLanguage(v: Record<string, unknown>): string | undefined {
  const labels = v.labels as Record<string, string> | undefined;
  const ft = v.fine_tuning as { language?: string } | undefined;
  const verified = v.verified_languages as Array<{ language?: string }> | undefined;
  const raw =
    labels?.language ||
    ft?.language ||
    (Array.isArray(verified) && verified.length ? verified[0]?.language : undefined);
  if (!raw) return undefined;
  const s = String(raw).toLowerCase().trim();
  if (s === 'vi' || s.startsWith('vietnam') || s.includes('tiếng việt') || s.includes('tieng viet')) return 'vi';
  return s.length >= 2 ? s.slice(0, 2) : s;
}

/** ElevenLabs text-to-speech for Video Studio narration. Header is `xi-api-key`. */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  /**
   * Voices this account listed but could not actually synthesise (403 voice_access_denied).
   *
   * `sharing.status === 'copied_disabled'` catches the known cause — a shared professional voice
   * whose owner revoked it — and a sweep of all 43 voices on the production key confirmed it is
   * today the ONLY one that fails. But a voice can also become unusable for reasons that field
   * does not express (a plan change, for instance), and the picker must not keep offering a voice
   * we have already watched fail. Remembered in memory only: the API is a single instance and a
   * restart simply re-learns on the next 403, which is cheaper than persisting it.
   */
  private readonly deniedVoices = new Set<string>();
  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return !!this.config.env.ELEVENLABS_API_KEY;
  }
  private key(): string {
    return this.config.env.ELEVENLABS_API_KEY;
  }

  /** List voices (each carries a `preview_url` mp3 for the "listen" button). */
  async listVoices(): Promise<TtsVoice[]> {
    if (!this.enabled) return [];
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': this.key() } });
    if (!r.ok) {
      throw new BadRequestException(
        r.status === 401
          ? 'Khoá ElevenLabs không còn hiệu lực (401). Quản trị viên cần cấp khoá mới rồi khởi động lại máy chủ.'
          : `ElevenLabs voices ${r.status}`,
      );
    }
    const j = (await r.json()) as { voices?: Array<Record<string, unknown>> };
    // Drop voices this account can LIST but cannot SYNTHESISE. A shared "professional" voice whose
    // owner revoked it stays in /v1/voices with sharing.status = 'copied_disabled', and the picker
    // happily offered it — the user chose one, and the render died with a 403 voice_access_denied
    // they could do nothing about. Verified against live TTS calls on the production key:
    // 'copied' (21 voices) and premade/null (21) all return 200; 'copied_disabled' is the only
    // status that 403s. Filtering on the exact status keeps every usable voice visible.
    const usable = (j.voices || []).filter(
      (v) =>
        (v.sharing as { status?: string } | undefined)?.status !== 'copied_disabled' &&
        !this.deniedVoices.has(String(v.voice_id)),
    );
    const voices: TtsVoice[] = usable.map((v) => {
      const labels = v.labels as Record<string, string> | undefined;
      return {
        id: String(v.voice_id),
        name: String(v.name || ''),
        previewUrl: String(v.preview_url || ''),
        category: v.category as string | undefined,
        language: deriveLanguage(v),
        labels,
      };
    });
    // Surface Vietnamese voices first (this is a Vietnamese product) so the picker defaults right.
    return voices.sort((a, b) => {
      const av = a.language === 'vi' ? 0 : 1;
      const bv = b.language === 'vi' ? 0 : 1;
      return av !== bv ? av - bv : a.name.localeCompare(b.name);
    });
  }

  /**
   * Synthesize text → mp3 under uploads/audio. Uses the WITH-TIMESTAMPS endpoint so we get
   * per-character start/end times → captions can be timed to the exact spoken moment (A/V sync).
   * Returns URL + local path + accurate duration + character alignment.
   */
  async synth(
    text: string,
    voiceId: string,
  ): Promise<{ url: string; path: string; durationSec: number; alignment: TtsAlignment | null }> {
    if (!this.enabled) throw new BadRequestException('ElevenLabs chưa được cấu hình (thiếu ELEVENLABS_API_KEY).');
    const vid = voiceId || DEFAULT_VI_VOICE; // default to a Vietnamese voice
    const body = JSON.stringify({
      text: text.slice(0, 5000),
      model_id: TTS_MODEL, // ElevenLabs v3 — native Vietnamese
      // Livelier, more engaging delivery: lower stability = more expressive/varied, a touch of
      // style, speaker boost for presence, and a slightly quicker pace so it feels energetic.
      voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true, speed: 1.08 },
    });
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}/with-timestamps`, {
      method: 'POST',
      headers: { 'xi-api-key': this.key(), 'content-type': 'application/json', accept: 'application/json' },
      body,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      // A stored voice can stop being usable later — removed from the workspace, unshared, or
      // outside a restricted API key's allowed set. ElevenLabs answers 403 voice_access_denied and
      // we used to hard-fail the whole video for it, stranding the project with a red error the
      // user cannot act on. Retry once on the default Vietnamese voice instead: a video in a
      // different voice beats no video, and the caller logs which voice actually got used.
      const denied = r.status === 403 && t.includes('voice_access_denied');
      if (denied) this.deniedVoices.add(vid); // hide it from the picker from now on
      const deniedVoice = denied && vid !== DEFAULT_VI_VOICE;
      if (deniedVoice) {
        this.logger.warn(`Giọng ${vid} không dùng được (403) — chuyển sang giọng mặc định.`);
        return this.synth(text, DEFAULT_VI_VOICE);
      }
      throw new BadRequestException(
        r.status === 403 && t.includes('voice_access_denied')
          ? 'Giọng đọc này không dùng được với tài khoản ElevenLabs hiện tại. Hãy chọn giọng khác trong danh sách.'
          : // 401 = khoá sai hoặc đã bị thu hồi. "ElevenLabs TTS 401: {...}" là câu nói cho MÁY:
            // người dùng đọc xong không biết phải làm gì, còn quản trị viên thì không biết là do khoá.
            r.status === 401
            ? 'Khoá ElevenLabs không còn hiệu lực (401) — khoá đã bị thu hồi hoặc nhập sai. Quản trị viên cần cấp khoá mới (ELEVENLABS_API_KEY) rồi khởi động lại máy chủ.'
            : `ElevenLabs TTS ${r.status}: ${t.slice(0, 200)}`,
      );
    }
    const j = (await r.json()) as {
      audio_base64?: string;
      alignment?: { characters?: string[]; character_start_times_seconds?: number[]; character_end_times_seconds?: number[] };
    };
    if (!j.audio_base64) throw new BadRequestException('ElevenLabs không trả về audio.');
    const buf = Buffer.from(j.audio_base64, 'base64');
    const dir = join(this.config.uploadsDir, 'audio');
    await fs.mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${randomBytes(4).toString('hex')}.mp3`;
    const path = join(dir, name);
    await fs.writeFile(path, buf);

    const a = j.alignment;
    const alignment: TtsAlignment | null =
      a?.characters && a.character_start_times_seconds && a.character_end_times_seconds
        ? { chars: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds }
        : null;
    // Prefer the alignment's last end time (exact) over ffprobe; fall back to ffprobe.
    let durationSec = 0;
    if (alignment && alignment.ends.length) durationSec = Math.round(alignment.ends[alignment.ends.length - 1] * 100) / 100;
    if (!durationSec || durationSec < 0.5) durationSec = await this.probeDuration(path);
    return { url: `${this.config.publicApiUrl}/uploads/audio/${name}`, path, durationSec, alignment };
  }

  private async probeDuration(path: string): Promise<number> {
    try {
      const { stdout } = await pexec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', path]);
      const d = parseFloat(stdout.trim());
      return Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : 30;
    } catch {
      return 30;
    }
  }
}
