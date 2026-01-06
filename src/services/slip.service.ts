import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import jsqr from 'jsqr';
import { createWorker } from 'tesseract.js';

export interface SlipData {
  amount: number | null;
  date: string | null;
  transRef: string | null;
  isVerified: boolean;
  rawText?: string;
}

export class SlipService {
  /**
   * Process a slip image to extract transaction data and verify it.
   */
  static async processSlip(imageUrl: string): Promise<SlipData | null> {
    try {
      // 1. Download image
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data, 'binary');

      // 2. Scan for QR Code (Mini-QR / EMVCo)
      const qrData = await this.scanQRCode(buffer);

      // 3. Run OCR for text extraction
      const ocrResult = await this.runOCR(buffer);

      // 4. Parse and Verify
      const slipData: SlipData = {
        amount: this.extractAmount(ocrResult),
        date: new Date().toISOString(),
        transRef: null,
        isVerified: false,
        rawText: ocrResult
      };

      if (qrData) {
        const emvco = this.parseEMVCo(qrData);
        // ID 00 is Payload Format Indicator, should be "01"
        // ID 51 or 43 often contains Thai bank info (Mini-QR)
        if (emvco['00'] === '01') {
          slipData.isVerified = true;
          slipData.transRef = qrData; // Store the whole payload or a specific ID
        }
      }

      return slipData;
    } catch (error) {
      console.error('Error processing slip:', error);
      return null;
    }
  }

  private static async scanQRCode(buffer: Buffer): Promise<string | null> {
    try {
      const image = await loadImage(buffer);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsqr(imageData.data, imageData.width, imageData.height);

      return code ? code.data : null;
    } catch (error) {
      console.error('QR Scan Error:', error);
      return null;
    }
  }

  /**
   * Basic EMVCo Parser for Thai QR
   */
  private static parseEMVCo(payload: string): Record<string, string> {
    const result: Record<string, string> = {};
    let i = 0;
    try {
      while (i < payload.length) {
        const id = payload.substring(i, i + 2);
        const lengthStr = payload.substring(i + 2, i + 4);
        if (!lengthStr) break;
        const length = parseInt(lengthStr);
        const value = payload.substring(i + 4, i + 4 + length);
        result[id] = value;
        i += 4 + length;
      }
    } catch (e) {
      console.error('EMVCo Parse Error:', e);
    }
    return result;
  }

  private static async runOCR(buffer: Buffer): Promise<string> {
    const worker = await createWorker(['tha', 'eng']);
    const { data: { text } } = await worker.recognize(buffer);
    await worker.terminate();
    return text;
  }

  private static extractAmount(text: string): number | null {
    // Look for patterns like "จำนวนเงิน (บาท) 100.00" or just "100.00"
    const amountRegex = /([0-9,]+\.[0-9]{2})/;
    const match = text.match(amountRegex);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return null;
  }
}
