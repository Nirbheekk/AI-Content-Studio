'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Send,
} from 'lucide-react';
import { AppShell } from '../../components/app-shell';
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Textarea,
} from '../../components/design-system/primitives';
import { useStudio } from '../../context/studio-context';
import { apiRequest } from '../../lib/api-client';

interface CalendarEntry {
  id: string;
  socialAccountId: string;
  socialAccount: {
    id: string;
    platform: string;
    accountName: string;
    accountHandle: string;
    status: string;
  };
  platform: string;
  contentType: string;
  title: string | null;
  captionText: string;
  hashtags: string[];
  status: string;
  providerStatus: string;
  scheduledFor: string | null;
  timezone: string;
  publishedAt: string | null;
  externalPostId: string | null;
  externalPostUrl: string | null;
  isSimulated: boolean;
  calendarDateKey: string;
  localDateTimeLabel: string;
  displayTimezone: string;
}

interface CalendarResponse {
  view: 'day' | 'week' | 'month';
  anchorDate: string;
  timezone: string;
  totalCount: number;
  entries: CalendarEntry[];
  groupedByDate: Record<string, CalendarEntry[]>;
}

interface SocialAccountOption {
  id: string;
  platform: string;
  accountName: string;
  accountHandle: string;
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Kathmandu',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const PLATFORMS = [
  '',
  'INSTAGRAM_REELS',
  'TIKTOK',
  'YOUTUBE_SHORTS',
  'YOUTUBE_LONG',
  'LINKEDIN',
  'X_TWITTER',
  'FACEBOOK',
];

const STATUSES = ['', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'CANCELLED'];

function formatDateKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function ContentCalendarPage() {
  const { activeWorkspace, accessToken, setFeedback } = useStudio();

  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [timezone, setTimezone] = useState('UTC');
  const [platformFilter, setPlatformFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Drag-and-Drop State
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);

  // Selected Post Inspector / Edit Modal State
  const [selectedPost, setSelectedPost] = useState<CalendarEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCaption, setEditCaption] = useState('');
  const [editHashtags, setEditHashtags] = useState('');
  const [editScheduleIso, setEditScheduleIso] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadCalendar = useCallback(async () => {
    if (!activeWorkspace || !accessToken) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view,
        anchorDate: anchorDate.toISOString(),
        timezone,
      });
      if (platformFilter) params.set('platform', platformFilter);
      if (accountFilter) params.set('socialAccountId', accountFilter);
      if (statusFilter) params.set('status', statusFilter);

      const [calRes, accRes] = await Promise.all([
        apiRequest<CalendarResponse>(`/api/v1/calendar?${params.toString()}`, {
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
        apiRequest<{ accounts: SocialAccountOption[] }>('/api/v1/publishing/accounts', {
          accessToken,
          workspaceId: activeWorkspace.id,
        }),
      ]);

      setCalendarData(calRes);
      setAccounts(accRes.accounts);
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load content calendar',
      });
    } finally {
      setLoading(false);
    }
  }, [
    activeWorkspace,
    accessToken,
    view,
    anchorDate,
    timezone,
    platformFilter,
    accountFilter,
    statusFilter,
    setFeedback,
  ]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  const calendarDays = useMemo(() => {
    const year = anchorDate.getUTCFullYear();
    const month = anchorDate.getUTCMonth();

    if (view === 'day') {
      const d = new Date(Date.UTC(year, month, anchorDate.getUTCDate()));
      return [{ date: d, dateKey: formatDateKey(d), inCurrentMonth: true }];
    }

    if (view === 'week') {
      const dayOfWeek = anchorDate.getUTCDay();
      const startDay = anchorDate.getUTCDate() - dayOfWeek;
      return Array.from({ length: 7 }, (_, idx) => {
        const d = new Date(Date.UTC(year, month, startDay + idx));
        return { date: d, dateKey: formatDateKey(d), inCurrentMonth: true };
      });
    }

    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const startOffset = firstOfMonth.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

    return Array.from({ length: totalCells }, (_, idx) => {
      const dayOffset = idx - startOffset + 1;
      const d = new Date(Date.UTC(year, month, dayOffset));
      return {
        date: d,
        dateKey: formatDateKey(d),
        inCurrentMonth: d.getUTCMonth() === month,
      };
    });
  }, [anchorDate, view]);

  const navigateAnchor = (direction: -1 | 0 | 1) => {
    if (direction === 0) {
      setAnchorDate(new Date());
      return;
    }
    const next = new Date(anchorDate);
    if (view === 'day') {
      next.setUTCDate(next.getUTCDate() + direction);
    } else if (view === 'week') {
      next.setUTCDate(next.getUTCDate() + direction * 7);
    } else {
      next.setUTCMonth(next.getUTCMonth() + direction);
    }
    setAnchorDate(next);
  };

  const handleDropOnDate = async (targetDateKey: string) => {
    setDragOverDateKey(null);
    if (!draggedPostId || !activeWorkspace || !accessToken || !calendarData) return;

    const post = calendarData.entries.find((e) => e.id === draggedPostId);
    setDraggedPostId(null);
    if (!post) return;

    if (post.status === 'PUBLISHED' || post.status === 'PUBLISHING') {
      setFeedback({
        type: 'error',
        message: `Cannot reschedule a post that is already ${post.status}.`,
      });
      return;
    }

    const existingTimePart = post.scheduledFor
      ? post.scheduledFor.slice(11, 19)
      : '14:00:00';
    const nextIso = new Date(`${targetDateKey}T${existingTimePart}.000Z`).toISOString();

    try {
      await apiRequest(`/api/v1/publishing/posts/${post.id}/reschedule`, {
        method: 'PATCH',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          scheduledFor: nextIso,
          timezone,
        },
      });
      setFeedback({
        type: 'success',
        message: `Rescheduled ${post.platform} post to ${targetDateKey} (${timezone}).`,
      });
      await loadCalendar();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to reschedule post',
      });
    }
  };

  const openPostInspector = (entry: CalendarEntry) => {
    setSelectedPost(entry);
    setEditTitle(entry.title ?? '');
    setEditCaption(entry.captionText);
    setEditHashtags(entry.hashtags.join(', '));
    const baseDate = entry.scheduledFor ? new Date(entry.scheduledFor) : new Date();
    setEditScheduleIso(baseDate.toISOString().slice(0, 16));
  };

  const handleSavePostEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost || !activeWorkspace || !accessToken) return;
    setSavingEdit(true);
    try {
      const cleanTags = editHashtags
        .split(',')
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean);

      await apiRequest(`/api/v1/publishing/posts/${selectedPost.id}`, {
        method: 'PATCH',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {
          ...(editTitle.trim() ? { title: editTitle.trim() } : {}),
          captionText: editCaption.trim(),
          hashtags: cleanTags,
        },
      });

      if (editScheduleIso) {
        await apiRequest(`/api/v1/publishing/posts/${selectedPost.id}/reschedule`, {
          method: 'PATCH',
          accessToken,
          workspaceId: activeWorkspace.id,
          body: {
            scheduledFor: new Date(editScheduleIso).toISOString(),
            timezone,
          },
        });
      }

      setFeedback({
        type: 'success',
        message: 'Updated post content and schedule.',
      });
      setSelectedPost(null);
      await loadCalendar();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update scheduled post',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelFromInspector = async (postId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      await apiRequest(`/api/v1/publishing/posts/${postId}/cancel`, {
        method: 'POST',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      setFeedback({
        type: 'success',
        message: 'Post cancelled.',
      });
      setSelectedPost(null);
      await loadCalendar();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to cancel post',
      });
    }
  };

  const handlePublishImmediatelyFromInspector = async (postId: string) => {
    if (!activeWorkspace || !accessToken) return;
    try {
      await apiRequest(`/api/v1/publishing/posts/${postId}/publish`, {
        method: 'POST',
        accessToken,
        workspaceId: activeWorkspace.id,
        body: {},
      });
      setFeedback({
        type: 'success',
        message: 'Post published immediately.',
      });
      setSelectedPost(null);
      await loadCalendar();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to publish post',
      });
    }
  };

  const monthHeading = anchorDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Content Calendar"
          description="Drag and drop scheduled posts across dates, switch between Monthly, Weekly, and Daily views, and manage multi-platform campaigns."
          badge={<Badge variant="ai">{calendarData?.totalCount ?? 0} Scheduled / Published</Badge>}
          actions={
            <Link
              href="/publish"
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-95"
            >
              <Plus className="h-3.5 w-3.5" />
              Compose &amp; Schedule Post
            </Link>
          }
        />

        {/* Controls Bar: View Switcher, Date Nav, Filters & Timezone */}
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 p-1">
              {(['month', 'week', 'day'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => setView(mode)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                    view === mode
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode} View
                </button>
              ))}
            </div>

            {/* Date Navigation */}
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => navigateAnchor(-1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </Button>
              <Button variant="secondary" size="sm" onClick={() => navigateAnchor(0)}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigateAnchor(1)}>
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <span className="ml-2 text-sm font-semibold text-foreground">{monthHeading}</span>
            </div>

            {/* Platform, Account, Status & Timezone Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <Select
                aria-label="Filter by Platform"
                value={platformFilter}
                onChange={(e) => setPlatformFilter(e.target.value)}
                className="w-auto"
              >
                <option value="">All Platforms</option>
                {PLATFORMS.filter(Boolean).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Filter by Social Account"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="w-auto"
              >
                <option value="">All Accounts</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountHandle} ({acc.platform})
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Filter by Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-auto"
              >
                <option value="">All Statuses</option>
                {STATUSES.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>

              <Select
                aria-label="Calendar Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-auto"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    TZ: {tz}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Status Legend Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-[11px] text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Status Legend:</span>
              <Badge variant="ai">
                <Clock className="h-3 w-3" />
                Scheduled
              </Badge>
              <Badge variant="success">
                <CheckCircle2 className="h-3 w-3" />
                Published
              </Badge>
              <Badge variant="info">
                <Send className="h-3 w-3" />
                In-Flight
              </Badge>
              <Badge variant="destructive">
                <AlertTriangle className="h-3 w-3" />
                Failed
              </Badge>
              <Badge variant="outline">Cancelled</Badge>
            </div>
            <span>Tip: Drag scheduled cards onto another day to reschedule.</span>
          </div>
        </Card>

        {/* Calendar Grid */}
        <Card className="p-4">
          {view !== 'day' && (
            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted-foreground">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>
          )}

          {loading && !calendarData ? (
            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: 14 }).map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : (
            <div
              className={`grid gap-2 ${
                view === 'day' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-7'
              }`}
            >
              {calendarDays.map((cell) => {
                const dayEntries = calendarData?.groupedByDate[cell.dateKey] ?? [];
                const isDragTarget = dragOverDateKey === cell.dateKey;
                const isToday = cell.dateKey === formatDateKey(new Date());
                const dayNum = cell.date.getUTCDate();
                const monthShort = cell.date.toLocaleDateString('en-US', {
                  month: 'short',
                  timeZone: 'UTC',
                });

                return (
                  <div
                    key={cell.dateKey}
                    title={cell.dateKey}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverDateKey(cell.dateKey);
                    }}
                    onDragLeave={() => {
                      if (dragOverDateKey === cell.dateKey) {
                        setDragOverDateKey(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      void handleDropOnDate(cell.dateKey);
                    }}
                    className={`min-h-[135px] rounded-xl border p-2.5 transition-colors ${
                      isDragTarget
                        ? 'border-primary bg-ai-surface'
                        : isToday
                          ? 'border-primary bg-ai-surface/30 ring-1 ring-primary/30'
                          : cell.inCurrentMonth
                            ? 'border-border bg-secondary/25'
                            : 'border-border/60 bg-muted/20 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            isToday ? 'text-primary' : 'text-foreground'
                          }`}
                        >
                          {dayNum === 1 || view === 'day' ? `${monthShort} ${dayNum}` : dayNum}
                        </span>
                        {isToday && <Badge variant="ai">Today</Badge>}
                      </div>
                      {dayEntries.length > 0 && (
                        <Badge variant="default">{dayEntries.length}</Badge>
                      )}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {dayEntries.map((entry) => {
                        const canDrag =
                          entry.status !== 'PUBLISHED' && entry.status !== 'PUBLISHING';
                        return (
                          <div
                            key={entry.id}
                            draggable={canDrag}
                            onDragStart={() => setDraggedPostId(entry.id)}
                            onClick={() => openPostInspector(entry)}
                            className={`cursor-pointer rounded-lg border p-2 text-left text-[11px] transition-colors hover:border-primary ${
                              entry.status === 'PUBLISHED'
                                ? 'border-success/35 bg-success-surface text-success'
                                : entry.status === 'SCHEDULED'
                                  ? 'border-primary/30 bg-ai-surface text-foreground'
                                  : entry.status === 'FAILED'
                                    ? 'border-destructive/40 bg-destructive/15 text-destructive'
                                    : entry.status === 'CANCELLED'
                                      ? 'border-border bg-card/70 text-muted-foreground line-through'
                                      : 'border-info/35 bg-info-surface text-info'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate font-semibold">{entry.platform}</span>
                              <span className="shrink-0 rounded border border-current/25 px-1 py-0.5 text-[9px] font-semibold">
                                {entry.status}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[10px] opacity-85 tabular-nums">
                              {entry.socialAccount.accountHandle} •{' '}
                              {entry.localDateTimeLabel.slice(11, 16)}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[11px] font-medium">
                              {entry.title ? `${entry.title}: ` : ''}
                              {entry.captionText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Post Inspector & Reschedule / Edit Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="calendar-post-title"
        >
          <Card className="w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                <Badge variant="ai">{selectedPost.platform}</Badge>
                <span id="calendar-post-title" className="text-xs font-semibold text-foreground">
                  {selectedPost.socialAccount.accountHandle}
                </span>
                <Badge
                  variant={
                    selectedPost.status === 'PUBLISHED'
                      ? 'success'
                      : selectedPost.status === 'FAILED'
                        ? 'destructive'
                        : 'default'
                  }
                >
                  {selectedPost.status}
                </Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedPost(null)}>
                Close
              </Button>
            </div>

            {selectedPost.status === 'PUBLISHED' ? (
              <div className="mt-4 space-y-3 text-xs text-foreground">
                <div className="rounded-xl border border-success/35 bg-success-surface p-3 text-success">
                  Confirmed Published at {selectedPost.localDateTimeLabel} (
                  {selectedPost.displayTimezone})
                </div>
                {selectedPost.title && (
                  <div>
                    <strong>Title:</strong> {selectedPost.title}
                  </div>
                )}
                <div>
                  <strong>Caption:</strong>
                  <p className="mt-1 rounded-lg border border-border bg-secondary/35 p-2.5 text-foreground">
                    {selectedPost.captionText}
                  </p>
                </div>
                {selectedPost.externalPostUrl && (
                  <a
                    href={selectedPost.externalPostUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    Open External Post URL
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={handleSavePostEdits} className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Post Title
                  </label>
                  <Input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">Caption</label>
                  <Textarea
                    rows={3}
                    required
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Hashtags (comma-separated)
                  </label>
                  <Input
                    type="text"
                    value={editHashtags}
                    onChange={(e) => setEditHashtags(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-foreground">
                    Reschedule Date &amp; Time ({timezone})
                  </label>
                  <Input
                    type="datetime-local"
                    value={editScheduleIso}
                    onChange={(e) => setEditScheduleIso(e.target.value)}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <div className="flex gap-2">
                    <Button
                      variant="success"
                      size="sm"
                      onClick={() => void handlePublishImmediatelyFromInspector(selectedPost.id)}
                    >
                      Publish Now
                    </Button>
                    {selectedPost.status !== 'CANCELLED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleCancelFromInspector(selectedPost.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Cancel Post
                      </Button>
                    )}
                  </div>

                  <Button type="submit" size="sm" disabled={savingEdit}>
                    {savingEdit ? 'Saving...' : 'Save Changes & Reschedule'}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}
