import { AlertTriangle, KeyRound, WifiOff, ServerCrash } from 'lucide-react';
import { useRates } from '../../lib/rates-cache';
import { cn } from '../../lib/cn';
import type { FetchErrorKind } from '../../lib/types';

/**
 * Global banner that surfaces whenever `rates.isSynthetic === true` AND
 * at least one non-auctions feed is synthetic. Renders nothing otherwise.
 * Lives in AppShell so every routed page inherits the same disclaimer
 * without per-page wiring.
 *
 * As of 2026-07-03 the auctions feed is permanently disabled
 * (Cloudflare↔Treasury SSL + missing ACAO on Treasury's API). The
 * `syntheticFeeds.every(f === 'auctions')` rule below keeps the banner
 * silent for that case so users aren't nagged on every refresh.
 *
 * The previous "Retry live fetch" button was removed in the same
 * commit: with the auctions fetch permanently disabled there's no
 * point for end-users to manually retry. Auto-refresh still runs on
 * the 6-hour cycle in `rates-cache.tsx`.
 *
 * Shows different guidance depending on the error kind:
 * - `no-api-key`  → instructions to add VITE_FRED_API_KEY
 * - `transient`   → server issue, auto-retry in progress
 * - `network`     → connectivity issue
 * - `permanent`   → generic fallback
 */
export function ApiFallbackBanner() {
  const { rates } = useRates();
  if (!rates.isSynthetic) return null;

  // Suppress the banner when ONLY the auctions feed is synthetic. The
  // auctions feed is permanently synthetic (see fetchRecentAuctions
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
          <strong>Live yield-curve data is unavailable.</strong>{' '}
          The FRED-sourced nominal and TIPS yield curves are feeding from
          modeled reference values (auction data is always modeled as of
          2026-07-03 while Treasury's CORS policy is blocked).{' '}
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
