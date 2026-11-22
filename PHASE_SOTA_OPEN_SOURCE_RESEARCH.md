# Phase SOTA — Deep Open-Source & Licence Audit

**Date**: 2026-11-22  
**Policy**: Zero AGPL/GPL/non-commercial/geographically restricted code or weights may be copied into the commercial SaaS codebase without explicit legal approval.

---

## 1. Repository Comparison & Licence Decision Matrix

| Repository | Capability | Architecture | Licence | Maintenance | Reuse Decision | Integration Recommendation |
|---|---|---|---|---|---|---|
| **OpenMontage** (`onlinedigitalproject/openmontage` / `calesthio/OpenMontage`) | Autonomous 12-pipeline director studio, 100+ tools, creative self-review | Agent skills + MCP tool orchestration over FFmpeg/Remotion | **GNU AGPL-3.0** | Active | **Architecture Inspiration Only** | **DO NOT COPY CODE.** Adopt the *Director Skills + Research -> Script -> Scene -> Self-Review -> Approval* pipeline pattern in our native TypeScript orchestrator. |
| **OpenChatCut** (`0xsline/OpenChatCut`) | Conversational multi-track timeline editor, MCP tools, Remotion rendering | Local-first React timeline + MCP server + Remotion | **AGPL-3.0-or-later** (dual commercial Pro) | Active | **Architecture Inspiration Only** | **DO NOT COPY CODE.** Adopt discrete timeline mutation tool-calls (trim, split, add overlay, undo/redo) against our `CompositionSpecSchema`. |
| **MakeMyClip Editor** (`MakeMyClip/editor`) | Transcript-driven editing, silence/pause cutting, local `whisper.cpp`, subtitle alignment | Transcript-to-cutlist + FFmpeg + FCPXML export | **MIT** | Active | **Safe to Reuse After Review** | Adapt MIT patterns for word-level cutlists, silence/retake detection, and SRT/VTT/ASS/FCPXML interoperability inside `packages/remotion-engine`. |
| **FireRed-OpenStoryline** (`FireRedTeam/FireRed-OpenStoryline`) | Agent-directed editorial planning, rhythm-aware cuts, human-in-the-loop Style Skills | LLM/VLM client + Storyline Middleware + MCP Server + Style Skills | **Apache-2.0** | Active | **Safe to Reuse After Review** | Adopt `Storyline Middleware` (stateful context summarization between agents) and structured JSON `Style Skills` inside our Brand Kit & Creative Director. |
| **Postiz** (`gitroomhq/postiz-app`) | Social scheduling, OAuth channels, campaign calendar, analytics | Next.js + NestJS + Temporal + Prisma + MCP | **GNU AGPL-3.0** | Very Active | **External API Adapter Only** | **DO NOT EMBED SOURCE.** Continue communicating solely via our clean HTTP `PostizAdapter` in `packages/integrations`. |
| **WhisperX** (`m-bain/whisperX`) | Fast batched Whisper STT + wav2vec2 word-level forced alignment + speaker diarization | Python CLI/service (`faster-whisper` + `wav2vec2` + optional `pyannote`) | **BSD-2-Clause** (code); `pyannote-audio` weights require separate commercial licence | Very Active | **Safe for Word Alignment (No Pyannote Without Commercial Licence)** | Run `faster-whisper` + `wav2vec2` word alignment in an optional isolated `media-worker` sidecar; gate `pyannote` diarization behind explicit commercial licence toggle. |
| **PySceneDetect** (`Breakthrough/PySceneDetect`) | Shot/scene boundary detection, content-aware & adaptive detectors | Python CLI / OpenCV | **BSD-3-Clause** | Active | **Safe to Reuse** | Integrate into `media-worker` for automatic `AssetScene` boundary extraction alongside FFmpeg `blackdetect`/`silencedetect`. |
| **Wan2.1** (`Wan-Video/Wan2.1`) | Open-weight Text-to-Video & Image-to-Video (1.3B / 14B) | Diffusion Transformer (DiT) | **Apache-2.0** | Active | **Safe (Hosted GPU / External Inference)** | Support via provider-independent `VideoGenProvider` adapter (Fal/Replicate/self-hosted GPU worker); do not bundle multi-GB weights into local CPU Docker images. |
| **LTX-Video** (`Lightricks/LTX-Video`) | Real-time fast Text-to-Video & Image-to-Video | DiT | **Apache-2.0** (code) / **LTX Community License** (< \$10M annual revenue free) | Active | **Requires Legal Check Above \$10M Revenue** | Integrate strictly behind optional hosted provider adapter with provenance tracking. |
| **HunyuanVideo** (`Tencent-Hunyuan/HunyuanVideo`) | High-fidelity open-weight T2V | DiT | **Tencent Hunyuan Community License** (excludes EU, UK, South Korea; < 100M MAU) | Active | **Unsuitable for Global Commercial SaaS** | **DO NOT DEPLOY** as default model due to EU/UK/South Korea territorial exclusion. |
| **CogVideoX** (`zai-org/CogVideo`) | Open-weight T2V/I2V (2B / 5B) | DiT | **Apache-2.0** (code & 2B); custom restricted terms on 5B weights | Active | **2B Safe; 5B Requires Legal Approval** | Prefer hosted Gemini Omni / Wan2.1 (`Apache-2.0`) over 5B checkpoints. |

---

## 2. Key Architectural Takeaways

1. **Zero AGPL Contamination**: Keep `OpenMontage`, `OpenChatCut`, and `Postiz` strictly as architectural references / external HTTP APIs.
2. **Permissive Core Stack**: Pair our existing TypeScript/Fastify/Remotion/FFmpeg stack with MIT/Apache-2.0/BSD-3-Clause patterns (`FireRed-OpenStoryline` Style Skills & middleware, `MakeMyClip` transcript-driven cutlists, `PySceneDetect` shot boundaries, FFmpeg `silencedetect`/`blackdetect`/`ebur128`, `Wan2.1` / Gemini Omni via adapter).
3. **Deterministic JSON AST Over Code Gen**: All top open-source agents converge on structured timeline JSON + deterministic FFmpeg/Remotion rendering rather than executing raw LLM-generated React/Python code.
