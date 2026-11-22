export interface CompiledSceneView {
  sceneId: string;
  orderIndex: number;
  startFrame: number;
  endFrame: number;
  durationInFrames: number;
  layout: string;
  headlineText: string;
  narrationText: string;
  captionWords: Array<{ word: string; startSec: number; endSec: number }>;
}

export interface CompiledView {
  templateId: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  totalDurationSec: number;
  brand: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  captions: {
    fontSizePx: number;
    highlightColor: string;
    safeBottomMarginPx: number;
  };
  sequences: CompiledSceneView[];
}

export interface RenderJobView {
  id: string;
  status: string;
  outputSizeBytes: number;
  streamUrl?: string | null;
  downloadUrl: string | null;
  qaFrameUrls: string[];
  assetId?: string | null;
}

export interface QaReportView {
  passed: boolean;
  overallScore: number;
  summary: string;
  defects: Array<{ type: string; severity: string; description: string }>;
}

export interface CompositionVersionView {
  id: string;
  versionNumber: number;
  changeSummary: string;
}

export const PIPELINE_STAGES = [
  { id: 'ANALYZING', label: 'Analyze' },
  { id: 'PLANNING', label: 'Plan' },
  { id: 'SCRIPTING', label: 'Script' },
  { id: 'COMPOSING', label: 'Compose' },
  { id: 'RENDERING', label: 'Render' },
  { id: 'REVIEWING', label: 'Visual QA' },
  { id: 'AWAITING_APPROVAL', label: 'Approve' },
] as const;

export const PROMPT_STARTERS = [
  'Create a 15s SaaS product launch reel with a bold hook and 3 feature scenes',
  'Create a fast-paced educational short explaining 3 AI productivity workflows',
  'Turn our founder podcast insights into a kinetic TikTok clip with clear CTA',
];
