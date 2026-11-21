'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Palette, Save } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  NativeSelect,
  PageHeader,
  Textarea,
} from '@/components/design-system/primitives';
import { useStudio } from '@/context/studio-context';
import { apiRequest } from '@/lib/api-client';

export default function BrandKitPage() {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();

  const [brandName, setBrandName] = useState('AI Content Studio');
  const [primaryColor, setPrimaryColor] = useState('#18181b');
  const [secondaryColor, setSecondaryColor] = useState('#09090b');
  const [accentColor, setAccentColor] = useState('#5e6ad2');
  const [headingFont, setHeadingFont] = useState('Inter');
  const [bodyFont, setBodyFont] = useState('Inter');
  const [toneOfVoice, setToneOfVoice] = useState('Clear, confident, editorial');
  const [editingStyle, setEditingStyle] = useState('fast-paced');
  const [captionStyle, setCaptionStyle] = useState<
    'word-highlight' | 'karaoke-pop' | 'minimal-lower' | 'kinetic-center'
  >('word-highlight');
  const [captionFontSizePx, setCaptionFontSizePx] = useState(44);
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
      setFeedback({ type: 'success', message: 'Brand Kit saved for all new compositions' });
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
      <div className="space-y-5">
        <PageHeader
          title="Brand Kit"
          description="Colors, typography, caption presets, and voice inherited by AI Studio and Video Editor."
          badge={<Badge variant="outline">{activeWorkspace?.name ?? 'Workspace'}</Badge>}
        />

        <div className="grid gap-6 lg:grid-cols-12">
          <form onSubmit={handleSave} className="space-y-6 lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle>Identity & Palette</CardTitle>
                <CardDescription>Applied across video backgrounds, lower-thirds, and highlights.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bk-name">Brand Name</Label>
                  <Input
                    id="bk-name"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { id: 'bk-primary', label: 'Primary', value: primaryColor, set: setPrimaryColor },
                    { id: 'bk-secondary', label: 'Secondary', value: secondaryColor, set: setSecondaryColor },
                    { id: 'bk-accent', label: 'Accent', value: accentColor, set: setAccentColor },
                  ].map((c) => (
                    <div key={c.id} className="space-y-1.5">
                      <Label htmlFor={c.id}>{c.label}</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={c.value}
                          onChange={(e) => c.set(e.target.value)}
                          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                        />
                        <Input
                          id={c.id}
                          value={c.value}
                          onChange={(e) => c.set(e.target.value)}
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Typography & Captions</CardTitle>
                <CardDescription>Controls Remotion title cards and animated subtitle styling.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bk-hfont">Heading Font</Label>
                  <Input
                    id="bk-hfont"
                    value={headingFont}
                    onChange={(e) => setHeadingFont(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-bfont">Body Font</Label>
                  <Input
                    id="bk-bfont"
                    value={bodyFont}
                    onChange={(e) => setBodyFont(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-cap-style">Caption Preset</Label>
                  <NativeSelect
                    id="bk-cap-style"
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
                    <option value="word-highlight">Word Highlight</option>
                    <option value="karaoke-pop">Karaoke Pop</option>
                    <option value="minimal-lower">Minimal Lower-Third</option>
                    <option value="kinetic-center">Kinetic Center</option>
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-cap-size">Caption Size (px)</Label>
                  <Input
                    id="bk-cap-size"
                    type="number"
                    min={20}
                    max={80}
                    value={captionFontSizePx}
                    onChange={(e) => setCaptionFontSizePx(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Voice & Creative Guidelines</CardTitle>
                <CardDescription>Injected into the Script Writer and Director agents.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bk-tone">Tone of Voice</Label>
                    <Input
                      id="bk-tone"
                      value={toneOfVoice}
                      onChange={(e) => setToneOfVoice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bk-style">Editing Pacing</Label>
                    <Input
                      id="bk-style"
                      value={editingStyle}
                      onChange={(e) => setEditingStyle(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-audience">Target Audience</Label>
                  <Input
                    id="bk-audience"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Founders, creators, product marketers"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-obj">Content Objectives</Label>
                  <Input
                    id="bk-obj"
                    value={contentObjectives}
                    onChange={(e) => setContentObjectives(e.target.value)}
                    placeholder="Product awareness, waitlist signups"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bk-guide">Editorial Guidelines</Label>
                  <Textarea
                    id="bk-guide"
                    rows={3}
                    value={guidelinesText}
                    onChange={(e) => setGuidelinesText(e.target.value)}
                    placeholder="Avoid jargon. Open every reel with a visual hook within 2 seconds."
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" disabled={saving}>
                    <Save className="h-3.5 w-3.5" />
                    {saving ? 'Saving...' : 'Save Brand Kit'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          {/* Live 9:16 Brand Preview */}
          <Card className="h-fit p-6 lg:col-span-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Palette className="h-4 w-4" />
                Live 9:16 Preview
              </span>
              <Badge variant="outline">{captionStyle}</Badge>
            </div>
            <div
              className="flex min-h-96 w-full flex-col justify-between rounded-2xl border border-border p-6 text-primary-foreground"
              style={{
                background: `linear-gradient(155deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              <div className="flex items-center justify-between text-xs opacity-90">
                <span className="font-semibold">{brandName}</span>
                <span>{editingStyle}</span>
              </div>
              <div className="space-y-2 text-center">
                <div className="text-lg font-bold leading-snug" style={{ fontFamily: headingFont }}>
                  Ship Studio-Grade Content Faster
                </div>
                <p className="text-xs opacity-90" style={{ fontFamily: bodyFont }}>
                  {toneOfVoice}
                </p>
              </div>
              <div className="rounded-xl bg-canvas/70 px-3 py-2 text-center text-xs font-semibold">
                Live{' '}
                <span style={{ color: accentColor }}>Caption Highlight</span>{' '}
                ({captionFontSizePx}px)
              </div>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
