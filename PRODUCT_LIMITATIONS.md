# Product Limitations & Disclosures (`PRODUCT_LIMITATIONS.md`)

1. **External AI Keys Required for Live Intelligence:** Without `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `ELEVENLABS_API_KEY`, AI agents transparently run in `simulated-dev-fallback` mode and label all responses `[SIMULATED]`.
2. **Postiz Social Publishing Sandbox:** Without `POSTIZ_API_URL` and `POSTIZ_API_KEY`, social publishing runs in `[SIMULATED POSTIZ SANDBOX]` mode and does not post to live social networks.
3. **Social Analytics Availability:** Without live connected provider accounts, automatic analytics collection records `UNAVAILABLE` with explicit reasons and never fabricates metrics; CSV/JSON manual import (`MANUAL_IMPORT`) is supported.
4. **FFmpeg Render Composition:** Current `renderCompositionMp4` renders brand colors, accent bars, headlines, captions, and AAC audio cleanly at exact aspect ratios; full multi-layer user B-roll/image compositing and voiceover audio ducking require extending the FFmpeg filtergraph.
5. **Draft Billing Invoices:** Generated invoices are `costKind: 'ESTIMATED'` (`status: 'DRAFT'`) until a payment processor (e.g. Stripe) is connected.
