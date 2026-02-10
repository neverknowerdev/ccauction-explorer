'use client';

import Link from 'next/link';
import BottomNav from '@/components/BottomNav';
import { FormattedPrice } from '@/components/auction/FormattedPrice';

type AuctionStatus = 'created' | 'planned' | 'active' | 'graduated' | 'claimable' | 'ended';

interface Auction {
  id: number;
  tokenTicker: string;
  tokenName: string;
  currentPrice: number;
  raised: number;
  target: number;
  raisedPercent: number;
  timeLeft: string;
  bidders: number;
  image: string;
  status: AuctionStatus;
  currency: string;
}

const mockAuctions: Auction[] = [
  {
    id: 1,
    tokenTicker: 'PUNK',
    tokenName: 'CryptoPunk Token',
    currentPrice: 0.0000025,
    raised: 3.32,
    target: 6.64,
    raisedPercent: 50,
    timeLeft: '22h 00m',
    bidders: 12,
    image: '🎨',
    status: 'active',
    currency: 'ETH',
  },
  {
    id: 2,
    tokenTicker: 'ART',
    tokenName: 'Art Blocks Token',
    currentPrice: 0.00005,
    raised: 0,
    target: 10,
    raisedPercent: 0,
    timeLeft: 'Starts in 3h',
    bidders: 0,
    image: '🖼️',
    status: 'planned',
    currency: 'ETH',
  },
  {
    id: 3,
    tokenTicker: 'APE',
    tokenName: 'Bored Ape Token',
    currentPrice: 0.000065,
    raised: 12.8,
    target: 10,
    raisedPercent: 128,
    timeLeft: 'Ended',
    bidders: 24,
    image: '🦍',
    status: 'ended',
    currency: 'ETH',
  },
];

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

export default function LiveAuctionsExamplePage() {
  const activeCount = mockAuctions.filter(a => a.status === 'active').length;

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">Auctions (Example)</h1>
          <p className="text-white/80 text-sm mt-1">
            {activeCount} active · {mockAuctions.length} total
          </p>
        </header>

        {/* Content */}
        <main className="px-6 py-6 space-y-4">
          {mockAuctions.map((auction) => (
            <Link
              key={auction.id}
              href={`/examples/auction/${auction.id}`}
              className="block bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors"
            >
              <div className="flex gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                  {auction.image}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white truncate">{auction.tokenTicker}</h3>
                      <p className="text-white/60 text-xs truncate">{auction.tokenName}</p>
                    </div>
                    <StatusBadge status={auction.status} />
                  </div>

                  {/* Progress bar */}
                  <div className="my-2">
                    <RaisedProgressMini percent={auction.raisedPercent} />
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
                      <p className="text-white font-medium">{auction.raised} {auction.currency}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/50 text-xs">
                        {(auction.status === 'ended' || auction.status === 'claimable' || auction.status === 'graduated') ? 'Status' : 'Time'}
                      </p>
                      <p className={`font-medium ${auction.status === 'active' ? 'text-green-300' :
                        auction.status === 'planned' ? 'text-blue-300' :
                          'text-white/70'
                        }`}>
                        {auction.timeLeft}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
