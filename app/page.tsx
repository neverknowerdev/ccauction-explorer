'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import AppIcon from '@/components/AppIcon';
import { AuctionCard } from '@/components/auction/AuctionCard';
import { useMiniApp } from '@/contexts/MiniAppContext';
import type { AuctionListItem, AuctionStats } from '@/lib/auctions/types';
import { getLatestEthPriceUsdCached } from '@/app/helpers/auction-view-helpers';

function formatRaised(value: string): string {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toFixed(2);
}

const defaultStats: AuctionStats = {
  total: 0,
  totalIncludingTest: 0,
  active: 0,
  ended: 0,
  graduated: 0,
  failed: 0,
  totalBids: 0,
  totalRaised: '0',
};

// Mock notification preferences (UI-only)
const MOCK_NOTIFICATION_PREFS = [
  { label: 'Every new auction', enabled: true },
  { label: 'Raised more than $50', enabled: true },
  { label: 'FDV between $10K-$100K', enabled: false },
  { label: 'Only Base chain', enabled: false },
];

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
      <p className="text-white/70 text-xs mb-1">{label}</p>
      <p className={`text-xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
    </div>
  );
}

function NotificationPill({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
        enabled
          ? 'bg-green-500/20 text-green-300 border border-green-500/30'
          : 'bg-white/10 text-white/50 border border-white/10'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${enabled ? 'bg-green-400' : 'bg-white/30'}`} />
      {label}
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const { username } = useMiniApp();

  const [stats, setStats] = useState<AuctionStats>(defaultStats);
  const [liveAuctions, setLiveAuctions] = useState<AuctionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem('hasSeenOnboarding');
    if (!seen) {
      router.push('/onboarding');
    } else {
      setHasSeenOnboarding(true);
    }
    setNotificationsEnabled(localStorage.getItem('notificationsEnabled') === 'true');
  }, [router]);

  useEffect(() => {
    if (!hasSeenOnboarding) return;
    let isMounted = true;
    setLoading(true);
    fetch('/api/auctions', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setStats((data?.stats as AuctionStats) ?? defaultStats);
        const active = (data?.activeAuctions ?? []) as AuctionListItem[];
        setLiveAuctions(active.slice(0, 5));
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [hasSeenOnboarding]);

  useEffect(() => {
    let isMounted = true;
    getLatestEthPriceUsdCached()
      .then((v) => { if (isMounted) setEthPriceUsd(v); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  if (!hasSeenOnboarding) return null;

  const handleEnableNotifications = () => {
    localStorage.setItem('notificationsEnabled', 'true');
    setNotificationsEnabled(true);
  };

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

        <main className="px-6 py-6 space-y-6">
          {/* Stats Block */}
          <section>
            <h2 className="text-white/80 text-xs uppercase tracking-wide mb-3">Stats</h2>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  <StatCard label="Total" value={stats.total} />
                  <StatCard label="Live" value={stats.active} accent="text-green-300" />
                  <StatCard label="Graduated" value={stats.graduated} accent="text-emerald-300" />
                  <StatCard label="Failed" value={stats.failed} accent="text-red-300" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Total Bids" value={stats.totalBids} />
                  <StatCard label="Total Raised" value={formatRaised(stats.totalRaised)} />
                </div>
              </>
            )}
          </section>

          {/* Top Live Auctions */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white/80 text-xs uppercase tracking-wide">Live Auctions</h2>
              {liveAuctions.length > 0 && (
                <Link
                  href="/live-auctions"
                  className="text-xs text-purple-300 hover:text-purple-200 transition-colors"
                >
                  Show more
                </Link>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
              </div>
            ) : liveAuctions.length > 0 ? (
              <div className="space-y-3">
                {liveAuctions.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} ethPriceUsd={ethPriceUsd} />
                ))}
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 text-center">
                <div className="text-3xl mb-3">
                  <svg className="w-10 h-10 mx-auto text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-white/70 text-sm mb-1">No live auctions right now</p>
                <p className="text-white/50 text-xs">
                  We&apos;ll notify you as soon as a new auction is created!
                </p>
              </div>
            )}
          </section>

          {/* Notifications Block */}
          <section>
            <h2 className="text-white/80 text-xs uppercase tracking-wide mb-3">Notifications</h2>

            {!notificationsEnabled ? (
              <div className="bg-gradient-to-br from-purple-500/30 to-pink-500/20 backdrop-blur-md rounded-xl p-5 border border-purple-500/30">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    <svg className="w-6 h-6 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-sm mb-1">Don&apos;t miss any auctions!</h3>
                    <p className="text-white/70 text-xs leading-relaxed mb-3">
                      Auctions can appear at any time. Enable notifications to be the first to know when a new auction goes live.
                    </p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleEnableNotifications}
                        className="bg-white text-purple-900 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-white/90 transition-colors"
                      >
                        Enable notifications
                      </button>
                      <Link
                        href="/account"
                        className="text-xs text-purple-300 hover:text-purple-200 transition-colors underline underline-offset-2"
                      >
                        Learn more
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-md rounded-xl p-5 border border-white/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <span className="text-white text-sm font-medium">Notifications enabled</span>
                  </div>
                  <Link
                    href="/account"
                    className="text-xs text-purple-300 hover:text-purple-200 transition-colors"
                  >
                    Edit settings
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  {MOCK_NOTIFICATION_PREFS.map((pref) => (
                    <NotificationPill key={pref.label} label={pref.label} enabled={pref.enabled} />
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
