/// <reference lib="webworker" />

import { detectCardQuad, warpCardPixels } from "./edge-detection";

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.onmessage = (
  event: MessageEvent<{ pixels: ArrayBuffer; width: number; height: number }>,
) => {
  try {
    const pixels = new Uint8ClampedArray(event.data.pixels);
    const corners = detectCardQuad(pixels, event.data.width, event.data.height);
    if (!corners) {
      workerScope.postMessage({});
      return;
    }
    const result = warpCardPixels(
      pixels,
      event.data.width,
      event.data.height,
      corners,
    );
    workerScope.postMessage(result, [result.pixels]);
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : "Card-edge detection failed.",
    });
  }
};

export {};
