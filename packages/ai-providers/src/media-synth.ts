import { deflateSync } from 'node:zlib';

/**
 * Generates a valid uncompressed/deflated 24-bit RGB PNG binary image buffer
 * with proper PNG signature, IHDR, IDAT, and IEND CRC32 chunks.
 */
export function generateValidSolidPng(params: {
  width: number;
  height: number;
  r: number;
  g: number;
  b: number;
  accentR?: number;
  accentG?: number;
  accentB?: number;
}): Uint8Array {
  const { width, height, r, g, b } = params;
  const ar = params.accentR ?? 34;
  const ag = params.accentG ?? 211;
  const ab = params.accentB ?? 238;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 2; // RGB color type
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const rowStride = width * 3 + 1;
  const rawPixels = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowStride;
    rawPixels[rowStart] = 0; // Filter type 0 (None)
    const isAccentBand = y >= Math.floor(height * 0.42) && y <= Math.floor(height * 0.58);
    for (let x = 0; x < width; x++) {
      const px = rowStart + 1 + x * 3;
      rawPixels[px] = isAccentBand ? ar : r;
      rawPixels[px + 1] = isAccentBand ? ag : g;
      rawPixels[px + 2] = isAccentBand ? ab : b;
    }
  }

  const compressedData = deflateSync(rawPixels);

  return new Uint8Array(
    Buffer.concat([
      signature,
      makePngChunk('IHDR', ihdrData),
      makePngChunk('IDAT', compressedData),
      makePngChunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Generates a valid 16-bit mono PCM WAV audio buffer with a RIFF/WAVE header.
 */
export function generateValidWavAudio(durationSec = 2, sampleRate = 16000): Uint8Array {
  const numSamples = Math.max(1600, Math.floor(durationSec * sampleRate));
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat 1 = PCM
  buffer.writeUInt16LE(1, 22); // Mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.floor(Math.sin(2 * Math.PI * 220 * t) * 4000);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }

  return new Uint8Array(buffer);
}
