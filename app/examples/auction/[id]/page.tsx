'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';

// Types
interface TokenSupplyInfo {
  totalSupply: number;
  auctionSupply: number;
  poolSupply: number;
  creatorRetained: number;
}

interface Bid {
  id: string;
  maxPrice: number;
  amount: number;
  amountUsd: number;
  filledPercent: number;
  isUserBid: boolean;
}

interface AuctionData {
  id: string;
  // Token Info
  tokenTicker: string;
  tokenName: string;
  tokenDescription: string;
  tokenWebsite: string;
  tokenImage: string;
  tokenDecimals: number;
  supplyInfo: TokenSupplyInfo;

  // Auction Info
  status: 'created' | 'planned' | 'active' | 'graduated' | 'claimable' | 'ended';
  startTime: Date;
  endTime: Date;

  // Price Info
  floorPrice: number;
  currentClearingPrice: number;
  maxBidPrice: number;

  // Raised Info
  raisedAmount: number;
  targetAmount: number;

  // Extra funds destination (null when not set in DB, e.g. legacy rows)
  extraFundsDestination: 'pool' | 'creator' | null;

  // Bids
  bids: Bid[];

  // Currency
  currency: string;
}

// Mock auction data
const mockAuctions: Record<string, AuctionData> = {
  '1': {
    id: '1',
    tokenTicker: 'PUNK',
    tokenName: 'CryptoPunk Token',
    tokenDescription: 'CryptoPunk Token is the native token of the CryptoPunk ecosystem, enabling governance, staking rewards, and exclusive access to community features.',
    tokenWebsite: 'https://cryptopunks.app',
    tokenImage: '🎨',
    tokenDecimals: 18,
    supplyInfo: {
      totalSupply: 1_000_000_000,
      auctionSupply: 500_000_000,
      poolSupply: 300_000_000,
      creatorRetained: 200_000_000,
    },
    status: 'active' as const,
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    endTime: new Date(Date.now() + 22 * 60 * 60 * 1000), // 22 hours from now
    floorPrice: 0.000001,
    currentClearingPrice: 0.0000025,
    maxBidPrice: 0.00001,
    raisedAmount: 3.32,
    targetAmount: 6.64,
    extraFundsDestination: 'pool',
    currency: 'ETH',
    bids: [
      { id: '1', maxPrice: 0.00003, amount: 0.5, amountUsd: 1500, filledPercent: 100, isUserBid: true },
      { id: '2', maxPrice: 0.000025, amount: 1.2, amountUsd: 3600, filledPercent: 85, isUserBid: false },
      { id: '3', maxPrice: 0.000008, amount: 0.3, amountUsd: 900, filledPercent: 45, isUserBid: true },
      { id: '4', maxPrice: 0.000005, amount: 0.8, amountUsd: 2400, filledPercent: 20, isUserBid: false },
      { id: '5', maxPrice: 0.000002, amount: 0.52, amountUsd: 1560, filledPercent: 0, isUserBid: false },
    ],
  },
  '2': {
    id: '2',
    tokenTicker: 'ART',
    tokenName: 'Art Blocks Token',
    tokenDescription: 'Art Blocks Token powers the generative art revolution. Stake for exclusive drops, vote on curated selections, and participate in artist grants.',
    tokenWebsite: 'https://artblocks.io',
    tokenImage: '🖼️',
    tokenDecimals: 18,
    supplyInfo: {
      totalSupply: 100_000_000,
      auctionSupply: 40_000_000,
      poolSupply: 40_000_000,
      creatorRetained: 20_000_000,
    },
    status: 'planned' as const,
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
    endTime: new Date(Date.now() + 27 * 60 * 60 * 1000), // 27 hours from now
    floorPrice: 0.00005,
    currentClearingPrice: 0.00005,
    maxBidPrice: 0.0002,
    raisedAmount: 0,
    targetAmount: 10,
    extraFundsDestination: 'creator',
    currency: 'ETH',
    bids: [],
  },
  '3': {
    id: '3',
    tokenTicker: 'APE',
    tokenName: 'Bored Ape Token',
    tokenDescription: 'The official Bored Ape community token. Access exclusive events, merch drops, and member-only experiences in the metaverse.',
    tokenWebsite: 'https://boredapeyachtclub.com',
    tokenImage: '🦍',
    tokenDecimals: 18,
    supplyInfo: {
      totalSupply: 500_000_000,
      auctionSupply: 200_000_000,
      poolSupply: 200_000_000,
      creatorRetained: 100_000_000,
    },
    status: 'ended',
    startTime: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
    endTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
    floorPrice: 0.00002,
    currentClearingPrice: 0.000065,
    maxBidPrice: 0.0001,
    raisedAmount: 12.8,
    targetAmount: 10,
    extraFundsDestination: 'pool',
    currency: 'ETH',
    bids: [
      { id: '1', maxPrice: 0.0001, amount: 2.5, amountUsd: 7500, filledPercent: 100, isUserBid: false },
      { id: '2', maxPrice: 0.00008, amount: 3.2, amountUsd: 9600, filledPercent: 100, isUserBid: true },
      { id: '3', maxPrice: 0.00007, amount: 4.1, amountUsd: 12300, filledPercent: 100, isUserBid: false },
      { id: '4', maxPrice: 0.00006, amount: 3.0, amountUsd: 9000, filledPercent: 60, isUserBid: false },
    ],
  },
};

