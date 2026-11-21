# AI & Infrastructure Cost Model (`AI_COST_MODEL.md`)

All figures below are **estimates** based on typical 30-second short-form video workloads and standard published unit rates. Actual costs depend on configured providers and prompt/asset lengths.

## Unit Cost Assumptions
- **LLM Orchestration (7 Agents, ~12k prompt + 4k completion tokens/video):**
  - Gemini Flash / GPT-4o-mini class: ~\$0.008–\$0.025 per video
  - Claude Sonnet / GPT-4o class: ~\$0.08–\$0.15 per video
  - Simulated fallback (`GEMINI_API_KEY` etc. unset): **\$0.00**
- **Speech-to-Text (Whisper, 1 min source audio):** ~\$0.006 / minute
- **Text-to-Speech (ElevenLabs, ~450 chars / 30s voiceover):** ~\$0.04–\$0.10 per video (plan-dependent)
- **Image Generation (1–2 thumbnails/frames):** ~\$0.04–\$0.08 per video (when enabled)
- **Video Rendering Compute (Staging 4 vCPU / 8 GB VPS, ~10–25s FFmpeg render):** Fixed VPS cost (~\$40–\$55/mo)
- **Storage & Bandwidth (MinIO on NVMe / S3):** ~15 MB per rendered 30s 1080p MP4 + raw uploads (~\$0.02/GB/mo on S3/Spaces)

## Illustrative Cost Summary (Blended Live AI Providers + Staging VPS)

| Cost Component | 1 Short Video | 10 Short Videos | 100 Short Videos |
|---|---|---|---|
| AI LLM (7-agent pipeline) | \$0.02 | \$0.20 | \$2.00 |
| Speech-to-Text (Whisper) | \$0.01 | \$0.06 | \$0.60 |
| Text-to-Speech (ElevenLabs) | \$0.06 | \$0.60 | \$6.00 |
| Image Generation (optional) | \$0.04 | \$0.40 | \$4.00 |
| **Total Variable AI Cost** | **~\$0.13** | **~\$1.26** | **~\$12.60** |
| Staging Compute + Storage (Fixed) | \$40–\$55/mo | \$40–\$55/mo | \$40–\$55/mo |
