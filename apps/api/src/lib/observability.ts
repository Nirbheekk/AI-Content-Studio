import { redactSensitive, sanitizeUrlForLog } from '@ai-content-os/shared';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured JSON logger. All fields pass through redaction before being written. */
export function logEvent(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  if (process.env['NODE_ENV'] === 'test' && process.env['LOG_IN_TEST'] !== '1') return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: '@ai-content-os/api',
    message: redactSensitive(message),
    ...(redactSensitive(fields) as Record<string, unknown>),
  });
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
}

interface RouteStat {
  count: number;
  errors: number;
  totalMs: number;
  maxMs: number;
}

interface TrackedError {
  at: string;
  route: string;
  code: string;
  message: string;
}

export interface AlertRecord {
  at: string;
  severity: 'WARNING' | 'CRITICAL';
  source: string;
  message: string;
}

class MetricsRegistry {
  private readonly routes = new Map<string, RouteStat>();
  private readonly recentErrors: TrackedError[] = [];
  private readonly alerts: AlertRecord[] = [];
  private readonly counters = new Map<string, number>();
  private readonly startedAt = Date.now();

  public recordRequest(route: string, statusCode: number, durationMs: number): void {
    const s = this.routes.get(route) ?? { count: 0, errors: 0, totalMs: 0, maxMs: 0 };
    s.count += 1;
    s.totalMs += durationMs;
    s.maxMs = Math.max(s.maxMs, durationMs);
    if (statusCode >= 500) s.errors += 1;
    this.routes.set(route, s);
  }

  public increment(counter: string, by = 1): void {
    this.counters.set(counter, (this.counters.get(counter) ?? 0) + by);
  }

  public trackError(route: string, code: string, message: string): void {
    this.recentErrors.unshift({
      at: new Date().toISOString(),
      route,
      code,
      message: String(redactSensitive(message)),
    });
    this.recentErrors.length = Math.min(this.recentErrors.length, 50);
    this.increment('errors.total');
  }

  public raiseAlert(severity: AlertRecord['severity'], source: string, message: string): void {
    const last = this.alerts[0];
    if (last && last.source === source && last.message === message && Date.now() - Date.parse(last.at) < 60_000) {
      return;
    }
    this.alerts.unshift({ at: new Date().toISOString(), severity, source, message });
    this.alerts.length = Math.min(this.alerts.length, 100);
    logEvent(severity === 'CRITICAL' ? 'error' : 'warn', 'alert raised', { source, message });
  }

  public snapshot() {
    const routes = [...this.routes.entries()].map(([route, s]) => ({
      route,
      count: s.count,
      errors: s.errors,
      avgMs: Math.round(s.totalMs / Math.max(1, s.count)),
      maxMs: Math.round(s.maxMs),
    }));
    return {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      requests: {
        total: routes.reduce((a, r) => a + r.count, 0),
        serverErrors: routes.reduce((a, r) => a + r.errors, 0),
        routes: routes.sort((a, b) => b.count - a.count).slice(0, 40),
      },
      counters: Object.fromEntries(this.counters),
      recentErrors: this.recentErrors,
      alerts: this.alerts,
    };
  }
}

export const metrics = new MetricsRegistry();

export function routeKey(method: string, url: string): string {
  const path = sanitizeUrlForLog(url.split('?')[0] ?? url).replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id',
  );
  return `${method} ${path}`;
}
