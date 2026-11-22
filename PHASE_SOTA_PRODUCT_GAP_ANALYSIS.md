# Phase SOTA — Product Gap Analysis

**Date**: 2026-11-22  
**Baseline**: Commit `66d6c63` (`main`)

| Domain | Current State (`66d6c63`) | SOTA Target State | Priority | Stage |
|---|---|---|---|---|
| **Bulk Folder Ingestion** | Multi-file upload, SHA-256 dedup, magic-byte MIME check | Nested folder tree upload (`webkitdirectory`), resumable chunked upload, async BullMQ thumbnails/contact-sheets/silence/scene extraction | **P0** | Stage 2 |
| **Rights & Provenance** | Not modeled in Prisma | `MediaRightsRecord` table (source, licence, commercial permission, consent proof, expiry) + hard publish gate | **P0** | Stage 2 |
| **Cost & Budget Intelligence** | Post-hoc `UsageRecord` logging | Pre-flight cost estimator + configurable workspace/project budget caps blocking runaway loops | **P0** | Stage 2 |
| **Semantic Media Search** | Filename substring search (`contains`) | Timestamped semantic search over `Transcript` + `AssetScene` + optional `pgvector` embeddings with instant clip preview | **P1** | Stage 3 |
| **Anti-Slop Editorial Engine** | Single-shot brief -> script -> composition | 3 ranked editorial concepts + explainable 10-dimension Editorial Quality Score + human script approval before render | **P1** | Stage 3 |
| **Professional Shorts Factory** | Brag FFmpeg render + ASS `\kf` karaoke + YouTube split-screen clipper | Silence/retake removal, transcript-driven cutting, 7 reusable caption presets, smart speaker reframing, Remotion motion-graphics kit | **P1** | Stage 4 |
| **Generative Video (T2V/I2V)** | `video-gen.ts` + `gemini-studio.ts` adapters | Scene-level T2V/I2V/V2V job contract, provider routing (Gemini Omni / Wan2.1 / LTX hosted), strict provenance & honest unavailability | **P2** | Stage 5 |
| **Human & Client Approval** | Internal workspace approval + frame comments | Revocable external Client Review Links, multi-stage `Internal Review -> Client Review -> Approved`, subtitle correction, targeted scene re-render | **P1** | Stage 6 |
| **Autonomous Campaign Factory** | Single-video Repurpose wave | Multi-day `Campaign` orchestrator (themes -> pillars -> scripts -> clips -> thumbnails -> calendar -> approval -> publish) | **P2** | Stage 7 |
| **Automated Signal QA** | Composition AST check + `ffprobe` codec/pixel check | Real FFmpeg `blackdetect`, `freezedetect`, `silencedetect`, `ebur128` loudness + Brand Compliance Agent checks with timestamped evidence | **P1** | Stage 8 |
