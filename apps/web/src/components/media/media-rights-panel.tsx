'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  Badge,
  Button,
  Input,
  Label,
  NativeSelect,
} from '@/components/design-system/primitives';
import { Switch } from '@/components/ui/switch';
import { useStudio } from '@/context/studio-context';
import { apiRequest, AssetDto } from '@/lib/api-client';

export function MediaRightsPanel({
  asset,
  onUpdated,
}: {
  asset: AssetDto;
  onUpdated: () => void;
}) {
  const { accessToken, activeWorkspace, setFeedback } = useStudio();
  const r = asset.rightsRecord;

  const [rightsOwner, setRightsOwner] = useState(r?.rightsOwner ?? 'Workspace Owner');
  const [source, setSource] = useState(r?.source ?? 'USER_OWNED');
  const [licenseType, setLicenseType] = useState(r?.licenseType ?? 'Proprietary Owned');
  const [status, setStatus] = useState(r?.status ?? 'UNKNOWN');
  const [commercialAllowed, setCommercialAllowed] = useState(r?.commercialAllowed ?? true);
  const [attributionRequired, setAttributionRequired] = useState(r?.attributionRequired ?? false);
  const [attributionText, setAttributionText] = useState(r?.attributionText ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const rec = asset.rightsRecord;
    setRightsOwner(rec?.rightsOwner ?? 'Workspace Owner');
    setSource(rec?.source ?? 'USER_OWNED');
    setLicenseType(rec?.licenseType ?? 'Proprietary Owned');
    setStatus(rec?.status ?? 'UNKNOWN');
    setCommercialAllowed(rec?.commercialAllowed ?? true);
    setAttributionRequired(rec?.attributionRequired ?? false);
    setAttributionText(rec?.attributionText ?? '');
  }, [asset]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeWorkspace) return;
    setSaving(true);
    try {
      await apiRequest({
        method: 'PUT',
        path: `/api/v1/assets/${asset.id}/rights`,
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          rightsOwner: rightsOwner.trim() || 'Workspace Owner',
          source,
          licenseType: licenseType.trim() || 'Proprietary Owned',
          commercialAllowed,
          attributionRequired,
          ...(attributionText.trim() ? { attributionText: attributionText.trim() } : {}),
          status,
        },
      });
      setFeedback({ type: 'success', message: `Media rights updated (${status})` });
      onUpdated();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update rights',
      });
    } finally {
      setSaving(false);
    }
  };

  const badgeVariant =
    status === 'VERIFIED'
      ? 'success'
      : status === 'REVOKED' || status === 'EXPIRED' || status === 'RESTRICTED'
        ? 'destructive'
        : 'warning';

  return (
    <form
      onSubmit={handleSave}
      className="space-y-3 rounded-lg border border-border bg-muted/20 p-3 text-xs"
      data-testid="media-rights-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          {status === 'VERIFIED' ? (
            <ShieldCheck className="h-4 w-4 text-success" />
          ) : (
            <ShieldAlert className="h-4 w-4 text-warning" />
          )}
          <span>Media Rights &amp; Provenance</span>
        </div>
        <Badge variant={badgeVariant}>{status}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rights-owner">Rights Owner</Label>
          <Input
            id="rights-owner"
            value={rightsOwner}
            onChange={(e) => setRightsOwner(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rights-source">Source</Label>
          <NativeSelect
            id="rights-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="USER_OWNED">User Owned</option>
            <option value="LICENSED_STOCK">Licensed Stock</option>
            <option value="AI_GENERATED">AI Generated</option>
            <option value="VOICE_CLONED">Voice Cloned</option>
            <option value="CLIENT_PROVIDED">Client Provided</option>
            <option value="UNKNOWN">Unknown</option>
          </NativeSelect>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rights-license">Licence Type</Label>
          <Input
            id="rights-license"
            value={licenseType}
            onChange={(e) => setLicenseType(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rights-status">Verification Status</Label>
          <NativeSelect
            id="rights-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="UNKNOWN">Unknown</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="VERIFIED">Verified</option>
            <option value="RESTRICTED">Restricted</option>
            <option value="EXPIRED">Expired</option>
            <option value="REVOKED">Revoked</option>
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-2 pt-1">
        <label className="flex items-center justify-between">
          <span>Commercial use permitted</span>
          <Switch checked={commercialAllowed} onCheckedChange={setCommercialAllowed} />
        </label>
        <label className="flex items-center justify-between">
          <span>Attribution required</span>
          <Switch checked={attributionRequired} onCheckedChange={setAttributionRequired} />
        </label>
      </div>

      {attributionRequired && (
        <div className="space-y-1">
          <Label htmlFor="rights-attr">Required Attribution Text</Label>
          <Input
            id="rights-attr"
            value={attributionText}
            onChange={(e) => setAttributionText(e.target.value)}
            placeholder="Credit: Creator Name / Licence"
            className="h-8 text-xs"
          />
        </div>
      )}

      <Button type="submit" size="sm" variant="outline" className="w-full" disabled={saving}>
        {saving ? 'Saving Rights...' : 'Save Media Rights'}
      </Button>
    </form>
  );
}
