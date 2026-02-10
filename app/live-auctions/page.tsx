'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { FormattedPrice } from '@/components/auction/FormattedPrice';
import { TokenAvatar } from '@/components/auction/TokenAvatar';
import type { AuctionListItem, AuctionStats, AuctionStatus } from '@/lib/auctions/types';
import { formatFdv } from '@/app/helpers/auction-view-helpers';

function StatusBadge({ status }: { status: AuctionStatus }) {
  const config: Record<AuctionStatus, { bg: string; text: string; label: string; pulse?: boolean }> = {
    created: { bg: 'bg-gray-500/30', text: 'text-gray-200', label: 'Created' },
    planned: { bg: 'bg-blue-500/30', text: 'text-blue-200', label: 'Upcoming' },
    active: { bg: 'bg-green-500/30', text: 'text-green-200', label: 'Live', pulse: true },
    graduated: { bg: 'bg-emerald-500/30', text: 'text-emerald-200', label: 'Graduated' },
    claimable: { bg: 'bg-amber-500/30', text: 'text-amber-200', label: 'Claimable' },
    ended: { bg: 'bg-gray-500/30', text: 'text-gray-200', label: 'Ended' },
  };

  const { bg, text, label, pulse } = config[status];

  return (
    <span className={`${bg} ${text} text-xs px-2 py-1 rounded flex items-center gap-1`}>
      {pulse && <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />}
      {label}
    </span>
  );
}

const CHAIN_META: Record<number, { label: string; logoSrc: string }> = {
  1: { label: 'Ethereum', logoSrc: '/chains/ethereum.svg' },
  11155111: { label: 'Ethereum Sepolia', logoSrc: '/chains/ethereum.svg' },
  8453: { label: 'Base', logoSrc: '/chains/base.svg' },
  84532: { label: 'Base Sepolia', logoSrc: '/chains/base.svg' },
  42161: { label: 'Arbitrum', logoSrc: '/chains/arbitrium.svg' },
};

function ChainBadge({ chainId, chainName }: { chainId: number; chainName: string | null }) {
  const meta = CHAIN_META[chainId];
  const label = meta?.label ?? chainName ?? `Chain ${chainId}`;

  if (!meta) {
    const fallback = chainName ? chainName.slice(0, 4).toUpperCase() : `#${chainId}`;
    return (
      <span className="bg-white/20 text-white text-[10px] px-2 py-1 rounded-full uppercase tracking-wide">
        {fallback}
      </span>
    );
  }

  return (
    <img
      src={meta.logoSrc}
      alt={`${label} logo`}
      className="w-8 h-8 object-contain"
      title={label}
      aria-label={label}
    />
  );
}

