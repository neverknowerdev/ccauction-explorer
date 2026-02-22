'use client';

import { useEffect, useMemo, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import { AuctionCard } from '@/components/auction/AuctionCard';
import type { AuctionListItem, AuctionStats } from '@/lib/auctions/types';
import { getLatestEthPriceUsdCached } from '@/app/helpers/auction-view-helpers';

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
    graduated: 0,
    failed: 0,
    totalBids: 0,
    totalRaised: '0',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'planned' | 'ended'>('all');
  const [chainFilter, setChainFilter] = useState<'all' | number>('all');
  const [includeBelowThreshold, setIncludeBelowThreshold] = useState(false);
  const [showTestnets, setShowTestnets] = useState(false);
  const [ethPriceUsd, setEthPriceUsd] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    const params = new URLSearchParams();
    if (includeBelowThreshold) params.set('above_threshold', 'all');
    if (showTestnets) params.set('exclude_testnets', 'false');
    const query = params.toString();
    const url = query ? `/api/auctions?${query}` : '/api/auctions';
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
            graduated: 0,
            failed: 0,
            totalBids: 0,
            totalRaised: '0',
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
  }, [includeBelowThreshold, showTestnets]);

  useEffect(() => {
    let isMounted = true;
    getLatestEthPriceUsdCached()
      .then((value) => {
        if (isMounted) setEthPriceUsd(value);
      })
      .catch(() => {
        if (isMounted) setEthPriceUsd(null);
      });
    return () => {
      isMounted = false;
    };
  }, []);

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
          <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
            <input
              type="checkbox"
              checked={showTestnets}
              onChange={(e) => setShowTestnets(e.target.checked)}
              className="rounded border-white/30 bg-white/10 text-purple-500 focus:ring-purple-500"
            />
            Show testnets
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
                <AuctionCard key={auction.id} auction={auction} ethPriceUsd={ethPriceUsd} />
              ))}
            </section>
          )}

          {!loading && !error && (statusFilter === 'all' || statusFilter === 'planned') && (
            <section className="space-y-3 pt-2">
              <h2 className="text-white/80 text-xs uppercase tracking-wide">Planned</h2>
              {filteredSections.planned.length > 0 ? (
                filteredSections.planned.map((auction) => (
                  <AuctionCard key={auction.id} auction={auction} ethPriceUsd={ethPriceUsd} />
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
                <AuctionCard key={auction.id} auction={auction} ethPriceUsd={ethPriceUsd} />
              ))}
            </section>
          )}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
