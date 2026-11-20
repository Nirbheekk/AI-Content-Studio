import { describe, expect, it } from 'vitest';
import { detectMimeTypeFromMagicBytes } from '@ai-content-os/shared';
import { MinioStorageAdapter } from '../storage.js';

describe('@ai-content-os/integrations MinioStorageAdapter (live MinIO)', () => {
  const storage = new MinioStorageAdapter();

  it('provisions buckets, uploads via presigned PUT URL, inspects magic bytes, and downloads via presigned GET URL', async () => {
    await storage.ensureAllBuckets();
    const bucket = storage.getConfig().rawBucket;
    const storageKey = `tests/phase1-magic-${Date.now()}.png`;

    // Real 8-byte PNG header + payload
    const pngPayload = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52,
    ]);

    const uploadUrl = storage.createPresignedUrl({
      method: 'PUT',
      bucket,
      storageKey,
      expiresInSec: 300,
    });

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: pngPayload,
      headers: { 'Content-Type': 'image/png' },
    });
    expect(uploadRes.ok).toBe(true);

    const headInfo = await storage.headObject({ bucket, storageKey });
    expect(headInfo.exists).toBe(true);
    expect(headInfo.sizeBytes).toBe(pngPayload.byteLength);

    const headerBytes = await storage.getObjectHeaderBytes({ bucket, storageKey, byteCount: 16 });
    expect(detectMimeTypeFromMagicBytes(headerBytes)).toBe('image/png');

    const downloadUrl = storage.createPresignedUrl({
      method: 'GET',
      bucket,
      storageKey,
      expiresInSec: 300,
    });
    const downloadRes = await fetch(downloadUrl);
    expect(downloadRes.ok).toBe(true);
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    expect(downloadedBytes.byteLength).toBe(pngPayload.byteLength);

    await storage.deleteObject({ bucket, storageKey });
    const afterDelete = await storage.headObject({ bucket, storageKey });
    expect(afterDelete.exists).toBe(false);
  });
});
