'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, Palette, Sparkles, Type } from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
  Textarea,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest } from '../../lib/api-client';

export default function BrandKitPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6956E8');
  const [secondaryColor, setSecondaryColor] = useState('#11131B');
  const [accentColor, setAccentColor] = useState('#22D3EE');
  const [headingFont, setHeadingFont] = useState('Inter');
  const [bodyFont, setBodyFont] = useState('Inter');
  const [toneOfVoice, setToneOfVoice] = useState('');
  const [editingStyle, setEditingStyle] = useState('');
  const [captionStyle, setCaptionStyle] = useState<
    'word-highlight' | 'karaoke-pop' | 'minimal-lower' | 'kinetic-center'
  >('word-highlight');
  const [captionFontSizePx, setCaptionFontSizePx] = useState(56);
  const [targetAudience, setTargetAudience] = useState('');
  const [contentObjectives, setContentObjectives] = useState('');
  const [guidelinesText, setGuidelinesText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBrandKit = useCallback(async () => {
    if (!accessToken || !activeWorkspace) return;
    try {
      const bk = await apiRequest<{
        brandName: string;
        primaryColor: string;
        secondaryColor: string;
        accentColor: string;
        headingFont: string;
        bodyFont: string;
        toneOfVoice: string;
        editingStyle: string;
        captionStyleJson?: { style?: string; fontSizePx?: number };
        targetAudience?: string | null;
        contentObjectives?: string | null;
        guidelinesText?: string | null;
      }>({
        path: '/api/v1/brand-kit',
        accessToken,
        workspaceId: activeWorkspace.id,
      });

      setBrandName(bk.brandName);
      setPrimaryColor(bk.primaryColor);
      setSecondaryColor(bk.secondaryColor);
      setAccentColor(bk.accentColor);
      setHeadingFont(bk.headingFont);
      setBodyFont(bk.bodyFont);
      setToneOfVoice(bk.toneOfVoice);
      setEditingStyle(bk.editingStyle);
      if (bk.captionStyleJson?.style) {
        setCaptionStyle(
          bk.captionStyleJson.style as
            | 'word-highlight'
            | 'karaoke-pop'
            | 'minimal-lower'
            | 'kinetic-center',
        );
      }
      if (bk.captionStyleJson?.fontSizePx) {
        setCaptionFontSizePx(bk.captionStyleJson.fontSizePx);
      }
      setTargetAudience(bk.targetAudience ?? '');
      setContentObjectives(bk.contentObjectives ?? '');
      setGuidelinesText(bk.guidelinesText ?? '');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load Brand Kit',
      });
    }
  }, [accessToken, activeWorkspace, setFeedback]);

  useEffect(() => {
    void loadBrandKit();
  }, [loadBrandKit]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace) return;
    setSaving(true);
    try {
      await apiRequest({
        method: 'PUT',
        path: '/api/v1/brand-kit',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          brandName,
          primaryColor,
          secondaryColor,
          accentColor,
          headingFont,
          bodyFont,
          toneOfVoice,
          editingStyle,
          captionStyle,
          captionFontSizePx: Number(captionFontSizePx),
          targetAudience: targetAudience || undefined,
          contentObjectives: contentObjectives || undefined,
          guidelinesText: guidelinesText || undefined,
        },
      });
      setFeedback({
        type: 'success',
        message: 'Workspace Brand Kit saved and ready for composition inheritance',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save Brand Kit',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Workspace Brand Kit"
          description="Configure brand colors, typography, caption style presets, tone of voice, and editing choreography automatically inherited by all AI-generated compositions."
          badge={<Badge variant="ai">{brandName || activeWorkspace?.name || 'Brand Kit'}</Badge>}
        />

        <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-12">
          {/* Left: Visual Identity & Brand Voice Configuration */}
          <Card className="space-y-5 p-5 lg:col-span-7">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Palette className="h-3.5 w-3.5 text-primary" />
                <span>1. Visual Palette &amp; Typography</span>
              </div>
              <Badge variant="outline">Auto-Inherited by Remotion AST</Badge>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">Brand Name</label>
              <Input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Primary Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Primary color swatch"
                    value={/^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : '#6956E8'}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
                  />
                  <Input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Secondary Stage
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Secondary stage color swatch"
                    value={/^#[0-9A-Fa-f]{6}$/.test(secondaryColor) ? secondaryColor : '#11131B'}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
                  />
                  <Input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Accent Highlight
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Accent highlight color swatch"
                    value={/^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : '#22D3EE'}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-card p-1"
                  />
                  <Input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
                  <Type className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Heading Font</span>
                </label>
                <Input
                  type="text"
                  value={headingFont}
                  onChange={(e) => setHeadingFont(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-foreground">
                  <Type className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Body Font</span>
                </label>
                <Input
                  type="text"
                  value={bodyFont}
                  onChange={(e) => setBodyFont(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Caption Preset
                </label>
                <Select
                  aria-label="Caption Preset"
                  value={captionStyle}
                  onChange={(e) =>
                    setCaptionStyle(
                      e.target.value as
                        | 'word-highlight'
                        | 'karaoke-pop'
                        | 'minimal-lower'
                        | 'kinetic-center',
                    )
                  }
                >
                  <option value="word-highlight">word-highlight</option>
                  <option value="karaoke-pop">karaoke-pop</option>
                  <option value="minimal-lower">minimal-lower</option>
                  <option value="kinetic-center">kinetic-center</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-foreground">
                  Caption Font Size (px)
                </label>
                <Input
                  type="number"
                  min={24}
                  max={84}
                  value={captionFontSizePx}
                  onChange={(e) => setCaptionFontSizePx(Number(e.target.value))}
                  className="tabular-nums"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>2. Brand Voice &amp; Editorial Direction</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Tone of Voice
                  </label>
                  <Input
                    type="text"
                    required
                    value={toneOfVoice}
                    onChange={(e) => setToneOfVoice(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Editing Style &amp; Choreography
                  </label>
                  <Input
                    type="text"
                    required
                    value={editingStyle}
                    onChange={(e) => setEditingStyle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Target Audience
                  </label>
                  <Input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g. SaaS founders, product marketers, and creative directors"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Brand Guidelines Notes
                  </label>
                  <Textarea
                    rows={3}
                    value={guidelinesText}
                    onChange={(e) => setGuidelinesText(e.target.value)}
                    placeholder="Editorial rules, forbidden buzzwords, or CTA preferences..."
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              <CheckCircle2 className="h-4 w-4" />
              {saving ? 'Saving Brand Kit...' : 'Save Workspace Brand Kit'}
            </Button>
          </Card>

          {/* Right: Live 9:16 Studio Frame Preview */}
          <Card className="flex flex-col justify-between p-5 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Eye className="h-3.5 w-3.5 text-primary" />
                  <span>Live 9:16 Composition Preview</span>
                </div>
                <Badge variant="ai">{captionStyle}</Badge>
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Real-time preview of how AI Studio and the Video Editor apply your palette,
                typography, and caption highlight preset:
              </p>

              <div className="my-5 rounded-2xl border border-border bg-canvas p-5">
                <div
                  className="mx-auto flex aspect-[9/16] max-h-80 w-48 flex-col justify-between rounded-xl border border-white/15 p-3.5 shadow-2xl"
                  style={{ backgroundColor: secondaryColor || '#11131B' }}
                >
                  <div className="flex items-center justify-between text-[9px] text-white">
                    <span className="rounded bg-black/65 px-1.5 py-0.5 font-mono">
                      {brandName || 'Brand Studio'}
                    </span>
                    <span className="rounded bg-black/65 px-1.5 py-0.5 font-mono">
                      {headingFont}
                    </span>
                  </div>

                  <div className="my-auto text-center">
                    <div
                      className="rounded-lg px-2.5 py-1.5 text-xs font-bold leading-snug text-white shadow-md"
                      style={{ backgroundColor: primaryColor || '#6956E8' }}
                    >
                      Describe It. Create It. Publish It.
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="rounded bg-black/80 px-2 py-1 text-center text-[11px] font-bold">
                      <span style={{ color: accentColor || '#22D3EE' }}>
                        {captionStyle} ({captionFontSizePx}px)
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded bg-black/50">
                      <div
                        className="h-full w-2/3"
                        style={{ backgroundColor: accentColor || '#22D3EE' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-secondary/35 p-3.5 text-xs">
              <div className="font-semibold text-foreground">Active Voice &amp; Style Summary</div>
              <div className="text-muted-foreground">
                <strong className="text-foreground">Tone:</strong>{' '}
                {toneOfVoice || 'Authoritative, engaging, concise'}
              </div>
              <div className="text-muted-foreground">
                <strong className="text-foreground">Editing:</strong>{' '}
                {editingStyle || 'Fast-paced dynamic cuts'}
              </div>
            </div>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
