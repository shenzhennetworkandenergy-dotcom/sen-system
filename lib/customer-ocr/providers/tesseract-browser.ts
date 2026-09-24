import { parseBusinessCardOcr } from "../parser.ts";
import type {
  BusinessCardOcrProvider,
  OcrLine,
  OcrProgress,
} from "../types.ts";

function progressMessage(status: string, progress: number): OcrProgress {
  return {
    stage: status.replaceAll("_", " "),
    progress: Math.max(0, Math.min(1, progress)),
  };
}

export async function createTesseractBusinessCardProvider(): Promise<BusinessCardOcrProvider> {
  const tesseract = await import("tesseract.js");
  return {
    async recognize(image, options = {}) {
      const worker = await tesseract.createWorker(
        ["eng", "ben", "chi_sim"],
        tesseract.OEM.LSTM_ONLY,
        {
          // Keep the OCR runtime completely local for the offline bundle. The
          // bundle builder copies these files from public/ocr, so no CDN fetch
          // is needed when a user scans a business card without internet.
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          gzip: true,
          logger(message) {
            options.onProgress?.(
              progressMessage(message.status, message.progress),
            );
          },
        },
      );
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT,
          preserve_interword_spaces: "1",
          user_defined_dpi: "300",
        });
        const result = await worker.recognize(
          image,
          { rotateAuto: true },
          { blocks: true, text: true },
        );
        const lines: OcrLine[] = [];
        for (const block of result.data.blocks ?? []) {
          for (const paragraph of block.paragraphs) {
            for (const line of paragraph.lines) {
              if (line.text.trim()) {
                lines.push({
                  text: line.text.trim(),
                  confidence: line.confidence,
                });
              }
            }
          }
        }
        if (!lines.length) {
          for (const text of result.data.text.split(/\r?\n/u)) {
            if (text.trim()) {
              lines.push({
                text: text.trim(),
                confidence: result.data.confidence,
              });
            }
          }
        }
        return parseBusinessCardOcr(lines);
      } finally {
        await worker.terminate();
      }
    },
  };
}
