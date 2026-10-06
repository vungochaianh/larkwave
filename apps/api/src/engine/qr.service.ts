import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrService {
  /** Returns a PNG data-URL QR code for the given text/URL. */
  toDataUrl(text: string): Promise<string> {
    return QRCode.toDataURL(text, { margin: 1, width: 256, errorCorrectionLevel: 'M' });
  }
}
