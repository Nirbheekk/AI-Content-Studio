import { describe, expect, it } from 'vitest';
import { CompositionSpecSchema } from '@ai-content-os/shared';
import { checkDatabaseHealth, prisma } from '../client.js';
import { decryptSecret } from '../encryption.js';

describe('@ai-content-os/database PostgreSQL integration', () => {
  it('connects to PostgreSQL 16 and reports healthy latency', async () => {
    const health = await checkDatabaseHealth(prisma);
    expect(health.status).toBe('healthy');
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('verifies seeded workspace, brand kit, composition version, and encrypted Postiz account', async () => {
    const workspace = await prisma.workspace.findUnique({
      where: { slug: 'ai-content-studio-hq' },
      include: {
        brandKit: true,
        projects: true,
        compositions: {
          include: {
            versions: true,
          },
        },
        socialAccounts: true,
      },
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.brandKit?.primaryColor).toBe('#6366F1');
    expect(workspace?.projects.length).toBeGreaterThanOrEqual(1);
    expect(workspace?.compositions.length).toBeGreaterThanOrEqual(1);

    const firstComp = workspace?.compositions[0];
    const firstVersion = firstComp?.versions[0];
    expect(firstVersion).toBeDefined();
    const parsedSpec = CompositionSpecSchema.parse(firstVersion?.specJson);
    expect(parsedSpec.templateId).toBe('instagram-reel');
    expect(parsedSpec.scenes).toHaveLength(3);

    const socialAccount = workspace?.socialAccounts[0];
    expect(socialAccount).toBeDefined();
    const decryptedToken = decryptSecret(socialAccount!.encryptedAccessToken);
    expect(decryptedToken).toBe('postiz_simulated_oauth_access_token_demo');
  });
});
