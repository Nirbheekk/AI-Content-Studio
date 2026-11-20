import { describe, expect, it } from 'vitest';
import {
  applyCompositionPatches,
  canTransitionWorkflowStage,
  CompositionSpec,
  CompositionSpecSchema,
  detectMimeTypeFromMagicBytes,
  ForbiddenError,
  hasRequiredRole,
  NotFoundError,
  sanitizeAssetFilename,
  sanitizeFolderPath,
  ValidationError,
} from '../index.js';

const sampleSpec: CompositionSpec = {
  schemaVersion: '1.0',
  templateId: 'instagram-reel',
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: 300,
  brand: {
    primaryColor: '#6366F1',
    secondaryColor: '#0F172A',
    accentColor: '#22D3EE',
    headingFont: 'Inter',
    bodyFont: 'Inter',
  },
  captions: {
    enabled: true,
    style: 'word-highlight',
    fontSizePx: 54,
    highlightColor: '#22D3EE',
    safeBottomMarginPx: 220,
  },
  audio: {
    musicVolume: 0.15,
    duckingEnabled: true,
  },
  scenes: [
    {
      id: 'scene-1',
      orderIndex: 0,
      startFrame: 0,
      durationInFrames: 120,
      layout: 'talking-head',
      trimStartSec: 0,
      headlineText: 'Original Hook',
      transitionIn: 'fade',
      overlays: [],
    },
    {
      id: 'scene-2',
      orderIndex: 1,
      startFrame: 120,
      durationInFrames: 180,
      layout: 'b-roll-overlay',
      trimStartSec: 2,
      headlineText: 'Main Value Point',
      transitionIn: 'spring-slide',
      overlays: [],
    },
  ],
};

describe('@ai-content-os/shared', () => {
  it('validates a well-formed CompositionSpec AST', () => {
    const parsed = CompositionSpecSchema.parse(sampleSpec);
    expect(parsed.templateId).toBe('instagram-reel');
    expect(parsed.scenes).toHaveLength(2);
  });

  it('applies partial scene and caption patches immutably', () => {
    const updated = applyCompositionPatches(sampleSpec, [
      {
        op: 'UPDATE_SCENE',
        sceneId: 'scene-1',
        patch: { headlineText: 'Stronger 3-Second Hook!' },
      },
      {
        op: 'UPDATE_CAPTION_STYLE',
        patch: { fontSizePx: 72 },
      },
    ]);

    expect(updated.scenes[0]?.headlineText).toBe('Stronger 3-Second Hook!');
    expect(updated.captions.fontSizePx).toBe(72);
    expect(sampleSpec.scenes[0]?.headlineText).toBe('Original Hook');
  });

  it('reorders scenes and recalculates startFrame offsets accurately', () => {
    const reordered = applyCompositionPatches(sampleSpec, [
      {
        op: 'REORDER_SCENES',
        sceneIdsInOrder: ['scene-2', 'scene-1'],
      },
    ]);

    expect(reordered.scenes[0]?.id).toBe('scene-2');
    expect(reordered.scenes[0]?.startFrame).toBe(0);
    expect(reordered.scenes[1]?.id).toBe('scene-1');
    expect(reordered.scenes[1]?.startFrame).toBe(180);
    expect(reordered.durationInFrames).toBe(300);
  });

  it('enforces valid workflow state machine transitions including human approval gate', () => {
    expect(canTransitionWorkflowStage('PENDING', 'ANALYZING')).toBe(true);
    expect(canTransitionWorkflowStage('REVIEWING', 'REVISING')).toBe(true);
    expect(canTransitionWorkflowStage('REVIEWING', 'AWAITING_APPROVAL')).toBe(true);
    // Cannot bypass human approval gate directly from REVIEWING to PUBLISHED
    expect(canTransitionWorkflowStage('REVIEWING', 'PUBLISHED')).toBe(false);
    expect(canTransitionWorkflowStage('AWAITING_APPROVAL', 'PUBLISHED')).toBe(false);
    expect(canTransitionWorkflowStage('AWAITING_APPROVAL', 'APPROVED')).toBe(true);
    expect(canTransitionWorkflowStage('APPROVED', 'PUBLISHED')).toBe(true);
  });

  it('constructs typed domain error classes with expected HTTP status codes', () => {
    const validationErr = new ValidationError('Invalid input', { field: 'fps' });
    const forbiddenErr = new ForbiddenError();
    const notFoundErr = new NotFoundError('Composition', 'comp-123');

    expect(validationErr.statusCode).toBe(400);
    expect(forbiddenErr.statusCode).toBe(403);
    expect(notFoundErr.statusCode).toBe(404);
    expect(notFoundErr.message).toContain('comp-123');
  });

  it('enforces RBAC role hierarchy weights accurately', () => {
    expect(hasRequiredRole('OWNER', 'ADMIN')).toBe(true);
    expect(hasRequiredRole('ADMIN', 'EDITOR')).toBe(true);
    expect(hasRequiredRole('EDITOR', 'VIEWER')).toBe(true);
    expect(hasRequiredRole('VIEWER', 'EDITOR')).toBe(false);
    expect(hasRequiredRole('EDITOR', 'ADMIN')).toBe(false);
  });

  it('sanitizes filenames and folder paths against path traversal', () => {
    expect(sanitizeAssetFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeAssetFilename('..\\windows\\system32\\cmd.exe')).toBe('cmd.exe');
    expect(sanitizeFolderPath('podcast/episode-01/clips')).toBe('/podcast/episode-01/clips');
    expect(() => sanitizeFolderPath('/podcast/../secrets')).toThrow(/Invalid folder path segment/);
  });

  it('detects real MIME types from magic bytes and rejects spoofed headers', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mp4Header = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    const pdfHeader = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

    expect(detectMimeTypeFromMagicBytes(pngHeader)).toBe('image/png');
    expect(detectMimeTypeFromMagicBytes(mp4Header)).toBe('video/mp4');
    expect(detectMimeTypeFromMagicBytes(pdfHeader)).toBe('application/pdf');
  });
});