// Utility functions
function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(decimals) + 'B';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(decimals) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(decimals) + 'K';
  return num.toFixed(decimals);
}

// Subscript digits for crypto price formatting
const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

function toSubscript(num: number): string {
  return num.toString().split('').map(d => SUBSCRIPT_DIGITS[parseInt(d)]).join('');
}

/**
 * Format price in crypto-standard notation
 * - Normal: 0.01303, 0.0005720
 * - Collapsed zeros: 0.0₄7466 (means 0.00007466, subscript shows zero count)
 */
function formatPrice(price: number): string {
  if (price === 0) return '0';
  if (price >= 1) return price.toFixed(4);
  if (price >= 0.001) return price.toFixed(6);

  // For very small numbers, count leading zeros after decimal
  const str = price.toFixed(18); // Max precision
  const match = str.match(/^0\.(0*)([1-9]\d*)/);

  if (!match) return price.toFixed(6);

  const leadingZeros = match[1].length;
  const significantDigits = match[2].slice(0, 4); // Keep 4 significant digits

  // If 4 or more leading zeros, use subscript notation
  if (leadingZeros >= 4) {
    return `0.0${toSubscript(leadingZeros)}${significantDigits}`;
  }

  // Otherwise show normally with appropriate precision
  return price.toFixed(leadingZeros + 4);
}

