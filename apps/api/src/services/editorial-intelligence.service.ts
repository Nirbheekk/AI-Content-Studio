import { randomUUID } from 'node:crypto';
import {
  EditorialQualityRubric,
  EditorialScriptSection,
  GenerateEditorialPlanRequest,
  HighlightCandidate,
  HighlightDiscoveryRequest,
  NotFoundError,
  SemanticMediaSearchHit,
  SemanticMediaSearchRequest,
  UpdateEditorialConceptRequest,
} from '@ai-content-os/shared';
import { Prisma, prisma } from '@ai-content-os/database';
import { buildAssetStreamUrl } from '../lib/media-token.js';
import { estimateWorkflowPreflightCost } from './cost-estimator.service.js';

interface TranscriptSegmentLike {
  startSec?: number;
  endSec?: number;
  start?: number;
  end?: number;
  text?: string;
  speaker?: string;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'it', 'where', 'when', 'how',
  'what', 'about', 'from', 'into', 'our', 'your', 'their', 'they', 'we', 'you', 'i',
]);

function toJson(val: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(val)) as Prisma.InputJsonValue;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function buildCharTrigrams(text: string): Map<string, number> {
  const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const map = new Map<string, number>();
  for (let i = 0; i <= clean.length - 3; i++) {
    const gram = clean.slice(i, i + 3);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const [k, v] of a.entries()) {
    normA += v * v;
    const bv = b.get(k);
    if (bv) dot += v * bv;
  }
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministic hybrid similarity score combining exact phrase match,
 * keyword recall, and character trigram cosine similarity (semantic stem/fuzzy match).
 */
export function computeHybridSimilarity(query: string, candidateText: string): {
  score: number;
  matchedTerms: string[];
  exactPhrase: boolean;
} {
  const qNorm = query.toLowerCase().trim();
  const cNorm = candidateText.toLowerCase().trim();
  if (!qNorm || !cNorm) {
    return { score: 0, matchedTerms: [], exactPhrase: false };
  }

  const exactPhrase = cNorm.includes(qNorm);
  const qTokens = Array.from(new Set(tokenize(qNorm)));
  const cTokens = new Set(tokenize(cNorm));
  const matchedTerms = qTokens.filter((t) => cTokens.has(t) || cNorm.includes(t));
  const keywordRecall = qTokens.length > 0 ? matchedTerms.length / qTokens.length : 0;
  const trigramSim = cosineSimilarity(buildCharTrigrams(qNorm), buildCharTrigrams(cNorm));

  const raw = (exactPhrase ? 0.45 : 0) + keywordRecall * 0.45 + trigramSim * 0.35;
  return {
    score: Math.min(0.99, Math.round(raw * 1000) / 1000),
    matchedTerms,
    exactPhrase,
  };
}

function extractSegments(raw: unknown): Array<{ startSec: number; endSec: number; text: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ startSec: number; endSec: number; text: string }> = [];
  for (const item of raw) {
    const seg = item as TranscriptSegmentLike;
    const text = typeof seg.text === 'string' ? seg.text.trim() : '';
    if (!text) continue;
    const startSec = Number(seg.startSec ?? seg.start ?? 0);
    const endSec = Number(seg.endSec ?? seg.end ?? startSec + 4);
    out.push({
      startSec: Math.max(0, startSec),
      endSec: Math.max(startSec + 0.5, endSec),
      text,
    });
  }
  return out;
}

