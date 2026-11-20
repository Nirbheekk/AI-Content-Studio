import {
  AspectRatio,
  CompositionTemplateId,
  OverlayComponentType,
  TargetPlatform,
} from '@ai-content-os/shared';

export interface PlatformTemplateDefinition {
  id: CompositionTemplateId;
  name: string;
  targetPlatform: TargetPlatform;
  aspectRatio: AspectRatio;
  width: number;
  height: number;
  fps: 30 | 60;
  defaultDurationSec: number;
  safeZoneTopPx: number;
  safeZoneBottomPx: number;
  defaultComponents: OverlayComponentType[];
}

export const PLATFORM_TEMPLATES: Record<CompositionTemplateId, PlatformTemplateDefinition> = {
  'instagram-reel': {
    id: 'instagram-reel',
    name: 'Instagram Reels (9:16 Dynamic Hook)',
    targetPlatform: 'INSTAGRAM_REELS',
    aspectRatio: 'PORTRAIT_9_16',
    width: 1080,
    height: 1920,
    fps: 30,
    defaultDurationSec: 15,
    safeZoneTopPx: 140,
    safeZoneBottomPx: 220,
    defaultComponents: [
      'AnimatedHeadline',
      'WordSyncedCaptions',
      'ProgressBar',
      'CallToActionScene',
    ],
  },
  'tiktok-short': {
    id: 'tiktok-short',
    name: 'TikTok Short-Form (9:16 Kinetic)',
    targetPlatform: 'TIKTOK',
    aspectRatio: 'PORTRAIT_9_16',
    width: 1080,
    height: 1920,
    fps: 30,
    defaultDurationSec: 15,
    safeZoneTopPx: 150,
    safeZoneBottomPx: 240,
    defaultComponents: [
      'KineticTypography',
      'WordSyncedCaptions',
      'SoundVisualization',
      'CallToActionScene',
    ],
  },
  'youtube-short': {
    id: 'youtube-short',
    name: 'YouTube Shorts (9:16 Retention)',
    targetPlatform: 'YOUTUBE_SHORTS',
    aspectRatio: 'PORTRAIT_9_16',
    width: 1080,
    height: 1920,
    fps: 30,
    defaultDurationSec: 20,
    safeZoneTopPx: 120,
    safeZoneBottomPx: 200,
    defaultComponents: ['AnimatedHeadline', 'WordSyncedCaptions', 'ProgressBar', 'OutroSequence'],
  },
  'youtube-long': {
    id: 'youtube-long',
    name: 'YouTube Widescreen (16:9 Chaptered)',
    targetPlatform: 'YOUTUBE_LONG',
    aspectRatio: 'LANDSCAPE_16_9',
    width: 1920,
    height: 1080,
    fps: 30,
    defaultDurationSec: 45,
    safeZoneTopPx: 80,
    safeZoneBottomPx: 100,
    defaultComponents: ['LowerThird', 'BrollTransition', 'LogoAnimation', 'OutroSequence'],
  },
  'product-demo': {
    id: 'product-demo',
    name: 'Product Demo & Walkthrough (60fps)',
    targetPlatform: 'YOUTUBE_LONG',
    aspectRatio: 'LANDSCAPE_16_9',
    width: 1920,
    height: 1080,
    fps: 60,
    defaultDurationSec: 30,
    safeZoneTopPx: 80,
    safeZoneBottomPx: 100,
    defaultComponents: [
      'AnimatedHeadline',
      'SplitScreenComposition',
      'LowerThird',
      'CallToActionScene',
    ],
  },
  'educational-video': {
    id: 'educational-video',
    name: 'Educational Explainer (16:9)',
    targetPlatform: 'LINKEDIN',
    aspectRatio: 'LANDSCAPE_16_9',
    width: 1920,
    height: 1080,
    fps: 30,
    defaultDurationSec: 30,
    safeZoneTopPx: 80,
    safeZoneBottomPx: 100,
    defaultComponents: ['TalkingHeadLayout', 'LowerThird', 'ChartGraphic', 'ProgressBar'],
  },
  'podcast-clip': {
    id: 'podcast-clip',
    name: 'Podcast Dual-Speaker Clip (9:16)',
    targetPlatform: 'INSTAGRAM_REELS',
    aspectRatio: 'PORTRAIT_9_16',
    width: 1080,
    height: 1920,
    fps: 30,
    defaultDurationSec: 18,
    safeZoneTopPx: 140,
    safeZoneBottomPx: 220,
    defaultComponents: [
      'PodcastSplitLayout',
      'WordSyncedCaptions',
      'SoundVisualization',
      'LowerThird',
    ],
  },
  'promotional-video': {
    id: 'promotional-video',
    name: 'Social Feed Promo (4:5 Portrait)',
    targetPlatform: 'LINKEDIN',
    aspectRatio: 'PORTRAIT_4_5',
    width: 1080,
    height: 1350,
    fps: 30,
    defaultDurationSec: 15,
    safeZoneTopPx: 100,
    safeZoneBottomPx: 140,
    defaultComponents: [
      'KineticTypography',
      'ImageAnimation',
      'BackgroundEffect',
      'CallToActionScene',
    ],
  },
  'data-explainer': {
    id: 'data-explainer',
    name: 'Data-Driven Chart Explainer (1:1 Square)',
    targetPlatform: 'LINKEDIN',
    aspectRatio: 'SQUARE_1_1',
    width: 1080,
    height: 1080,
    fps: 30,
    defaultDurationSec: 15,
    safeZoneTopPx: 80,
    safeZoneBottomPx: 120,
    defaultComponents: ['AnimatedHeadline', 'ChartGraphic', 'ProgressBar', 'LogoAnimation'],
  },
};

