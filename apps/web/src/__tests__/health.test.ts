import { describe, expect, it } from 'vitest';
import { GET } from '../app/api/health/route.js';

describe('@ai-content-os/web health route', () => {
  it('returns healthy JSON response from Next.js API health handler', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean; status: string };
    expect(body.success).toBe(true);
    expect(body.status).toBe('healthy');
  });
});
