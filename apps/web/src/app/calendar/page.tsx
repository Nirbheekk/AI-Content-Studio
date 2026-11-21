'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
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

    // Monthly 35 or 42 cell grid
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

    // Preserve time of day or default to 14:00 UTC on target date
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
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Interactive Content Calendar</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Drag and drop scheduled posts across dates, switch between Monthly, Weekly, and Daily
              views, and filter by platform or social account.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/publish"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              + Compose &amp; Schedule Post
            </Link>
          </div>
        </div>

        {/* Controls Bar: View Switcher, Date Nav, Filters & Timezone */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 rounded-lg bg-zinc-950 p-1">
            {(['month', 'week', 'day'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  view === mode
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {mode} View
              </button>
            ))}
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigateAnchor(-1)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => navigateAnchor(0)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => navigateAnchor(1)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Next
            </button>
            <span className="ml-2 text-sm font-bold text-white">{monthHeading}</span>
          </div>

          {/* Platform, Account, Status & Timezone Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filter by Platform"
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">All Platforms</option>
              {PLATFORMS.filter(Boolean).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by Social Account"
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountHandle} ({acc.platform})
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">All Statuses</option>
              {STATUSES.filter(Boolean).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <select
              aria-label="Calendar Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="rounded-lg border border-indigo-500/40 bg-zinc-950 px-2.5 py-1.5 text-xs text-indigo-300"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  TZ: {tz}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          {view !== 'day' && (
            <div className="mb-2 grid grid-cols-7 gap-2 text-center text-xs font-semibold text-zinc-400">
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
            <div className="py-12 text-center text-xs text-zinc-500">
              Loading calendar schedule...
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

                return (
                  <div
                    key={cell.dateKey}
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
                    className={`min-h-[135px] rounded-lg border p-2.5 transition ${
                      isDragTarget
                        ? 'border-indigo-400 bg-indigo-950/40'
                        : isToday
                          ? 'border-indigo-500/50 bg-zinc-950'
                          : cell.inCurrentMonth
                            ? 'border-zinc-800 bg-zinc-950/80'
                            : 'border-zinc-900 bg-zinc-950/30 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-semibold ${
                          isToday ? 'text-indigo-400' : 'text-zinc-300'
                        }`}
                      >
                        {cell.dateKey}
                      </span>
                      {dayEntries.length > 0 && (
                        <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {dayEntries.length}
                        </span>
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
                            className={`cursor-pointer rounded border p-2 text-left text-[11px] transition hover:border-indigo-400 ${
                              entry.status === 'PUBLISHED'
                                ? 'border-emerald-500/30 bg-emerald-950/20 text-emerald-200'
                                : entry.status === 'SCHEDULED'
                                  ? 'border-indigo-500/30 bg-indigo-950/25 text-indigo-200'
                                  : entry.status === 'FAILED'
                                    ? 'border-red-500/40 bg-red-950/25 text-red-200'
                                    : entry.status === 'CANCELLED'
                                      ? 'border-zinc-800 bg-zinc-900/50 text-zinc-500 line-through'
                                      : 'border-cyan-500/30 bg-cyan-950/20 text-cyan-200'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-bold">{entry.platform}</span>
                              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-semibold">
                                {entry.status}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-[10px] opacity-80">
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
        </div>
      </div>

      {/* Post Inspector & Reschedule / Edit Modal */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300">
                  {selectedPost.platform}
                </span>
                <span className="text-xs text-zinc-300">
                  {selectedPost.socialAccount.accountHandle}
                </span>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                  {selectedPost.status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPost(null)}
                className="text-xs text-zinc-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {selectedPost.status === 'PUBLISHED' ? (
              <div className="mt-4 space-y-3 text-xs text-zinc-300">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-emerald-200">
                  Confirmed Published at {selectedPost.localDateTimeLabel} ({selectedPost.displayTimezone})
                </div>
                {selectedPost.title && (
                  <div>
                    <strong>Title:</strong> {selectedPost.title}
                  </div>
                )}
                <div>
                  <strong>Caption:</strong>
                  <p className="mt-1 rounded bg-zinc-950 p-2.5 text-zinc-200">
                    {selectedPost.captionText}
                  </p>
                </div>
                {selectedPost.externalPostUrl && (
                  <a
                    href={selectedPost.externalPostUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Open External Post URL
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={handleSavePostEdits} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">Post Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300">Caption</label>
                  <textarea
                    rows={3}
                    required
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Hashtags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={editHashtags}
                    onChange={(e) => setEditHashtags(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Reschedule Date &amp; Time ({timezone})
                  </label>
                  <input
                    type="datetime-local"
                    value={editScheduleIso}
                    onChange={(e) => setEditScheduleIso(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handlePublishImmediatelyFromInspector(selectedPost.id)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      Publish Now
                    </button>
                    {selectedPost.status !== 'CANCELLED' && (
                      <button
                        type="button"
                        onClick={() => void handleCancelFromInspector(selectedPost.id)}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300 hover:bg-red-500/20"
                      >
                        Cancel Post
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes & Reschedule'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
