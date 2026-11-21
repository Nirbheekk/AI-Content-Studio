'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AppShell } from '../../components/app-shell';
import { useStudio } from '../../context/studio-context';
import { apiRequest } from '../../lib/api-client';

export default function BrandKitPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const [brandName, setBrandName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#6366F1');
  const [secondaryColor, setSecondaryColor] = useState('#09090B');
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
      <div className="space-y-8">
        <div className="border-b border-border pb-5">
          <h1 className="text-2xl font-bold text-foreground">Workspace Brand Kit &amp; Visual Language</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Configure brand colors, typography, caption style presets, tone of voice, and editing
            choreography automatically inherited by all AI-generated compositions.
          </p>
        </div>

        <form
          onSubmit={handleSave}
          className="grid gap-6 rounded-xl border border-border bg-card/70 p-6 lg:grid-cols-2"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-foreground/90">Brand Name</label>
              <input
                type="text"
                required
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-foreground/90">Primary Color</label>
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground/90">Secondary Background</label>
                <input
                  type="text"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground/90">Accent Highlight</label>
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground/90">Heading Font</label>
                <input
                  type="text"
                  value={headingFont}
                  onChange={(e) => setHeadingFont(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground/90">Body Font</label>
                <input
                  type="text"
                  value={bodyFont}
                  onChange={(e) => setBodyFont(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-foreground/90">Caption Preset</label>
                <select
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
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="word-highlight">word-highlight</option>
                  <option value="karaoke-pop">karaoke-pop</option>
                  <option value="minimal-lower">minimal-lower</option>
                  <option value="kinetic-center">kinetic-center</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-foreground/90">Caption Font Size (px)</label>
                <input
                  type="number"
                  min={24}
                  max={84}
                  value={captionFontSizePx}
                  onChange={(e) => setCaptionFontSizePx(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-foreground/90">Tone of Voice</label>
              <input
                type="text"
                required
                value={toneOfVoice}
                onChange={(e) => setToneOfVoice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground/90">Editing Style &amp; Choreography</label>
              <input
                type="text"
                required
                value={editingStyle}
                onChange={(e) => setEditingStyle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground/90">Target Audience</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <div>
              <label className="block text-xs text-foreground/90">Brand Guidelines Notes</label>
              <textarea
                rows={3}
                value={guidelinesText}
                onChange={(e) => setGuidelinesText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Saving Brand Kit...' : 'Save Workspace Brand Kit'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