export async function searchWorkspaceMediaMoments(params: {
  workspaceId: string;
  userId: string;
  input: SemanticMediaSearchRequest;
}): Promise<SemanticMediaSearchHit[]> {
  const { workspaceId, userId, input } = params;

  const assets = await prisma.asset.findMany({
    where: {
      workspaceId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.folderPath ? { folderPath: { startsWith: input.folderPath } } : {}),
      ...(input.assetType ? { assetType: input.assetType } : {}),
    },
    include: {
      transcript: true,
      scenes: { orderBy: { sceneIndex: 'asc' } },
      rightsRecord: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  });

  const hits: SemanticMediaSearchHit[] = [];

  for (const asset of assets) {
    const streamUrl = buildAssetStreamUrl({ userId, workspaceId, assetId: asset.id });
    const rightsStatus = asset.rightsRecord?.status ?? 'UNKNOWN';
    const transcriptSegments = asset.transcript
      ? extractSegments(asset.transcript.segmentsJson)
      : [];

    // 1. Score scene-level moments (visual description + overlapping transcript)
    for (const scene of asset.scenes) {
      const durationSec = Math.max(0.5, scene.endSec - scene.startSec);
      if (input.minDurationSec !== undefined && durationSec < input.minDurationSec) continue;
      if (input.maxDurationSec !== undefined && durationSec > input.maxDurationSec) continue;

      const overlappingSpeech = transcriptSegments
        .filter((s) => s.endSec >= scene.startSec && s.startSec <= scene.endSec)
        .map((s) => s.text)
        .join(' ');
      const visualText = scene.description ?? '';
      const combined = `${visualText} ${overlappingSpeech} ${asset.originalName} ${asset.tags.join(' ')}`;
      const sim = computeHybridSimilarity(input.query, combined);

      if (sim.score >= 0.18 && (sim.matchedTerms.length > 0 || sim.exactPhrase || sim.score >= 0.35)) {
        hits.push({
          hitId: `scene-${scene.id}`,
          assetId: asset.id,
          fileName: asset.originalName,
          assetType: asset.assetType,
          folderPath: asset.folderPath,
          streamUrl,
          startSec: scene.startSec,
          endSec: scene.endSec,
          durationSec: Math.round(durationSec * 100) / 100,
          matchingTranscript: overlappingSpeech || asset.transcript?.correctedText || asset.transcript?.fullText?.slice(0, 200) || '',
          visualDescription: visualText || asset.aiSummary || 'Visual scene indexed from source asset',
          matchExplanation: sim.exactPhrase
            ? `Exact phrase match in scene #${scene.sceneIndex + 1}`
            : `Matched terms [${sim.matchedTerms.slice(0, 5).join(', ')}] across transcript & visual scene #${scene.sceneIndex + 1}`,
          confidence: sim.score,
          rightsStatus,
        });
      }
    }

    // 2. Score transcript segments if asset had no scene hit
    if (transcriptSegments.length > 0) {
      for (let i = 0; i < transcriptSegments.length; i++) {
        const seg = transcriptSegments[i];
        if (!seg) continue;
        const durationSec = Math.max(0.5, seg.endSec - seg.startSec);
        if (input.minDurationSec !== undefined && durationSec < input.minDurationSec) continue;
        if (input.maxDurationSec !== undefined && durationSec > input.maxDurationSec) continue;

        const sim = computeHybridSimilarity(input.query, seg.text);
        if (sim.score >= 0.22 && (sim.matchedTerms.length > 0 || sim.exactPhrase)) {
          const alreadyCovered = hits.some(
            (h) => h.assetId === asset.id && Math.abs(h.startSec - seg.startSec) < 3,
          );
          if (!alreadyCovered) {
            hits.push({
              hitId: `seg-${asset.id}-${i}`,
              assetId: asset.id,
              fileName: asset.originalName,
              assetType: asset.assetType,
              folderPath: asset.folderPath,
              streamUrl,
              startSec: seg.startSec,
              endSec: seg.endSec,
              durationSec: Math.round(durationSec * 100) / 100,
              matchingTranscript: seg.text,
              visualDescription: asset.aiSummary ?? 'Spoken transcript segment',
              matchExplanation: sim.exactPhrase
                ? 'Exact phrase match in spoken transcript'
                : `Transcript semantic match on [${sim.matchedTerms.slice(0, 5).join(', ')}]`,
              confidence: sim.score,
              rightsStatus,
            });
          }
        }
      }
    } else if (asset.aiSummary || asset.transcript?.correctedText || asset.transcript?.fullText) {
      // 3. Fallback asset-level summary/corrected transcript search
      const fullText = `${asset.transcript?.correctedText ?? asset.transcript?.fullText ?? ''} ${asset.aiSummary ?? ''} ${asset.originalName} ${asset.tags.join(' ')}`;
      const sim = computeHybridSimilarity(input.query, fullText);
      if (sim.score >= 0.2 && (sim.matchedTerms.length > 0 || sim.exactPhrase)) {
        const dur = asset.durationSec ?? 15;
        hits.push({
          hitId: `asset-${asset.id}`,
          assetId: asset.id,
          fileName: asset.originalName,
          assetType: asset.assetType,
          folderPath: asset.folderPath,
          streamUrl,
          startSec: 0,
          endSec: dur,
          durationSec: dur,
          matchingTranscript: (asset.transcript?.correctedText ?? asset.transcript?.fullText ?? '').slice(0, 240),
          visualDescription: asset.aiSummary ?? 'Asset metadata & summary match',
          matchExplanation: `Matched [${sim.matchedTerms.slice(0, 5).join(', ')}] in asset summary/transcript`,
          confidence: sim.score,
          rightsStatus,
        });
      }
    }
  }

  return hits
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, input.limit);
}

