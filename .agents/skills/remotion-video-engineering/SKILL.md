---
name: remotion-video-engineering
description: >-
  Use this skill when building or modifying the Remotion composition compiler,
  reusable video design system components, platform templates, partial scene
  editing logic, or isolated headless video rendering workers.
---

# Remotion Video Engineering Skill

## Responsibilities
- Maintain `packages/remotion-engine`, including the declarative `CompositionSpec` JSON AST, schema validator, versioned diff/patch engine, and React/Remotion component compiler.
- Build and maintain the 16 reusable motion design primitives and 9 platform composition templates (Reels, TikTok, Shorts, YouTube 16:9, LinkedIn, Podcast Clips, Product Demos, Explainers, Promos).
- Execute isolated rendering jobs in `rendering-worker` and extract inspection frames for QA analysis.

## Technical Standards
1. All AI edits must target the structured `CompositionSpec` JSON AST (`scenes`, `tracks`, `elements`, `captions`, `transitions`, `brandOverrides`, `audio`), creating a new immutable `CompositionVersion` supporting undo/redo.
2. Integrate design principles adapted from `IBM/chuk-motion`, `Remocn/remocn`, `instincthub/remotion-create-video`, and `haidrrrry/claude-remotion-skill` (spring physics, word-synchronized captions, safe-zone margins, dynamic lower thirds, kinetic typography).
3. Support multiple aspect ratios (`9:16` 1080x1920, `16:9` 1920x1080, `1:1` 1080x1080, `4:5` 1080x1350) at 30/60 fps.

## Implementation Workflow
1. Validate any `CompositionSpec` mutation against `CompositionSpecSchema` in `packages/shared`.
2. Compile the JSON spec into deterministic Remotion `<Sequence>` and `<AbsoluteFill>` trees.
3. Render preview stills or MP4 output and run automated visual frame QA checks.

## Validation Requirements
- Unit tests verify AST validation, partial scene patching, and undo/redo version restoration.
- Headless render tests confirm valid frame and MP4 generation without overflow or blank frames.
