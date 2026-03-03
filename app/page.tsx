'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import AppIcon from '@/components/AppIcon';
import { useMiniApp } from '@/contexts/MiniAppContext';
import type { AuctionListItem, AuctionStats } from '@/lib/auctions/types';
import { TokenAvatar } from '@/components/auction/TokenAvatar';
import { FormattedPrice } from '@/components/auction/FormattedPrice';
import { useNotifications } from '@/hooks/useNotifications';

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatFunds(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border flex flex-col gap-1 ${accent
          ? 'bg-purple-500/20 border-purple-400/30'
          : 'bg-white/10 border-white/20'
        }`}
    >
      <p className="text-white/60 text-xs leading-tight">{label}</p>
      <p className="text-white font-bold text-xl leading-tight">{value}</p>
    </div>
  );
}

// ─── Mini auction card ───────────────────────────────────────────────────────

function LiveAuctionCard({ auction }: { auction: AuctionListItem }) {
  const raised = auction.raised ?? 0;
  const target = auction.target ?? 0;
  const percent = target > 0 ? Math.min((raised / target) * 100, 100) : 0;
  const endMs = auction.endTime ? new Date(auction.endTime).getTime() - Date.now() : null;
  const timeLeft = endMs != null && endMs > 0 ? formatDurationMs(endMs) : 'Ending soon';

  return (
    <Link
      href={`/auction/${auction.id}`}
      className="block bg-white/10 border border-white/20 rounded-xl p-4 hover:bg-white/20 transition-colors"
    >
      <div className="flex gap-3 items-start">
        <TokenAvatar
          tokenImage={auction.tokenImage}
          tokenTicker={auction.tokenTicker}
          className="w-full h-full"
          fallbackClassName="w-12 h-12 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate text-sm">
                {auction.tokenTicker ?? 'Unknown'}
              </h3>
              <p className="text-white/50 text-xs truncate">{auction.tokenName ?? ''}</p>
            </div>
            <span className="flex items-center gap-1 bg-green-500/20 border border-green-400/30 text-green-300 text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse inline-block" />
              Live
            </span>
          </div>

          {/* Progress bar */}
          <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex justify-between text-xs text-white/60">
            <span>
              Raised:{' '}
              <span className="text-white font-medium">
                {auction.raised != null ? auction.raised.toFixed(2) : '-'}{' '}
                {auction.currency ?? ''}
              </span>
            </span>
            <span>
              <span className="text-green-300 font-medium">{timeLeft}</span> left
            </span>
          </div>

          <div className="mt-1 text-xs text-white/50">
            Price:{' '}
            <span className="text-white/80 font-medium">
              <FormattedPrice price={auction.currentPrice} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── Notification block ──────────────────────────────────────────────────────

function NotificationBlock() {
  const { state, requesting, request } = useNotifications();

  if (state === 'unknown') return null;

  // Already granted — small confirmation strip
  if (state === 'granted') {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🔔</span>
          <p className="text-white/60 text-sm">Notifications enabled</p>
        </div>
        <Link
          href="/account/notifications"
          className="text-purple-300 text-xs font-medium hover:text-purple-200 transition-colors whitespace-nowrap"
        >
          Settings →
        </Link>
      </div>
    );
  }

  // Browser has permanently blocked — instruct user
  if (state === 'denied') {
    return (
      <div className="bg-orange-500/10 border border-orange-400/20 rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="text-base">🔕</span>
        <p className="text-white/60 text-xs leading-relaxed">
          Notifications blocked in browser settings. Enable them to get alerts for new auctions.
        </p>
      </div>
    );
  }

  // Unsupported browser
  if (state === 'unsupported') {
    return (
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
        <span className="text-base">🔔</span>
        <p className="text-white/50 text-xs">Push notifications not supported in this browser.</p>
      </div>
    );
  }

  // Default: idle — show the prompt
  return (
    <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/10 border border-purple-400/30 rounded-xl p-4">
      <div className="flex gap-3 items-start mb-3">
        <span className="text-2xl">🔔</span>
        <div className="flex-1">
          <h3 className="text-white font-semibold text-sm mb-1">Don't miss new auctions!</h3>
          <p className="text-white/60 text-xs leading-relaxed">
            Get instant push notifications when a new auction goes live — right in your browser or Farcaster client.
          </p>
        </div>
      </div>
      <button
        onClick={request}
        disabled={requesting}
        className="w-full bg-purple-500 hover:bg-purple-400 active:bg-purple-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors text-white font-semibold text-sm rounded-lg py-2.5"
      >
        {requesting ? 'Requesting…' : 'Enable Notifications'}
      </button>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const { username } = useMiniApp();

  // Auction data
  const [activeAuctions, setActiveAuctions] = useState<AuctionListItem[]>([]);
  const [stats, setStats] = useState<AuctionStats>({
    total: 0,
    totalIncludingTest: 0,
    active: 0,
    ended: 0,
  });
  const [totalBids, setTotalBids] = useState<number>(0);
  const [totalRaised, setTotalRaised] = useState<number>(0);
  const [loadingData, setLoadingData] = useState(true);

  // Onboarding check
  useEffect(() => {
    const seen = localStorage.getItem('hasSeenOnboarding');
    if (!seen) {
      router.push('/onboarding');
    } else {
      setHasSeenOnboarding(true);
    }
  }, [router]);

  // Fetch auction data
  useEffect(() => {
    let isMounted = true;
    setLoadingData(true);

    fetch('/api/auctions', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const active = (data?.activeAuctions ?? []) as AuctionListItem[];
        const ended = (data?.endedAuctions ?? []) as AuctionListItem[];
        const planned = (data?.plannedAuctions ?? []) as AuctionListItem[];

        setActiveAuctions(active.slice(0, 5));
        setStats(
          data?.stats ?? {
            total: 0,
            totalIncludingTest: 0,
            active: 0,
            ended: 0,
          }
        );

        const all = [...active, ...ended, ...planned];
        const bids = all.reduce((sum, a) => sum + (a.bidders ?? 0), 0);
        const raised = all.reduce((sum, a) => sum + (a.raised ?? 0), 0);
        setTotalBids(bids);
        setTotalRaised(raised);
      })
      .catch(() => {/* silent */ })
      .finally(() => {
        if (isMounted) setLoadingData(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!hasSeenOnboarding) return null;

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <AppIcon size={40} />
            <div>
              <h1 className="text-xl font-bold text-white">CCA Auctions</h1>
              <p className="text-white/80 text-sm">
                Welcome back{username ? `, ${username}` : ''}!
              </p>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="px-4 py-5 space-y-5">
          {/* ── Stats ─────────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-white/70 text-xs uppercase tracking-wider mb-3 px-1">Overview</h2>
            {loadingData ? (
              <div className="grid grid-cols-2 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-16 rounded-xl bg-white/5 border border-white/10 animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Total Auctions" value={stats.total} />
                <StatCard label="Active Now" value={stats.active} accent />
                <StatCard label="Graduated / Ended" value={stats.ended} />
                <StatCard label="Total Bids" value={totalBids} />
                <div className="col-span-2">
                  <StatCard
                    label="Total Funds Raised"
                    value={`${formatFunds(totalRaised)} ETH`}
                  />
                </div>
              </div>
            )}
          </section>

          {/* ── Notification block ─────────────────────────────────────────── */}
          <section>
            <NotificationBlock />
          </section>

          {/* ── Top-5 live auctions ────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-white/70 text-xs uppercase tracking-wider">
                Live Auctions
              </h2>
              <Link
                href="/live-auctions"
                className="text-purple-300 text-xs font-medium hover:text-purple-200 transition-colors"
              >
                View all →
              </Link>
            </div>

            {loadingData ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl bg-white/5 border border-white/10 animate-pulse"
                  />
                ))}
              </div>
            ) : activeAuctions.length > 0 ? (
              <div className="space-y-3">
                {activeAuctions.map((auction) => (
                  <LiveAuctionCard key={auction.id} auction={auction} />
                ))}
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-xl px-5 py-8 text-center">
                <p className="text-3xl mb-3">🔨</p>
                <p className="text-white font-semibold text-sm mb-1">No ongoing auctions</p>
                <p className="text-white/50 text-xs leading-relaxed">
                  No auctions are live right now, but they can appear at any moment.{' '}
                  <span className="text-purple-300">Don't miss it!</span>
                </p>
              </div>
            )}
          </section>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