export interface RemotionComponentDescriptor {
  type: OverlayComponentType;
  category: 'typography' | 'layout' | 'transition' | 'data' | 'branding' | 'audio';
  description: string;
  springConfig: {
    damping: number;
    stiffness: number;
    mass: number;
  };
}

export const REMOTION_COMPONENT_LIBRARY: Record<OverlayComponentType, RemotionComponentDescriptor> =
  {
    AnimatedHeadline: {
      type: 'AnimatedHeadline',
      category: 'typography',
      description: 'Spring-animated opening hook headline with accent badge',
      springConfig: { damping: 14, stiffness: 180, mass: 0.9 },
    },
    KineticTypography: {
      type: 'KineticTypography',
      category: 'typography',
      description: 'High-energy word-by-word scale and position choreography',
      springConfig: { damping: 12, stiffness: 220, mass: 0.7 },
    },
    WordSyncedCaptions: {
      type: 'WordSyncedCaptions',
      category: 'typography',
      description: 'Active word highlight captions synchronized to STT word timestamps',
      springConfig: { damping: 18, stiffness: 260, mass: 0.5 },
    },
    TalkingHeadLayout: {
      type: 'TalkingHeadLayout',
      category: 'layout',
      description: 'Single-speaker centered frame with subtle zoom-in motion',
      springConfig: { damping: 20, stiffness: 120, mass: 1.0 },
    },
    PodcastSplitLayout: {
      type: 'PodcastSplitLayout',
      category: 'layout',
      description: 'Vertical top/bottom or horizontal dual-speaker podcast split container',
      springConfig: { damping: 16, stiffness: 140, mass: 1.0 },
    },
    SplitScreenComposition: {
      type: 'SplitScreenComposition',
      category: 'layout',
      description: 'Primary speaker paired with simultaneous product demo or B-roll canvas',
      springConfig: { damping: 16, stiffness: 150, mass: 1.0 },
    },
    BrollTransition: {
      type: 'BrollTransition',
      category: 'transition',
      description: 'Smooth cutaway overlay with whip-pan or cross-dissolve entry',
      springConfig: { damping: 15, stiffness: 170, mass: 0.8 },
    },
    ImageAnimation: {
      type: 'ImageAnimation',
      category: 'layout',
      description: 'Ken Burns pan-and-zoom still asset animation with shadow frame',
      springConfig: { damping: 22, stiffness: 100, mass: 1.1 },
    },
    ChartGraphic: {
      type: 'ChartGraphic',
      category: 'data',
      description: 'Data-driven animated bar/line metric visualization (chuk-motion pattern)',
      springConfig: { damping: 14, stiffness: 160, mass: 0.9 },
    },
    LowerThird: {
      type: 'LowerThird',
      category: 'branding',
      description: 'Speaker name, title, and brand accent bar slide-in lower third',
      springConfig: { damping: 16, stiffness: 190, mass: 0.8 },
    },
    ProgressBar: {
      type: 'ProgressBar',
      category: 'branding',
      description: 'Timeline progress indicator bar pinned to safe-zone edge',
      springConfig: { damping: 25, stiffness: 120, mass: 1.0 },
    },
    BackgroundEffect: {
      type: 'BackgroundEffect',
      category: 'branding',
      description: 'Ambient radial gradient and subtle grid motion backdrop',
      springConfig: { damping: 30, stiffness: 80, mass: 1.2 },
    },
    SoundVisualization: {
      type: 'SoundVisualization',
      category: 'audio',
      description: 'Reactive audio waveform bars synchronized to dialogue amplitude',
      springConfig: { damping: 10, stiffness: 280, mass: 0.4 },
    },
    LogoAnimation: {
      type: 'LogoAnimation',
      category: 'branding',
      description: 'Workspace brand logo watermark bug with spring entrance',
      springConfig: { damping: 16, stiffness: 180, mass: 0.8 },
    },
    OutroSequence: {
      type: 'OutroSequence',
      category: 'branding',
      description: 'Branded end-card sequence with social handle and subscribe prompt',
      springConfig: { damping: 15, stiffness: 160, mass: 0.9 },
    },
    CallToActionScene: {
      type: 'CallToActionScene',
      category: 'branding',
      description: 'High-conversion final call-to-action card with pulsing button badge',
      springConfig: { damping: 13, stiffness: 200, mass: 0.8 },
    },
  };