// Component version for better styling control
function FormattedPrice({ price, className = '' }: { price: number; className?: string }) {
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

function formatTimeRemaining(endTime: Date): string {
  const now = new Date();
  const diff = endTime.getTime() - now.getTime();

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(start: Date, end: Date): string {
  const diff = end.getTime() - start.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h`;
}

// Components
function StatusBadge({ status }: { status: AuctionData['status'] }) {
  const config: Record<AuctionData['status'], { bg: string; text: string; label: string }> = {
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

function SupplyDistributionChart({ supplyInfo }: { supplyInfo: TokenSupplyInfo }) {
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

function TimelineProgress({ startTime, endTime, status }: { startTime: Date; endTime: Date; status: AuctionData['status'] }) {
  const now = new Date();
  const totalDuration = endTime.getTime() - startTime.getTime();
  const elapsed = Math.max(0, now.getTime() - startTime.getTime());
  const isDone = status === 'ended' || status === 'claimable' || status === 'graduated';
  const progress = status === 'planned' || status === 'created' ? 0 : isDone ? 100 : Math.min(100, (elapsed / totalDuration) * 100);

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
        {status === 'active' && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg border-2 border-green-400 transition-all duration-500"
            style={{ left: `calc(${progress}% - 10px)` }}
          />
        )}
      </div>

      {status === 'active' && (
        <div className="text-center">
          <span className="text-white/70 text-sm">Time Remaining: </span>
          <span className="text-white font-semibold">{formatTimeRemaining(endTime)}</span>
        </div>
      )}
    </div>
  );
}

function PriceSlider({ floorPrice, currentPrice, maxPrice, userBidPrice }: {
  floorPrice: number;
  currentPrice: number;
  maxPrice: number;
  userBidPrice?: number;
}) {
  const range = maxPrice - floorPrice;
  const currentPercent = ((currentPrice - floorPrice) / range) * 100;
  const userBidPercent = userBidPrice ? ((userBidPrice - floorPrice) / range) * 100 : null;

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
            title={`Your bid: ${formatPrice(userBidPrice!)}`}
          />
        )}
      </div>

      <div className="flex justify-between text-sm">
        <FormattedPrice price={floorPrice} className="text-white font-medium" />
        <div className="text-center">
          <FormattedPrice price={currentPrice} className="text-yellow-400 font-bold" />
          <span className="text-white/70 ml-1">current</span>
        </div>
        <FormattedPrice price={maxPrice} className="text-white font-medium" />
      </div>
    </div>
  );
}

function RaisedProgress({ raised, target, currency }: {
  raised: number;
  target: number;
  currency: string;
}) {
  const percent = Math.min(100, (raised / target) * 100);
  const isOverfunded = raised > target;

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <span className="text-white/70 text-sm">Raised</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{raised.toFixed(2)}</span>
            <span className="text-white/70">{currency}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-white/70 text-sm">Target</span>
          <div className="flex items-baseline gap-2 justify-end">
            <span className="text-lg font-medium text-white/70">{target.toFixed(2)}</span>
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
          <span>Overfunded by {((raised - target) / target * 100).toFixed(0)}%!</span>
        </div>
      )}
    </div>
  );
}

function BidRow({ bid, currency, onCancel }: { bid: Bid; currency: string; onCancel: (id: string) => void }) {
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
          {bid.amount} {currency} (${formatNumber(bid.amountUsd, 0)})
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

export default function AuctionDetailExamplePage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [newBidAmount, setNewBidAmount] = useState('');
  const [newBidPrice, setNewBidPrice] = useState('');

  // Find highest user bid price for the price slider
  const userBidPrice = useMemo(() => {
    if (!auction) return undefined;
    const userBids = auction.bids.filter(b => b.isUserBid);
    if (userBids.length === 0) return undefined;
    return Math.max(...userBids.map(b => b.maxPrice));
  }, [auction]);

  useEffect(() => {
    // Simulate loading auction data
    setLoading(true);
    setTimeout(() => {
      const data = mockAuctions[auctionId];
      setAuction(data || null);
      setLoading(false);
    }, 500);
  }, [auctionId]);

  const handleCancelBid = (bidId: string) => {
    if (!auction) return;
    // In real app, this would call a contract
    setAuction({
      ...auction,
      bids: auction.bids.filter(b => b.id !== bidId),
    });
  };

  const handleNewBid = () => {
    if (!auction || !newBidAmount || !newBidPrice) return;

    const amount = parseFloat(newBidAmount);
    const price = parseFloat(newBidPrice);

    if (isNaN(amount) || isNaN(price) || amount <= 0 || price <= 0) {
      alert('Please enter valid bid amount and price');
      return;
    }

    // In real app, this would call a contract
    const newBid: Bid = {
      id: Date.now().toString(),
      maxPrice: price,
      amount: amount,
      amountUsd: amount * 3000, // Mock ETH price
      filledPercent: 0,
      isUserBid: true,
    };

    setAuction({
      ...auction,
      bids: [...auction.bids, newBid].sort((a, b) => b.maxPrice - a.maxPrice),
    });

    setNewBidAmount('');
    setNewBidPrice('');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-white rounded-full" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <span className="text-6xl">🔍</span>
        <h1 className="text-xl font-semibold text-white">Auction not found</h1>
        <button
          onClick={() => router.push('/examples/live-auctions')}
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
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-2xl">
                {auction.tokenImage}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{auction.tokenTicker}</h1>
                <p className="text-white/60 text-sm">{auction.tokenName}</p>
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
                  <span className="text-white font-semibold">{formatNumber(auction.supplyInfo.totalSupply)}</span>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <span className="text-white/60 text-xs block">At Auction</span>
                  <span className="text-white font-semibold">{formatNumber(auction.supplyInfo.auctionSupply)}</span>
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
                  <FormattedPrice price={auction.floorPrice} /> {auction.currency}
                </span>
              </div>

              {/* Description */}
              <div className="pt-2 border-t border-white/10">
                <span className="text-white/70 text-sm block mb-2">Description</span>
                <p className="text-white/90 text-sm leading-relaxed">{auction.tokenDescription}</p>
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
              raised={auction.raisedAmount}
              target={auction.targetAmount}
              currency={auction.currency}
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
              <span className="text-white/60 text-sm">{auction.bids.length} total</span>
            </div>

            {/* New Bid Form */}
            {auction.status === 'active' && (
              <div className="mb-4 p-4 bg-white/10 rounded-lg border border-white/20">
                <div className="flex gap-3 mb-3">
                  <div className="flex-1">
                    <label className="text-white/70 text-xs block mb-1">Amount ({auction.currency})</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newBidAmount}
                      onChange={(e) => setNewBidAmount(e.target.value)}
                      placeholder="0.1"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 text-sm"
                    />
                  </div>
                  <div className="flex-1">
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
                </div>
                <button
                  onClick={handleNewBid}
                  disabled={!newBidAmount || !newBidPrice}
                  className="w-full bg-white/30 hover:bg-white/40 disabled:bg-white/10 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Place Bid
                </button>
              </div>
            )}

            {/* Bids List */}
            <div className="space-y-2">
              {auction.bids.length === 0 ? (
                <div className="text-center py-8">
                  <span className="text-4xl block mb-2">🎯</span>
                  <p className="text-white/60">No bids yet</p>
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
                  {auction.bids.map((bid) => (
                    <BidRow
                      key={bid.id}
                      bid={bid}
                      currency={auction.currency}
                      onCancel={handleCancelBid}
                    />
                  ))}
                </>
              )}
            </div>
          </section>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
