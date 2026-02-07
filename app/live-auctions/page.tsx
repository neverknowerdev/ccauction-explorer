'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import type { AuctionListItem, AuctionStatus } from '@/lib/auctions/types';

// Price display component with subscript notation
function FormattedPrice({ price, className = '' }: { price: number | null; className?: string }) {
  if (price == null) return <span className={className}>-</span>;
  if (price === 0) return <span className={className}>0</span>;
  if (price >= 0.001) {
    return <span className={className}>{price >= 1 ? price.toFixed(4) : price.toFixed(6)}</span>;
  }

  const str = price.toFixed(18);
  const match = str.match(/^0\.(0*)([1-9]\d*)/);

  if (!match) return <span className={className}>{price.toFixed(6)}</span>;

  const leadingZeros = match[1].length;
  const significantDigits = match[2].slice(0, 4);

  if (leadingZeros >= 4) {
    return (
      <span className={className}>
        0.0<sub className="text-[0.7em] opacity-70">{leadingZeros}</sub>{significantDigits}
      </span>
    );
  }

  return <span className={className}>{price.toFixed(leadingZeros + 4)}</span>;
}

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

const CHAIN_META: Record<number, { label: string; color: string }> = {
  1: { label: 'ETH', color: 'bg-gray-700/60 text-gray-100' },
  8453: { label: 'BASE', color: 'bg-blue-600/70 text-white' },
  84532: { label: 'BASE', color: 'bg-blue-600/50 text-white' },
  42161: { label: 'ARB', color: 'bg-sky-600/70 text-white' },
};

function ChainBadge({ chainId, chainName }: { chainId: number; chainName: string | null }) {
  const meta = CHAIN_META[chainId];
  const label = meta?.label ?? (chainName ? chainName.slice(0, 4).toUpperCase() : `#${chainId}`);
  const color = meta?.color ?? 'bg-white/20 text-white';

  return (
    <span className={`${color} text-[10px] px-2 py-1 rounded-full uppercase tracking-wide`}>
      {label}
    </span>
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

export default function LiveAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'planned' | 'ended'>('all');
  const [chainFilter, setChainFilter] = useState<'all' | number>('all');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetch('/api/auctions', { cache: 'no-store' })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load auctions (${res.status})`);
        }
        const data = await res.json();
        return (data?.auctions ?? []) as AuctionListItem[];
      })
      .then((data) => {
        if (!isMounted) return;
        setAuctions(data);
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
  }, []);

  const activeCount = useMemo(
    () => auctions.filter(a => a.status === 'active').length,
    [auctions]
  );

  const filteredAuctions = useMemo(() => {
    let result = auctions;
    if (statusFilter === 'live') {
      result = result.filter(a => a.status === 'active');
    } else if (statusFilter === 'planned') {
      result = result.filter(a => a.status === 'planned' || a.status === 'created');
    } else if (statusFilter === 'ended') {
      result = result.filter(a => a.status === 'ended' || a.status === 'claimable' || a.status === 'graduated');
    }
    if (chainFilter !== 'all') {
      result = result.filter(a => a.chainId === chainFilter);
    }
    return result;
  }, [auctions, statusFilter, chainFilter]);

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
              {activeCount} active · {auctions.length} total
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

          {!loading && !error && filteredAuctions.length === 0 && (
            <div className="text-center text-white/70 py-10">No auctions found.</div>
          )}

          {!loading && !error && filteredAuctions.map((auction) => {
            const raised = auction.raised ?? 0;
            const target = auction.target ?? 0;
            const raisedPercent = target > 0 ? (raised / target) * 100 : 0;
            const timeLeft = getTimeLabel(auction);
            const tokenImage = auction.tokenImage ?? (auction.tokenTicker ? auction.tokenTicker[0] : '🪙');

            return (
              <Link
                key={auction.id}
                href={`/auction/${auction.id}`}
                className="block bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors"
              >
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                    {tokenImage}
                  </div>
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

                    {/* Progress bar */}
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
                  </div>
                </div>
              </Link>
            );
          })}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
