import { createHash, createHmac } from 'node:crypto';
import { ExternalProviderError } from '@ai-content-os/shared';

export interface S3StorageConfig {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  rawBucket: string;
  derivativesBucket: string;
  rendersBucket: string;
}

export function resolveS3StorageConfig(env: NodeJS.ProcessEnv = process.env): S3StorageConfig {
  const endpoint = (env['S3_ENDPOINT'] ?? 'http://localhost:9000').replace(/\/$/, '');
  const publicEndpoint = (env['S3_PUBLIC_ENDPOINT'] ?? endpoint).replace(/\/$/, '');
  return {
    endpoint,
    publicEndpoint,
    region: env['S3_REGION'] ?? 'us-east-1',
    accessKeyId: env['S3_ACCESS_KEY'] ?? 'minioadmin',
    secretAccessKey: env['S3_SECRET_KEY'] ?? 'minioadmin_dev_password',
    rawBucket: env['S3_BUCKET_RAW'] ?? 'aicos-raw-assets',
    derivativesBucket: env['S3_BUCKET_DERIVATIVES'] ?? 'aicos-derivatives',
    rendersBucket: env['S3_BUCKET_RENDERS'] ?? 'aicos-renders',
  };
}

function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

function encodeS3URI(pathStr: string, encodeSlash = false): string {
  return encodeURIComponent(pathStr)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/%2F/g, encodeSlash ? '%2F' : '/');
}