function RaisedProgressMini({ percent }: { percent: number }) {
  const isOverfunded = percent > 100;
  return (
    <div className="w-full">
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${isOverfunded
            ? 'bg-gradient-to-r from-green-500 to-emerald-400'
            : 'bg-gradient-to-r from-purple-500 to-pink-500'
            }`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getTimeLabel(auction: AuctionListItem): string {
  const now = Date.now();
  const startTime = auction.startTime ? new Date(auction.startTime).getTime() : null;
  const endTime = auction.endTime ? new Date(auction.endTime).getTime() : null;

  if (auction.status === 'ended' || auction.status === 'claimable' || auction.status === 'graduated') {
    return 'Ended';
  }

  if (startTime && startTime > now) {
    return `Starts in ${formatDurationMs(startTime - now)}`;
  }

  if (endTime) {
    return formatDurationMs(endTime - now);
  }

  return 'TBD';
}

function AuctionCard({ auction }: { auction: AuctionListItem }) {
  const raised = auction.raised ?? 0;
  const target = auction.target ?? 0;
  const raisedPercent = target > 0 ? (raised / target) * 100 : 0;
  const timeLeft = getTimeLabel(auction);

  return (
    <Link
      key={auction.id}
      href={`/auction/${auction.id}`}
      className="block bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors"
    >
      <div className="flex gap-4">
        <TokenAvatar
          tokenImage={auction.tokenImage}
          tokenTicker={auction.tokenTicker}
          className="w-full h-full"
          fallbackClassName="w-14 h-14 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <div className="min-w-0">
              <h3 className="font-semibold text-white truncate">{auction.tokenTicker ?? 'Unknown'}</h3>
              <p className="text-white/60 text-xs truncate">{auction.tokenName ?? 'Unknown token'}</p>
            </div>
            <div className="flex items-center gap-2">
              <ChainBadge chainId={auction.chainId} chainName={auction.chainName} />
              <StatusBadge status={auction.status as AuctionStatus} />
            </div>
          </div>

          <div className="my-2">
            <RaisedProgressMini percent={raisedPercent} />
          </div>

          <div className="flex justify-between items-center text-sm">
            <div>
              <p className="text-white/50 text-xs">Price</p>
              <p className="text-white font-medium">
                <FormattedPrice price={auction.currentPrice} />
              </p>
            </div>
            <div className="text-center">
              <p className="text-white/50 text-xs">Raised</p>
              <p className="text-white font-medium">
                {auction.raised != null ? auction.raised.toFixed(2) : '-'} {auction.currency ?? ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-white/50 text-xs">
                {(auction.status === 'ended' || auction.status === 'claimable' || auction.status === 'graduated') ? 'Status' : 'Time'}
              </p>
              <p className={`font-medium ${auction.status === 'active' ? 'text-green-300' :
                auction.status === 'planned' ? 'text-blue-300' :
                  'text-white/70'
                }`}>
                {timeLeft}
              </p>
            </div>
          </div>
          <div className="mt-2 text-right">
            <p className="text-white/45 text-xs">
              Min FDV: <span className="text-white/80">{formatFdv(auction.minimumFdv)}</span>
              {auction.currency ? ` ${auction.currency}` : ''}
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function LiveAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionListItem[]>([]);
  const [plannedAuctions, setPlannedAuctions] = useState<AuctionListItem[]>([]);
  const [activeAuctions, setActiveAuctions] = useState<AuctionListItem[]>([]);
  const [endedAuctions, setEndedAuctions] = useState<AuctionListItem[]>([]);
  const [stats, setStats] = useState<AuctionStats>({
    total: 0,
    totalIncludingTest: 0,
    active: 0,
    ended: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'planned' | 'ended'>('all');
  const [chainFilter, setChainFilter] = useState<'all' | number>('all');
  const [includeBelowThreshold, setIncludeBelowThreshold] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const url = includeBelowThreshold ? '/api/auctions?above_threshold=all' : '/api/auctions';
    fetch(url, { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load auctions (${res.status})`);
        }
        const data = await res.json();
        const planned = (data?.plannedAuctions ?? []) as AuctionListItem[];
        const active = (data?.activeAuctions ?? []) as AuctionListItem[];
        const ended = (data?.endedAuctions ?? []) as AuctionListItem[];
        const all = (data?.auctions ?? [...active, ...planned, ...ended]) as AuctionListItem[];
        return {
          auctions: all,
          plannedAuctions: planned,
          activeAuctions: active,
          endedAuctions: ended,
          stats: (data?.stats ?? {
            total: 0,
            totalIncludingTest: 0,
            active: 0,
            ended: 0,
          }) as AuctionStats,
        };
      })
      .then((data) => {
        if (!isMounted) return;
        setAuctions(data.auctions);
        setPlannedAuctions(data.plannedAuctions);
        setActiveAuctions(data.activeAuctions);
        setEndedAuctions(data.endedAuctions);
        setStats(data.stats);
        setError(null);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        setError(err.message || 'Failed to load auctions');
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [includeBelowThreshold]);

  const filteredSections = useMemo(() => {
    const applyChainFilter = (items: AuctionListItem[]) =>
      chainFilter === 'all' ? items : items.filter((a) => a.chainId === chainFilter);

    const live = applyChainFilter(activeAuctions);
    const planned = applyChainFilter(plannedAuctions);
    const ended = applyChainFilter(endedAuctions);

    if (statusFilter === 'live') return { live, planned: [], ended: [] };
    if (statusFilter === 'planned') return { live: [], planned, ended: [] };
    if (statusFilter === 'ended') return { live: [], planned: [], ended };
    return { live, planned, ended };
  }, [activeAuctions, plannedAuctions, endedAuctions, statusFilter, chainFilter]);

  const totalFilteredAuctions = filteredSections.live.length
    + filteredSections.planned.length
    + filteredSections.ended.length;

  const chainOptions = useMemo(() => {
    const ids = Array.from(new Set(auctions.map(a => a.chainId)));
    return ids.map((id) => ({
      id,
      name: auctions.find(a => a.chainId === id)?.chainName ?? `Chain ${id}`,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [auctions]);

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Auctions</h1>
            <p className="text-white/80 text-sm mt-1">
              {stats.totalIncludingTest} auctions total · {stats.active} active
            </p>
          </div>
        </header>

        {/* Content */}
        <main className="px-6 py-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              {(['all', 'live', 'planned', 'ended'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${statusFilter === filter
                    ? 'bg-white text-purple-900'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                    }`}
                >
                  {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
            <select
              value={chainFilter}
              onChange={(event) => {
                const value = event.target.value;
                setChainFilter(value === 'all' ? 'all' : Number(value));
              }}
              className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              <option value="all">All chains</option>
              {chainOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBelowThreshold}
              onChange={(e) => setIncludeBelowThreshold(e.target.checked)}
              className="rounded border-white/30 bg-white/10 text-purple-500 focus:ring-purple-500"
            />
            Include below-threshold auctions
          </label>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
            </div>
          )}

          {!loading && error && (
            <div className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 text-red-200 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && totalFilteredAuctions === 0 && (
            <div className="text-center text-white/70 py-10">No auctions found.</div>
          )}

          {!loading && !error && filteredSections.live.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-white/80 text-xs uppercase tracking-wide">Live</h2>
              {filteredSections.live.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </section>
          )}

          {!loading && !error && (statusFilter === 'all' || statusFilter === 'planned') && (
            <section className="space-y-3 pt-2">
              <h2 className="text-white/80 text-xs uppercase tracking-wide">Planned</h2>
              {filteredSections.planned.length > 0 ? (
                filteredSections.planned.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} />
                ))
              ) : (
                <p className="text-white/45 text-xs leading-relaxed normal-case tracking-normal">
                  There are no planned auctions yet, but they can appear at any time!
                </p>
              )}
            </section>
          )}

          {!loading && !error && filteredSections.ended.length > 0 && (
            <section className="space-y-3 pt-2">
              <h2 className="text-white/80 text-xs uppercase tracking-wide">Ended</h2>
              {filteredSections.ended.map((auction) => (
                <AuctionCard key={auction.id} auction={auction} />
              ))}
            </section>
          )}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
