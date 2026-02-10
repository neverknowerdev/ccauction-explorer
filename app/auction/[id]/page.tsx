'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import BottomNav from '@/components/BottomNav';
import type { AuctionBid, AuctionDetail } from '@/lib/auctions/types';
import { ccaAuctionAbi } from '@/lib/contracts/abis';
import { priceToQ96 } from '@/lib/contracts/encoder';

// Utility functions
function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(decimals) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(decimals) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(decimals) + 'K';
  return num.toFixed(decimals);
}

function formatAmount(num: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

// Component version for better styling control
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

function formatPriceLabel(price: number | null): string {
  if (price == null) return '-';
  if (price === 0) return '0';
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.001) return price.toFixed(6);

  const str = price.toFixed(18);
  const match = str.match(/^0\.(0*)([1-9]\d*)/);
  if (!match) return price.toFixed(6);

  const leadingZeros = match[1].length;
  const significantDigits = match[2].slice(0, 4);
  return `0.${'0'.repeat(leadingZeros)}${significantDigits}`;
}

function formatTimeRemaining(endTime: string | null): string {
  if (!endTime) return 'TBD';
  const end = new Date(endTime);
  const now = new Date();
  const diff = end.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(date: string | null): string {
  if (!date) return 'TBD';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return 'TBD';
  const diff = new Date(end).getTime() - new Date(start).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

function TokenAvatar({ tokenImage, tokenTicker }: { tokenImage: string | null; tokenTicker: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = tokenTicker ? tokenTicker[0] : '🪙';
  const shouldRenderImage = !!tokenImage && !imageFailed && /^https?:\/\//i.test(tokenImage);

  return (
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-2xl overflow-hidden">
      {shouldRenderImage ? (
        <img
          src={tokenImage}
          alt={`${tokenTicker ?? 'Token'} logo`}
          className="w-full h-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        fallback
      )}
    </div>
  );
}

// Components
function StatusBadge({ status }: { status: AuctionDetail['status'] }) {
  const config: Record<AuctionDetail['status'], { bg: string; text: string; label: string }> = {
    created: { bg: 'bg-gray-500/30', text: 'text-gray-200', label: 'Created' },
    planned: { bg: 'bg-blue-500/30', text: 'text-blue-200', label: 'Planned' },
    active: { bg: 'bg-green-500/30', text: 'text-green-200', label: 'Live' },
    graduated: { bg: 'bg-emerald-500/30', text: 'text-emerald-200', label: 'Graduated' },
    claimable: { bg: 'bg-amber-500/30', text: 'text-amber-200', label: 'Claimable' },
    ended: { bg: 'bg-gray-500/30', text: 'text-gray-200', label: 'Ended' },
  };

  const { bg, text, label } = config[status];

  return (
    <span className={`${bg} ${text} text-xs font-medium px-3 py-1 rounded-full flex items-center gap-1.5`}>
      {status === 'active' && (
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
      )}
      {label}
    </span>
  );
}

function SupplyDistributionChart({ supplyInfo }: { supplyInfo: AuctionDetail['supplyInfo'] }) {
  if (!supplyInfo) {
    return <div className="text-white/60 text-sm">Supply info unavailable.</div>;
  }
  const total = supplyInfo.totalSupply;
  const auctionPercent = (supplyInfo.auctionSupply / total) * 100;
  const poolPercent = (supplyInfo.poolSupply / total) * 100;
  const creatorPercent = (supplyInfo.creatorRetained / total) * 100;

  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded-full overflow-hidden">
        <div
          className="bg-purple-500 transition-all duration-500"
          style={{ width: `${auctionPercent}%` }}
          title={`Auction: ${auctionPercent.toFixed(1)}%`}
        />
        <div
          className="bg-blue-500 transition-all duration-500"
          style={{ width: `${poolPercent}%` }}
          title={`Pool: ${poolPercent.toFixed(1)}%`}
        />
        <div
          className="bg-gray-500 transition-all duration-500"
          style={{ width: `${creatorPercent}%` }}
          title={`Creator: ${creatorPercent.toFixed(1)}%`}
        />
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-500" />
          <span className="text-white/70">Auction</span>
          <span className="text-white font-medium">{auctionPercent.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-white/70">Pool</span>
          <span className="text-white font-medium">{poolPercent.toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-gray-500" />
          <span className="text-white/70">Creator</span>
          <span className="text-white font-medium">{creatorPercent.toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

function TimelineProgress({ startTime, endTime, status }: { startTime: string | null; endTime: string | null; status: AuctionDetail['status'] }) {
  if (!startTime || !endTime) {
    return <div className="text-white/60 text-sm">Timeline unavailable.</div>;
  }
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = Math.max(0, now.getTime() - start.getTime());
  const isDone = status === 'ended' || status === 'claimable' || status === 'graduated' || now >= end;
  const progress = isDone
    ? 100
    : status === 'planned' || status === 'created'
      ? 0
      : Math.min(100, (elapsed / totalDuration) * 100);
  const showEndedLabel = now >= end;
  const statusLabel = showEndedLabel ? 'Ended' : status === 'planned' || status === 'created' ? 'Upcoming' : 'Live';

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center text-sm">
        <div className="text-white/70">
          <span className="block text-xs">Start</span>
          <span className="text-white font-medium">{formatDate(startTime)}</span>
        </div>
        <div className="text-center">
          <span className="block text-xs text-white/70">Duration</span>
          <span className="text-white font-medium">{formatDuration(startTime, endTime)}</span>
        </div>
        <div className="text-right text-white/70">
          <span className="block text-xs">End</span>
          <span className="text-white font-medium">{formatDate(endTime)}</span>
        </div>
      </div>
      <div className={`text-center text-xs font-medium ${showEndedLabel ? 'text-gray-300' : 'text-white/70'}`}>
        {statusLabel}
      </div>

      <div className="relative">
        <div className="h-3 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${status === 'active' ? 'bg-gradient-to-r from-green-500 to-green-400' :
              isDone ? 'bg-gradient-to-r from-gray-500 to-gray-400' :
                'bg-gradient-to-r from-blue-500 to-blue-400'
              }`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {status === 'active' && !showEndedLabel && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg border-2 border-green-400 transition-all duration-500"
            style={{ left: `calc(${progress}% - 10px)` }}
          />
        )}
      </div>

      {status === 'active' && !showEndedLabel && (
        <div className="text-center">
          <span className="text-white/70 text-sm">Time Remaining: </span>
          <span className="text-white font-semibold">{formatTimeRemaining(endTime)}</span>
        </div>
      )}
      {showEndedLabel && (
        <div className="text-center text-gray-300 text-sm font-semibold">Auction Ended</div>
      )}
    </div>
  );
}

function PriceSlider({ floorPrice, currentPrice, maxPrice, userBidPrice }: {
  floorPrice: number | null;
  currentPrice: number | null;
  maxPrice: number | null;
  userBidPrice?: number;
}) {
  const safeFloor = floorPrice ?? 0;
  const safeCurrent = currentPrice ?? safeFloor;
  const safeMax = maxPrice ?? safeCurrent;
  const range = Math.max(1e-12, safeMax - safeFloor);
  const currentPercent = ((safeCurrent - safeFloor) / range) * 100;
  const userBidPercent = userBidPrice ? ((userBidPrice - safeFloor) / range) * 100 : null;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-white/70">Floor</span>
        <span className="text-white/70">Max Bid</span>
      </div>

      <div className="relative h-8">
        {/* Background track */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 bg-white/10 rounded-full" />

        {/* Filled portion to current price */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-3 bg-gradient-to-r from-green-500 to-yellow-500 rounded-full transition-all duration-500"
          style={{ width: `${currentPercent}%` }}
        />

        {/* Current price marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-yellow-400 rounded-full shadow-lg border-2 border-white flex items-center justify-center transition-all duration-500"
          style={{ left: `calc(${currentPercent}% - 12px)` }}
        >
          <span className="text-[8px] font-bold text-yellow-900">$</span>
        </div>

        {/* User bid marker (if exists) */}
        {userBidPercent !== null && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-full shadow-lg border-2 border-white transition-all duration-500"
            style={{ left: `calc(${userBidPercent}% - 8px)` }}
            title={`Your bid: ${formatPriceLabel(userBidPrice ?? null)}`}
          />
        )}
      </div>

      <div className="flex justify-between text-sm">
        <FormattedPrice price={safeFloor} className="text-white font-medium" />
        <div className="text-center">
          <FormattedPrice price={safeCurrent} className="text-yellow-400 font-bold" />
          <span className="text-white/70 ml-1">current</span>
        </div>
        <FormattedPrice price={safeMax} className="text-white font-medium" />
      </div>
    </div>
  );
}

function RaisedProgress({ raised, target, currency }: {
  raised: number | null;
  target: number | null;
  currency: string;
}) {
  const safeRaised = raised ?? 0;
  const safeTarget = target ?? 0;
  const percent = safeTarget > 0 ? Math.min(100, (safeRaised / safeTarget) * 100) : 0;
  const isOverfunded = safeTarget > 0 && safeRaised > safeTarget;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <span className="text-white/70 text-sm">Raised</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{formatAmount(safeRaised, 2)}</span>
            <span className="text-white/70">{currency}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-white/70 text-sm">Target</span>
          <div className="flex items-baseline gap-2 justify-end">
            <span className="text-lg font-medium text-white/70">{formatAmount(safeTarget, 2)}</span>
            <span className="text-white/50">{currency}</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="h-6 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${isOverfunded
              ? 'bg-gradient-to-r from-green-500 via-green-400 to-emerald-400'
              : 'bg-gradient-to-r from-purple-500 to-pink-500'
              }`}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 right-0 pr-3 text-sm font-semibold"
          style={{ color: percent >= 50 ? 'white' : 'rgba(255,255,255,0.7)' }}
        >
          {percent.toFixed(0)}%
        </div>
      </div>

      {isOverfunded && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>Overfunded by {(((safeRaised - safeTarget) / safeTarget) * 100).toFixed(0)}%!</span>
        </div>
      )}
    </div>
  );
}

function BidRow({ bid, currency, onCancel }: { bid: AuctionBid; currency: string; onCancel: (id: string) => void }) {
  return (
    <div className={`flex items-center gap-4 p-3 rounded-lg ${bid.isUserBid ? 'bg-purple-500/20 border border-purple-500/30' : 'bg-white/5'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <FormattedPrice price={bid.maxPrice} className="text-white font-medium" />
          {bid.isUserBid && (
            <span className="text-xs bg-purple-500/30 text-purple-200 px-2 py-0.5 rounded-full">Your bid</span>
          )}
        </div>
        <div className="text-white/60 text-sm">
          {bid.amount != null ? formatAmount(bid.amount, 2) : '-'} {currency}
          {bid.amountUsd != null && ` ($${formatNumber(bid.amountUsd, 0)})`}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Fill progress */}
        <div className="w-16">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${bid.filledPercent === 100 ? 'bg-green-500' :
                bid.filledPercent > 0 ? 'bg-yellow-500' : 'bg-gray-500'
                }`}
              style={{ width: `${bid.filledPercent}%` }}
            />
          </div>
          <span className="text-xs text-white/60">{bid.filledPercent}%</span>
        </div>

        {/* Actions */}
        {bid.isUserBid && bid.filledPercent < 100 && (
          <button
            onClick={() => onCancel(bid.id)}
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-sm rounded-lg transition-colors"
          >
            Cancel
          </button>
        )}
        {bid.filledPercent === 100 && (
          <span className="text-green-400 text-sm font-medium">Filled</span>
        )}
      </div>
    </div>
  );
}

export default function AuctionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { setShowAuthFlow } = useDynamicContext();

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userBids, setUserBids] = useState<AuctionBid[]>([]);
  const [userBidsLoading, setUserBidsLoading] = useState(false);
  const [showBidForm, setShowBidForm] = useState(false);
  const [newBidAmount, setNewBidAmount] = useState('');
  const [newBidPrice, setNewBidPrice] = useState('');
  const [bidError, setBidError] = useState<string | null>(null);
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);

  // Find highest user bid price for the price slider
  const userBidPrice = useMemo(() => {
    if (!userBids.length) return undefined;
    return Math.max(...userBids.map(b => b.maxPrice ?? 0));
  }, [userBids]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/auctions/${auctionId}`, { cache: 'no-store' })
      .then(async (res) => {
        if (res.status === 404) return { auction: null };
        if (!res.ok) throw new Error(`Failed to load auction (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setAuction(data?.auction ?? null);
        setError(null);
      })
      .catch((err: Error) => {
        setError(err.message || 'Failed to load auction');
        setAuction(null);
      })
      .finally(() => setLoading(false));
  }, [auctionId]);

  const fetchUserBids = useCallback(async (wallet?: string) => {
    if (!wallet) {
      setUserBids([]);
      return;
    }
    setUserBidsLoading(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/bids?wallet=${wallet}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load bids (${res.status})`);
      const data = await res.json();
      setUserBids((data?.bids ?? []) as AuctionBid[]);
    } catch {
      setUserBids([]);
    } finally {
      setUserBidsLoading(false);
    }
  }, [auctionId]);

  useEffect(() => {
    fetchUserBids(address);
  }, [address, fetchUserBids]);

  const handleCancelBid = (bidId: string) => {
    if (!auction) return;
    // In real app, this would call a contract
    setUserBids((prev) => prev.filter(b => b.id !== bidId));
  };

  const handleNewBid = async () => {
    if (!auction || !address || !newBidAmount || !newBidPrice) return;

    const amount = parseFloat(newBidAmount);
    const price = parseFloat(newBidPrice);

    if (isNaN(amount) || isNaN(price) || amount <= 0 || price <= 0) {
      setBidError('Please enter valid bid amount and price');
      return;
    }

    try {
      setBidError(null);
      setIsSubmittingBid(true);

      if (chainId !== auction.chainId && switchChainAsync) {
        await switchChainAsync({ chainId: auction.chainId });
      }

      const amountWei = parseUnits(newBidAmount, auction.currencyDecimals ?? 18);
      const priceQ96 = priceToQ96(price);

      const txHash = await writeContractAsync({
        address: auction.address as `0x${string}`,
        abi: ccaAuctionAbi,
        functionName: 'submitBid',
        args: [priceQ96, amountWei, address, '0x'],
        value: amountWei,
      });

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }

      await fetchUserBids(address);
      setShowBidForm(false);
      setNewBidAmount('');
      setNewBidPrice('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit bid';
      setBidError(message);
    } finally {
      setIsSubmittingBid(false);
    }
  };

  const handleAddBidClick = () => {
    if (!address) {
      setShowAuthFlow?.(true);
      return;
    }
    if (auction?.status !== 'active') {
      setShowBidForm(false);
      return;
    }
    setBidError(null);
    setShowBidForm(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    );
  }

  if (!loading && error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-6xl">⚠️</span>
        <h1 className="text-xl font-semibold text-white">Could not load auction</h1>
        <p className="text-white/70 text-sm">{error}</p>
        <button
          onClick={() => router.push('/live-auctions')}
          className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
        >
          View all auctions
        </button>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-6xl">🔍</span>
        <h1 className="text-xl font-semibold text-white">Auction not found</h1>
        <button
          onClick={() => router.push('/live-auctions')}
          className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors"
        >
          View all auctions
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 flex items-center gap-3">
              <TokenAvatar tokenImage={auction.tokenImage} tokenTicker={auction.tokenTicker} />
              <div>
                <h1 className="text-xl font-bold text-white">{auction.tokenTicker ?? 'Unknown'}</h1>
                <p className="text-white/60 text-sm">{auction.tokenName ?? 'Unknown token'}</p>
              </div>
            </div>
            <StatusBadge status={auction.status} />
          </div>
        </header>

        {/* Content */}
        <main className="px-6 py-6 space-y-6">
          {/* Token Info Section */}
          <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>🪙</span> Token Info
            </h2>

            <div className="space-y-4">
              {/* Supply Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-lg p-3">
                  <span className="text-white/60 text-xs block">Total Supply</span>
                  <span className="text-white font-semibold">
                    {auction.supplyInfo ? formatNumber(auction.supplyInfo.totalSupply) : '-'}
                  </span>
                </div>
                <div className="bg-white/10 rounded-lg p-3 relative">
                  <span className="text-white/60 text-xs block">At Auction</span>
                  <span className="text-white font-semibold">
                    {auction.supplyInfo ? formatNumber(auction.supplyInfo.auctionSupply) : '-'}
                  </span>
                  <span className="absolute top-3 right-3 text-white/50 text-xs">
                    {auction.supplyInfo && auction.supplyInfo.totalSupply > 0
                      ? `${((auction.supplyInfo.auctionSupply / auction.supplyInfo.totalSupply) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Supply Distribution */}
              <div>
                <span className="text-white/70 text-sm mb-2 block">Supply Distribution</span>
                <SupplyDistributionChart supplyInfo={auction.supplyInfo} />
              </div>

              {/* Floor Price */}
              <div className="flex justify-between items-center py-2 border-t border-white/10">
                <span className="text-white/70">Floor Price</span>
                <span className="text-white font-semibold">
                  <FormattedPrice price={auction.floorPrice} /> {auction.currency ?? ''}
                </span>
              </div>

              {/* Description */}
              <div className="pt-2 border-t border-white/10">
                <span className="text-white/70 text-sm block mb-2">Description</span>
                <p className="text-white/90 text-sm leading-relaxed">
                  {auction.tokenDescription ?? 'No description available.'}
                </p>
              </div>

              {/* Website */}
              {auction.tokenWebsite && (
                <a
                  href={auction.tokenWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-blue-300 hover:text-blue-200 transition-colors text-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  {auction.tokenWebsite}
                </a>
              )}
            </div>
          </section>

          {/* Auction Timeline Section */}
          <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>⏱️</span> Auction Timeline
            </h2>
            <TimelineProgress
              startTime={auction.startTime}
              endTime={auction.endTime}
              status={auction.status}
            />
          </section>

          {/* Price Section */}
          <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>💰</span> Current Clearing Price
            </h2>
            <PriceSlider
              floorPrice={auction.floorPrice}
              currentPrice={auction.currentClearingPrice}
              maxPrice={auction.maxBidPrice}
              userBidPrice={userBidPrice}
            />
          </section>

          {/* Raised Amount Section */}
          <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <span>📈</span> Amount Raised
            </h2>
            <RaisedProgress
              raised={auction.raised}
              target={auction.target}
              currency={auction.currency ?? ''}
            />
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center gap-2">
              <span className="text-white/70 text-sm">Extra funds go to:</span>
              <span className={`text-sm font-medium px-2 py-0.5 rounded ${(auction.extraFundsDestination ?? 'creator') === 'pool'
                ? 'bg-blue-500/30 text-blue-200'
                : 'bg-purple-500/30 text-purple-200'
                }`}>
                {(auction.extraFundsDestination ?? 'creator') === 'pool' ? '🏊 Liquidity Pool' : '👤 Creator'}
              </span>
            </div>
          </section>

          {/* Bids Section */}
          <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <span>🎯</span> Bids
              </h2>
              <span className="text-white/60 text-sm">{auction.bidders} total</span>
            </div>

            {/* Bids List */}
            <div className="space-y-2">
              {!address ? (
                <div className="text-center py-8">
                  <button
                    onClick={handleAddBidClick}
                    className="w-full max-w-[220px] bg-white text-purple-900 font-semibold py-2.5 rounded-lg shadow-md hover:bg-white/90 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add bid
                  </button>
                  <p className="text-white/60 text-sm mt-3">Connect wallet to add and view your bids</p>
                </div>
              ) : userBidsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-white/30 border-t-white rounded-full" />
                </div>
              ) : userBids.length === 0 ? (
                <div className="text-center py-8">
                  <button
                    onClick={handleAddBidClick}
                    className="w-full max-w-[220px] bg-white text-purple-900 font-semibold py-2.5 rounded-lg shadow-md hover:bg-white/90 transition-colors inline-flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Add bid
                  </button>
                  <p className="text-white/60 text-sm mt-3">No bids yet</p>
                  {auction.status === 'planned' && (
                    <p className="text-white/40 text-sm mt-1">Auction hasn't started</p>
                  )}
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-center gap-4 px-3 py-2 text-xs text-white/50 uppercase tracking-wide">
                    <span className="flex-1">Max Price / Amount</span>
                    <span className="w-16 text-center">Filled</span>
                    <span className="w-16"></span>
                  </div>
                  {userBids.map((bid) => (
                    <BidRow
                      key={bid.id}
                      bid={bid}
                      currency={auction.currency ?? ''}
                      onCancel={handleCancelBid}
                    />
                  ))}
                </>
              )}
            </div>
          </section>
        </main>
      </div>
      {showBidForm && auction.status === 'active' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl bg-[#1b1b24] border border-white/20 p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Place a bid</h3>
              <button
                onClick={() => setShowBidForm(false)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label="Close bid modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-white/70 text-xs block mb-1">Amount ({auction.currency ?? '—'})</label>
                <input
                  type="number"
                  step="0.01"
                  value={newBidAmount}
                  onChange={(e) => setNewBidAmount(e.target.value)}
                  placeholder="0.1"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                />
              </div>
              <div>
                <label className="text-white/70 text-xs block mb-1">Max Price</label>
                <input
                  type="number"
                  step="0.000001"
                  value={newBidPrice}
                  onChange={(e) => setNewBidPrice(e.target.value)}
                  placeholder="0.00001"
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                />
              </div>
              {bidError && (
                <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                  {bidError}
                </div>
              )}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setShowBidForm(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white/80 font-semibold py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewBid}
                disabled={!newBidAmount || !newBidPrice || isSubmittingBid}
                className="flex-1 bg-white text-purple-900 hover:bg-white/90 disabled:bg-white/20 disabled:text-white/50 disabled:cursor-not-allowed font-semibold py-2 rounded-lg transition-colors"
              >
                {isSubmittingBid ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