function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
  region: string,
  service = 's3',
): Buffer {
  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

export class MinioStorageAdapter {
  private readonly config: S3StorageConfig;

  constructor(config: S3StorageConfig = resolveS3StorageConfig()) {
    this.config = config;
  }

  public getConfig(): S3StorageConfig {
    return this.config;
  }

  /**
   * Generates an AWS Signature V4 pre-signed URL for PUT or GET operations.
   */
  public createPresignedUrl(params: {
    method: 'PUT' | 'GET';
    bucket: string;
    storageKey: string;
    expiresInSec?: number;
    usePublicEndpoint?: boolean;
  }): string {
    const expiresInSec = params.expiresInSec ?? 900;
    const baseEndpoint = params.usePublicEndpoint
      ? this.config.publicEndpoint
      : this.config.endpoint;
    const parsedUrl = new URL(baseEndpoint);
    const hostHeader = parsedUrl.host;
    const now = new Date();
    const { amzDate, dateStamp } = formatAmzDate(now);

    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const credential = `${this.config.accessKeyId}/${credentialScope}`;
    const canonicalUri = encodeS3URI(`/${params.bucket}/${params.storageKey.replace(/^\/+/, '')}`);

    const queryEntries: [string, string][] = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', credential],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(expiresInSec)],
      ['X-Amz-SignedHeaders', 'host'],
    ];

    queryEntries.sort(([a], [b]) => a.localeCompare(b));
    const canonicalQueryString = queryEntries
      .map(([k, v]) => `${encodeS3URI(k, true)}=${encodeS3URI(v, true)}`)
      .join('&');

    const canonicalHeaders = `host:${hostHeader}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      params.method,
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = deriveSigningKey(this.config.secretAccessKey, dateStamp, this.config.region);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign, 'utf8')
      .digest('hex');

    return `${baseEndpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }

  /**
   * Executes a signed S3 REST call against MinIO.
   */
  private async signedFetch(params: {
    method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
    path: string;
    body?: Uint8Array;
    headers?: Record<string, string>;
  }): Promise<Response> {
    const parsedBase = new URL(this.config.endpoint);
    const hostHeader = parsedBase.host;
    const now = new Date();
    const { amzDate, dateStamp } = formatAmzDate(now);
    const payloadHash = sha256Hex(params.body ?? new Uint8Array(0));
    const canonicalUri = encodeS3URI(params.path);

    const headersToSign: Record<string, string> = {
      host: hostHeader,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(params.headers ?? {}),
    };

    const sortedHeaderKeys = Object.keys(headersToSign)
      .map((k) => k.toLowerCase())
      .sort();

    const canonicalHeaders = sortedHeaderKeys
      .map((k) => `${k}:${(headersToSign[k] ?? '').trim()}\n`)
      .join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalRequest = [
      params.method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.config.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = deriveSigningKey(this.config.secretAccessKey, dateStamp, this.config.region);
    const signature = createHmac('sha256', signingKey)
      .update(stringToSign, 'utf8')
      .digest('hex');

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const requestHeaders: Record<string, string> = {
      ...headersToSign,
      Authorization: authorization,
    };
    delete requestHeaders['host'];

    return fetch(`${this.config.endpoint}${canonicalUri}`, {
      method: params.method,
      headers: requestHeaders,
      ...(params.body ? { body: params.body } : {}),
    });
  }

  public async ensureBucketExists(bucketName: string): Promise<void> {
    const headRes = await this.signedFetch({
      method: 'HEAD',
      path: `/${bucketName}`,
    });
    if (headRes.ok) {
      return;
    }
    const putRes = await this.signedFetch({
      method: 'PUT',
      path: `/${bucketName}`,
    });
    // 200 OK or 409 BucketAlreadyOwnedByYou
    if (!putRes.ok && putRes.status !== 409) {
      const text = await putRes.text();
      throw new ExternalProviderError(
        'MinIO',
        `Failed to create bucket ${bucketName}: HTTP ${putRes.status}`,
        text,
      );
    }
  }

  public async ensureAllBuckets(): Promise<void> {
    await Promise.all([
      this.ensureBucketExists(this.config.rawBucket),
      this.ensureBucketExists(this.config.derivativesBucket),
      this.ensureBucketExists(this.config.rendersBucket),
    ]);
  }

  public async putObject(params: {
    bucket: string;
    storageKey: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<{ etag: string | null; sizeBytes: number }> {
    await this.ensureBucketExists(params.bucket);
    const cleanKey = params.storageKey.replace(/^\/+/, '');
    const res = await this.signedFetch({
      method: 'PUT',
      path: `/${params.bucket}/${cleanKey}`,
      body: params.body,
      headers: {
        'content-type': params.contentType,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new ExternalProviderError(
        'MinIO',
        `Failed to upload object ${cleanKey}: HTTP ${res.status}`,
        errText,
      );
    }

    return {
      etag: res.headers.get('etag'),
      sizeBytes: params.body.byteLength,
    };
  }

  public async headObject(params: {
    bucket: string;
    storageKey: string;
  }): Promise<{ exists: boolean; sizeBytes: number; contentType: string | null }> {
    const cleanKey = params.storageKey.replace(/^\/+/, '');
    const res = await this.signedFetch({
      method: 'HEAD',
      path: `/${params.bucket}/${cleanKey}`,
    });

    if (res.status === 404) {
      return { exists: false, sizeBytes: 0, contentType: null };
    }
    if (!res.ok) {
      throw new ExternalProviderError(
        'MinIO',
        `HEAD object failed for ${cleanKey}: HTTP ${res.status}`,
      );
    }

    return {
      exists: true,
      sizeBytes: Number(res.headers.get('content-length') ?? 0),
      contentType: res.headers.get('content-type'),
    };
  }

  /**
   * Streams an object directly from MinIO without buffering into memory,
   * forwarding HTTP Range headers for 200 / 206 / 416 browser video seeking.
   */
  public async getObjectStream(params: {
    bucket: string;
    storageKey: string;
    range?: string | undefined;
  }): Promise<{
    status: number;
    contentType: string;
    contentLength: number | null;
    contentRange: string | null;
    acceptRanges: string;
    body: ReadableStream<Uint8Array> | null;
  }> {
    const cleanKey = params.storageKey.replace(/^\/+/, '');
    const res = await this.signedFetch({
      method: 'GET',
      path: `/${params.bucket}/${cleanKey}`,
      ...(params.range ? { headers: { range: params.range } } : {}),
    });

    const contentLengthHeader = res.headers.get('content-length');
    return {
      status: res.status,
      contentType: res.headers.get('content-type') ?? 'application/octet-stream',
      contentLength: contentLengthHeader !== null ? Number(contentLengthHeader) : null,
      contentRange: res.headers.get('content-range'),
      acceptRanges: res.headers.get('accept-ranges') ?? 'bytes',
      body: res.body as ReadableStream<Uint8Array> | null,
    };
  }

  public async getObjectHeaderBytes(params: {
    bucket: string;
    storageKey: string;
    byteCount?: number;
  }): Promise<Uint8Array> {
    const cleanKey = params.storageKey.replace(/^\/+/, '');
    const endByte = (params.byteCount ?? 64) - 1;
    const res = await this.signedFetch({
      method: 'GET',
      path: `/${params.bucket}/${cleanKey}`,
      headers: {
        range: `bytes=0-${endByte}`,
      },
    });

    if (!res.ok && res.status !== 206) {
      throw new ExternalProviderError(
        'MinIO',
        `Failed to read header bytes for ${cleanKey}: HTTP ${res.status}`,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  public async getObjectBuffer(params: {
    bucket: string;
    storageKey: string;
  }): Promise<Uint8Array> {
    const cleanKey = params.storageKey.replace(/^\/+/, '');
    const res = await this.signedFetch({
      method: 'GET',
      path: `/${params.bucket}/${cleanKey}`,
    });

    if (!res.ok) {
      throw new ExternalProviderError(
        'MinIO',
        `Failed to read object ${cleanKey}: HTTP ${res.status}`,
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  public async deleteObject(params: { bucket: string; storageKey: string }): Promise<void> {
    const cleanKey = params.storageKey.replace(/^\/+/, '');
    const res = await this.signedFetch({
      method: 'DELETE',
      path: `/${params.bucket}/${cleanKey}`,
    });

    if (!res.ok && res.status !== 204 && res.status !== 404) {
      throw new ExternalProviderError(
        'MinIO',
        `Failed to delete object ${cleanKey}: HTTP ${res.status}`,
      );
    }
  }
}
