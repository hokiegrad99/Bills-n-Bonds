import { AlertTriangle, RefreshCcw, KeyRound, WifiOff, ServerCrash } from 'lucide-react';
import { useRates } from '../../lib/rates-cache';
import { cn } from '../../lib/cn';
import type { FetchErrorKind } from '../../lib/types';

/**
 * Global banner that surfaces whenever `rates.isSynthetic === true`.
 * Renders nothing otherwise. Lives in AppShell so every routed page
 * inherits the same disclaimer without per-page wiring.
 *
 * Shows different guidance depending on the error kind:
 * - `no-api-key`  → instructions to add VITE_FRED_API_KEY
 * - `transient`   → server issue, auto-retry in progress
 * - `network`     → connectivity issue
 * - `permanent`   → generic fallback
 */
export function ApiFallbackBanner() {
  const { rates, loading, refresh } = useRates();
  if (!rates.isSynthetic) return null;

  // Defensive: even if a future caller sets isSynthetic=true with only
  // the auctions feed in syntheticFeeds, suppress the banner here too.
  // The auctions feed is permanently synthetic (see fetchRecentAuctions
  // TSDoc) and surfacing it on every refresh was user-disruptive.
  const synth = rates.syntheticFeeds ?? [];
  if (synth.length > 0 && synth.every((f) => f === 'auctions')) return null;

  const kind = rates.errorKind;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'border-b',
        kind === 'no-api-key'
          ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
          : kind === 'network'
            ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 text-orange-900 dark:text-orange-100'
            : kind === 'transient'
              ? 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100'
              : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100',
        'px-4 md:px-6 py-2.5',
        'flex items-start gap-3',
      )}
    >
      <ErrorIcon kind={kind} />
      <div className="flex-1 min-w-0 text-sm leading-snug">
        <ErrorMessage kind={kind} reason={rates.fallbackReason} />
      </div>
      {kind !== 'no-api-key' && (
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded',
            'bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'transition-colors',
          )}
        >
          <RefreshCcw size={12} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Retrying…' : 'Retry live fetch'}
        </button>
      )}
    </div>
  );
}

function ErrorIcon({ kind }: { kind: FetchErrorKind | undefined }) {
  const cls = 'shrink-0 mt-0.5';
  switch (kind) {
    case 'no-api-key':
      return <KeyRound size={16} className={cls} />;
    case 'network':
      return <WifiOff size={16} className={cls} />;
    case 'transient':
      return <ServerCrash size={16} className={cls} />;
    default:
      return <AlertTriangle size={16} className={cls} />;
  }
}

function ErrorMessage({ kind, reason }: { kind: FetchErrorKind | undefined; reason?: string }) {
  switch (kind) {
    case 'no-api-key':
      return (
        <>
          <strong>Yield data requires a free FRED API key.</strong>{' '}
          Nominal and TIPS yield curves cannot be fetched without it.{' '}
          <a
            href="https://fred.stlouisfed.org/docs/api/api_key.html"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium hover:opacity-80"
          >
            Get a free key
          </a>{' '}
          and add{' '}
          <code className="font-mono text-xs px-1 py-0.5 rounded bg-black/10 dark:bg-white/10">
            VITE_FRED_API_KEY=your_key
          </code>{' '}
          to your <code>.env</code> file.{' '}
          <em>Auction data from Treasury may still load.</em>
        </>
      );
    case 'network':
      return (
        <>
          <strong>Cannot reach data servers.</strong>{' '}
          Check your internet connection. The app will auto-retry when connectivity returns.{' '}
          <em>Using modeled reference data in the meantime.</em>
        </>
      );
    case 'transient':
      return (
        <>
          <strong>A data server is temporarily unavailable.</strong>{' '}
          Retrying automatically — live data should return shortly.{' '}
          <em>Using modeled reference data in the meantime.</em>
        </>
      );
    default:
      return (
        <>
          <strong>Some Treasury data is modeled.</strong>{' '}
          Yield curves are sourced from the St. Louis Fed (FRED) when
          available; auction data is fetched live from Treasury when
          available.{' '}
          <em>Not safe for trading or tax-related decisions.</em>
          {reason && (
            <div className="mt-1.5 font-mono text-xs opacity-80 break-words">
              <span className="font-semibold">Last error:</span> {reason}
            </div>
          )}
        </>
      );
  }
}