const INSIGHT_RE = /\b(because|different|saves?|minutes?|hours?|problem|solution|pricing|cost|built|why|how|first|never|always|result|proof|demo|feature)\b/gi;
const DEMO_RE = /\b(click|screen|product|demo|dashboard|workflow|app|button|watch|look|here|shows?)\b/gi;
const QUESTION_RE = /\?|^(why|how|what if|ever wondered)/i;

export async function discoverAssetHighlights(params: {
  workspaceId: string;
  userId: string;
  input: HighlightDiscoveryRequest;
}): Promise<HighlightCandidate[]> {
  const { workspaceId, userId, input } = params;

  const assets = await prisma.asset.findMany({
    where: {
      workspaceId,
      ...(input.assetId ? { id: input.assetId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      assetType: { in: ['VIDEO', 'AUDIO'] },
    },
    include: {
      transcript: true,
      scenes: { orderBy: { sceneIndex: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });

  const candidates: HighlightCandidate[] = [];

  for (const asset of assets) {
    const streamUrl = buildAssetStreamUrl({ userId, workspaceId, assetId: asset.id });
    const segments = asset.transcript ? extractSegments(asset.transcript.segmentsJson) : [];

    if (segments.length > 0) {
      for (let i = 0; i < segments.length; i++) {
        const firstSeg = segments[i];
        if (!firstSeg) continue;
        // Group complete thoughts up to targetDurationSec without cutting mid-segment
        let endIdx = i;
        while (
          endIdx + 1 < segments.length &&
          (segments[endIdx + 1]!.endSec - firstSeg.startSec) <= input.targetDurationSec
        ) {
          endIdx += 1;
        }
        const lastSeg = segments[endIdx]!;
        const groupText = segments.slice(i, endIdx + 1).map((s) => s.text).join(' ').trim();
        const wordCount = groupText.split(/\s+/).filter(Boolean).length;
        if (wordCount < 6) continue;

        const contextBefore = i > 0 ? (segments[i - 1]?.text ?? '') : '';
        const contextAfter = endIdx + 1 < segments.length ? (segments[endIdx + 1]?.text ?? '') : '';
        const insightHits = (groupText.match(INSIGHT_RE) ?? []).length;
        const demoHits = (groupText.match(DEMO_RE) ?? []).length;
        const hasQuestion = QUESTION_RE.test(groupText);
        const focusBonus = input.focusTopic
          ? computeHybridSimilarity(input.focusTopic, groupText).score * 30
          : 0;

        const matchingScene = asset.scenes.find(
          (sc) => sc.endSec >= firstSeg.startSec && sc.startSec <= lastSeg.endSec,
        );
        const visualBonus = matchingScene?.hookScore ? matchingScene.hookScore * 0.15 : 5;
        const relevanceScore = Math.min(
          98,
          Math.max(45, Math.round(48 + insightHits * 8 + demoHits * 6 + (hasQuestion ? 8 : 0) + focusBonus + visualBonus)),
        );

        const category: HighlightCandidate['category'] =
          demoHits >= 2
            ? 'PRODUCT_DEMO'
            : hasQuestion
              ? 'QA_INSIGHT'
              : insightHits >= 2
                ? 'EXPLANATION'
                : 'STRONG_STATEMENT';

        const firstSentence = groupText.split(/[.!?]/)[0]?.trim() || groupText.slice(0, 72);
        candidates.push({
          highlightId: `hl-${asset.id}-${i}`,
          assetId: asset.id,
          fileName: asset.originalName,
          streamUrl,
          startSec: firstSeg.startSec,
          endSec: lastSeg.endSec,
          durationSec: Math.max(1, Math.round((lastSeg.endSec - firstSeg.startSec) * 100) / 100),
          transcript: groupText,
          contextBefore,
          contextAfter,
          suggestedHook: firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence,
          category,
          relevanceScore,
          editorialRationale: `Complete ${wordCount}-word thought (${category.replace(/_/g, ' ').toLowerCase()}) with ${insightHits} value signals and preserved before/after context.`,
          supportingVisualEvidence:
            matchingScene?.description ?? asset.aiSummary ?? 'Continuous speaker/product footage.',
          confidence: Math.min(0.95, Math.round((relevanceScore / 100) * 100) / 100),
          editingRequirements: [
            'Preserve full opening sentence without mid-word cut',
            'Add synchronized word-level captions in safe vertical zone',
            ...(demoHits > 0 ? ['Punch in 1.1x on product demonstration beat'] : []),
          ],
        });
      }
    } else if (asset.scenes.length > 0) {
      for (const sc of asset.scenes) {
        const dur = Math.max(1, sc.endSec - sc.startSec);
        candidates.push({
          highlightId: `hl-sc-${sc.id}`,
          assetId: asset.id,
          fileName: asset.originalName,
          streamUrl,
          startSec: sc.startSec,
          endSec: sc.endSec,
          durationSec: Math.round(dur * 100) / 100,
          transcript: asset.transcript?.correctedText ?? asset.transcript?.fullText ?? '',
          contextBefore: '',
          contextAfter: '',
          suggestedHook: (sc.description ?? asset.originalName).slice(0, 80),
          category: sc.isBroll ? 'PRODUCT_DEMO' : 'STRONG_STATEMENT',
          relevanceScore: Math.min(95, Math.max(50, Math.round(sc.hookScore ?? 72))),
          editorialRationale: `Visual scene #${sc.sceneIndex + 1} selected from indexed scene boundaries.`,
          supportingVisualEvidence: sc.description ?? 'Indexed visual scene',
          confidence: 0.72,
          editingRequirements: ['Verify spoken context before final cut'],
        });
      }
    }
  }

  candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Deduplicate overlapping windows within the same asset
  const selected: HighlightCandidate[] = [];
  for (const c of candidates) {
    const overlaps = selected.some(
      (s) => s.assetId === c.assetId && Math.abs(s.startSec - c.startSec) < Math.max(8, input.targetDurationSec * 0.5),
    );
    if (!overlaps) selected.push(c);
    if (selected.length >= input.maxHighlights) break;
  }

  return selected;
}

export function scoreEditorialConcept(params: {
  hook: string;
  brief: string;
  scriptSections: EditorialScriptSection[];
  hasBrandKit: boolean;
  cta: string;
}): EditorialQualityRubric {
  const hasDirectQuote = params.scriptSections.some((s) => s.provenance === 'DIRECT_QUOTE' && s.sourceAssetId);
  const allText = params.scriptSections.map((s) => s.text).join(' ');
  const uniqueWords = new Set(tokenize(allText)).size;
  const totalWords = Math.max(1, tokenize(allText).length);
  const nonRepetition = Math.min(98, Math.round((uniqueWords / totalWords) * 100));

  const hookClarity = params.hook.length >= 15 && params.hook.length <= 110 ? 88 : 72;
  const topicRelevance = Math.min(
    96,
    Math.max(60, Math.round(55 + computeHybridSimilarity(params.brief, allText).score * 50)),
  );
  const narrativeCompleteness = params.scriptSections.length >= 3 ? 90 : 70;
  const specificity = /\d+|minute|hour|second|cost|save|step|proof/i.test(allText) ? 88 : 74;
  const contextPreservation = hasDirectQuote ? 92 : 76;
  const evidenceSupport = hasDirectQuote ? 94 : 62;
  const pacingPotential = 86;
  const visualSupport = params.scriptSections.every((s) => s.visualDirection.length > 5) ? 88 : 72;
  const brandAlignment = params.hasBrandKit ? 90 : 75;
  const ctaRelevance = params.cta.trim().length >= 5 ? 88 : 68;

  const overallScore = Math.round(
    (hookClarity +
      topicRelevance +
      narrativeCompleteness +
      specificity +
      nonRepetition +
      contextPreservation +
      evidenceSupport +
      pacingPotential +
      visualSupport +
      brandAlignment +
      ctaRelevance) /
      11,
  );

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];

  if (hasDirectQuote) strengths.push('Grounded in verbatim timestamped source footage (no fabricated quotes).');
  else {
    weaknesses.push('No direct recorded quote matched; relies on AI-written narration.');
    improvements.push('Upload and transcribe raw founder/product clips to anchor claims in real footage.');
  }
  if (hookClarity >= 85) strengths.push('Concise, specific opening hook without sensational clickbait.');
  if (nonRepetition < 70) {
    weaknesses.push('Some phrasing repeats across script sections.');
    improvements.push('Tighten body copy to introduce one distinct proof point per beat.');
  }

  return {
    hookClarity,
    topicRelevance,
    narrativeCompleteness,
    specificity,
    nonRepetition,
    contextPreservation,
    evidenceSupport,
    pacingPotential,
    visualSupport,
    brandAlignment,
    ctaRelevance,
    overallScore,
    note: 'Editorial guidance score only — does not predict virality.',
    strengths,
    weaknesses,
    improvements,
  };
}

export async function generateEditorialPlan(params: {
  workspaceId: string;
  userId: string;
  input: GenerateEditorialPlanRequest;
}) {
  const { workspaceId, userId, input } = params;

  const project = await prisma.project.findFirst({
    where: { id: input.projectId, workspaceId },
    include: { workspace: { include: { brandKit: true } } },
  });
  if (!project) {
    throw new NotFoundError('Project', input.projectId);
  }

  const [searchHits, highlights, costEstimate] = await Promise.all([
    searchWorkspaceMediaMoments({
      workspaceId,
      userId,
      input: { query: input.brief, projectId: project.id, limit: 8 },
    }),
    discoverAssetHighlights({
      workspaceId,
      userId,
      input: {
        projectId: project.id,
        targetDurationSec: input.targetDurationSec,
        maxHighlights: 6,
        focusTopic: input.brief,
      },
    }),
    estimateWorkflowPreflightCost({
      workspaceId,
      projectId: project.id,
      operations: [
        { operation: 'LLM_GENERATION', provider: 'google-gemini', model: 'gemini-2.5-flash', quantity: 6 },
        { operation: 'RENDERING', provider: 'local-ffmpeg', model: 'libx264-aac', quantity: input.targetDurationSec / 60 },
      ],
    }),
  ]);

  const templates = [
    {
      angle: 'Evidence-First Problem -> Proof -> CTA',
      structure: 'Direct Source Hook -> Problem Context -> Product Proof -> Clear CTA',
      voiceover: 'Use original speaker audio for hook & proof; add brief AI bridge narration only if needed.',
      caption: 'Clean Professional word-level captions in vertical safe zone.',
    },
    {
      angle: 'Founder Insight -> Live Demonstration',
      structure: 'Contrarian Insight -> Walkthrough Beat -> Tangible Result -> CTA',
      voiceover: 'Preserve verbatim founder quote on A-roll with subtle -20 dB music bed.',
      caption: 'High-Energy Creator active-word highlight on key numbers.',
    },
    {
      angle: 'Rapid 3-Beat Value Breakdown',
      structure: 'Question Hook -> 3 Concrete Takeaways -> Summary CTA',
      voiceover: 'Tight paced cuts removing pauses > 0.6s with ducked narration.',
      caption: 'Educational structured phrase captions with lower-third labels.',
    },
  ];

  const conceptBlueprints = templates.slice(0, input.conceptCount).map((tpl, idx) => {
    const primaryHl = highlights[idx] ?? highlights[0] ?? null;
    const secondaryHit = searchHits[idx] ?? searchHits[0] ?? null;

    const hookText = primaryHl
      ? primaryHl.suggestedHook
      : `${input.brief.slice(0, 72).trim()} — ${tpl.angle.split('->')[0]?.trim()}`;

    const scriptSections: EditorialScriptSection[] = [
      {
        order: 1,
        role: 'HOOK',
        provenance: primaryHl ? 'DIRECT_QUOTE' : 'AI_NARRATION',
        text: hookText,
        sourceAssetId: primaryHl?.assetId ?? null,
        startSec: primaryHl?.startSec ?? null,
        endSec: primaryHl?.endSec ?? null,
        visualDirection: primaryHl
          ? `Cut directly to ${primaryHl.fileName} at ${primaryHl.startSec.toFixed(1)}s (${primaryHl.supportingVisualEvidence}).`
          : 'Open with bold kinetic typography title card over brand canvas.',
      },
      {
        order: 2,
        role: 'BODY',
        provenance: secondaryHit?.matchingTranscript ? 'PARAPHRASE' : 'AI_NARRATION',
        text: secondaryHit?.matchingTranscript
          ? `Key point from footage: ${secondaryHit.matchingTranscript.slice(0, 180)}`
          : `Address ${input.audience}: ${input.objective} in a ${input.tone} tone.`,
        sourceAssetId: secondaryHit?.assetId ?? null,
        startSec: secondaryHit?.startSec ?? null,
        endSec: secondaryHit?.endSec ?? null,
        visualDirection: secondaryHit
          ? `Show ${secondaryHit.fileName} (${secondaryHit.startSec.toFixed(1)}s–${secondaryHit.endSec.toFixed(1)}s) with supporting B-roll.`
          : 'Pair narration with product callout overlay and motion graphics.',
      },
      {
        order: 3,
        role: 'CTA',
        provenance: 'AI_NARRATION',
        text: input.cta,
        sourceAssetId: null,
        startSec: null,
        endSec: null,
        visualDirection: 'Brand end-card with clear CTA button and logo.',
      },
    ];

    const quality = scoreEditorialConcept({
      hook: hookText,
      brief: input.brief,
      scriptSections,
      hasBrandKit: Boolean(project.workspace.brandKit),
      cta: input.cta,
    });

    const selectedMoments = [
      ...(primaryHl
        ? [{ assetId: primaryHl.assetId, fileName: primaryHl.fileName, startSec: primaryHl.startSec, endSec: primaryHl.endSec, role: 'HOOK' }]
        : []),
      ...(secondaryHit && secondaryHit.assetId !== primaryHl?.assetId
        ? [{ assetId: secondaryHit.assetId, fileName: secondaryHit.fileName, startSec: secondaryHit.startSec, endSec: secondaryHit.endSec, role: 'BODY' }]
        : []),
    ];

    return {
      rank: idx + 1,
      title: `Concept #${idx + 1}: ${tpl.angle}`,
      hook: hookText,
      narrativeStructure: tpl.structure,
      selectedMoments,
      scriptSections,
      voiceoverApproach: tpl.voiceover,
      captionApproach: tpl.caption,
      cta: input.cta,
      editorialRationale: primaryHl
        ? `Anchored in verified project footage (${primaryHl.fileName} @ ${primaryHl.startSec.toFixed(1)}s) with ${tpl.angle}.`
        : `Brief-driven concept (${tpl.angle}); no matching transcribed footage found yet in project.`,
      quality,
    };
  });

  conceptBlueprints.sort((a, b) => b.quality.overallScore - a.quality.overallScore);

  const plan = await prisma.editorialPlan.create({
    data: {
      workspaceId,
      projectId: project.id,
      createdByUserId: userId,
      brief: input.brief,
      audience: input.audience,
      objective: input.objective,
      platform: input.platform,
      targetDurationSec: input.targetDurationSec,
      tone: input.tone,
      cta: input.cta,
      status: 'REVIEW',
      estimatedCostUsd: costEstimate.knownEstimatedTotalUsd,
      concepts: {
        create: conceptBlueprints.map((c, idx) => ({
          id: randomUUID(),
          workspaceId,
          rank: idx + 1,
          title: c.title,
          hook: c.hook,
          narrativeStructure: c.narrativeStructure,
          selectedMomentsJson: toJson(c.selectedMoments),
          scriptSectionsJson: toJson(c.scriptSections),
          voiceoverApproach: c.voiceoverApproach,
          captionApproach: c.captionApproach,
          cta: c.cta,
          editorialRationale: c.editorialRationale,
          qualityScoreJson: toJson(c.quality),
          overallEditorialScore: c.quality.overallScore,
          status: 'PROPOSED',
        })),
      },
    },
    include: {
      concepts: { orderBy: { rank: 'asc' } },
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId,
      action: 'EDITORIAL_PLAN_GENERATED',
      entityType: 'EditorialPlan',
      entityId: plan.id,
      detailsJson: {
        projectId: project.id,
        conceptCount: plan.concepts.length,
        sourceHighlightsUsed: highlights.length,
        estimatedCostUsd: costEstimate.knownEstimatedTotalUsd,
      },
    },
  });

  return {
    plan,
    costEstimate,
    matchedHighlightsCount: highlights.length,
    matchedSearchHitsCount: searchHits.length,
  };
}

export async function updateEditorialConceptDecision(params: {
  workspaceId: string;
  userId: string;
  planId: string;
  conceptId: string;
  input: UpdateEditorialConceptRequest;
}) {
  const concept = await prisma.editorialConcept.findFirst({
    where: {
      id: params.conceptId,
      planId: params.planId,
      workspaceId: params.workspaceId,
    },
  });
  if (!concept) {
    throw new NotFoundError('EditorialConcept', params.conceptId);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const savedConcept = await tx.editorialConcept.update({
      where: { id: concept.id },
      data: {
        ...(params.input.title !== undefined ? { title: params.input.title } : {}),
        ...(params.input.hook !== undefined ? { hook: params.input.hook } : {}),
        ...(params.input.cta !== undefined ? { cta: params.input.cta } : {}),
        ...(params.input.status !== undefined ? { status: params.input.status } : {}),
        ...(params.input.reviewerNotes !== undefined ? { reviewerNotes: params.input.reviewerNotes } : {}),
      },
    });

    const planUpdateData: Prisma.EditorialPlanUpdateInput = {
      revisionNumber: { increment: 1 },
    };
    if (params.input.status === 'APPROVED') {
      planUpdateData.status = 'APPROVED';
      planUpdateData.approvedConceptId = savedConcept.id;
      planUpdateData.approvedByUserId = params.userId;
      planUpdateData.approvedAt = new Date();
    }

    const updatedPlan = await tx.editorialPlan.update({
      where: { id: params.planId },
      data: planUpdateData,
      include: { concepts: { orderBy: { rank: 'asc' } } },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: params.workspaceId,
        userId: params.userId,
        action:
          params.input.status === 'APPROVED'
            ? 'EDITORIAL_CONCEPT_APPROVED'
            : params.input.status === 'REJECTED'
              ? 'EDITORIAL_CONCEPT_REJECTED'
              : 'EDITORIAL_CONCEPT_UPDATED',
        entityType: 'EditorialConcept',
        entityId: savedConcept.id,
        detailsJson: {
          planId: params.planId,
          status: savedConcept.status,
          revisionNumber: updatedPlan.revisionNumber,
        },
      },
    });

    return { concept: savedConcept, plan: updatedPlan };
  });

  return updated;
}
