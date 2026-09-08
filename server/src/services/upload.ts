import multer from 'multer';
import cloudinary from '../config/cloudinary.js';
import { cloudinaryEnabled } from '../config/env.js';
import { badRequest } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

/**
 * Leading bytes for each accepted format. The client-supplied MIME type is a
 * claim, not evidence, so it is checked against the actual file signature
 * before the buffer is handed to an image decoder.
 */
const SIGNATURES: { mime: string; test: (buffer: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
  {
    mime: 'image/heic',
    test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp',
  },
];

export function detectImageType(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  return SIGNATURES.find((signature) => signature.test(buffer))?.mime ?? null;
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      callback(null, true);
      return;
    }
    callback(
      badRequest(
        'That file type is not supported.',
        'Upload a JPEG, PNG, WEBP or HEIC image.',
        { image: 'Unsupported file type.' },
      ),
    );
  },
});

/** Throws if the bytes do not match a supported image format. */
export function assertIsImage(file: Express.Multer.File): void {
  if (detectImageType(file.buffer) === null) {
    throw badRequest(
      'That file is not a readable image.',
      'Take the photo again, or choose a different file.',
      { image: 'The file contents are not a supported image.' },
    );
  }
}

/**
 * Uploads to Cloudinary when configured.
 *
 * Returns `undefined` rather than throwing when storage is unavailable: the
 * analysis is the product, the stored photo is a convenience, and losing the
 * image should never lose the verdict. Callers surface this to the user.
 */
export async function uploadToCloudinary(file: Express.Multer.File): Promise<string | undefined> {
  if (!cloudinaryEnabled) return undefined;

  return new Promise((resolve) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'vitalai/scans',
        resource_type: 'image',
        // Strips EXIF, including GPS coordinates attached by phone cameras.
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
        image_metadata: false,
      },
      (error, result) => {
        if (error || !result) {
          logger.warn('Cloudinary upload failed', { reason: error?.message ?? 'no result returned' });
          resolve(undefined);
          return;
        }
        resolve(result.secure_url);
      },
    );

    stream.end(file.buffer);
  });
}
