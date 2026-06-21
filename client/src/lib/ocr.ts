const MIN_WIDTH = 1000;
const SCALE_FACTOR = 2;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function preprocessImageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  if (width < MIN_WIDTH) {
    width = Math.round(width * SCALE_FACTOR);
    height = Math.round(height * SCALE_FACTOR);
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0; i < gray.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;

  let variance = 0;
  for (let i = 0; i < gray.length; i++) variance += (gray[i] - mean) ** 2;
  const stddev = Math.sqrt(variance / gray.length);

  const contrastFactor = stddev < 30 ? Math.min(30 / Math.max(stddev, 1), 3) : 1;

  const threshold = Math.round(mean * 0.85);

  for (let i = 0; i < gray.length; i++) {
    let val = gray[i];
    val = Math.round(mean + (val - mean) * contrastFactor);
    val = val > threshold ? 255 : 0;
    data[i * 4] = val;
    data[i * 4 + 1] = val;
    data[i * 4 + 2] = val;
    data[i * 4 + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export async function preprocessImage(file: File): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = preprocessImageToCanvas(img);
  URL.revokeObjectURL(img.src);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create processed image'));
    }, 'image/png');
  });
}

export async function performOCR(
  file: File,
  onProgress?: (status: string) => void
): Promise<{ text: string; confidence: number }> {
  const { createWorker } = await import('tesseract.js');

  onProgress?.('Preprocessing image...');
  const processedBlob = await preprocessImage(file);

  onProgress?.('Loading OCR engine...');
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress?.(`Reading text... ${Math.round(m.progress * 100)}%`);
      }
    },
  });

  await worker.setParameters({
    tessedit_pageseg_mode: '6' as any,
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,;:()-/ %+',
  });

  onProgress?.('Reading text from image...');
  const { data } = await worker.recognize(processedBlob);

  await worker.terminate();

  return {
    text: data.text.trim(),
    confidence: data.confidence,
  };
}
