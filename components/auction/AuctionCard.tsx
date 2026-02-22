'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { FormattedPrice } from '@/components/auction/FormattedPrice';
import { TokenAvatar } from '@/components/auction/TokenAvatar';
import type { AuctionListItem, AuctionStatus } from '@/lib/auctions/types';
import { convertFdvToUsd, formatFdv } from '@/app/helpers/auction-view-helpers';

export function StatusBadge({ status }: { status: AuctionStatus }) {
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

export const CHAIN_META: Record<number, { label: string; logoSrc: string }> = {
  1: { label: 'Ethereum', logoSrc: '/chains/ethereum.svg' },
  11155111: { label: 'Ethereum Sepolia', logoSrc: '/chains/ethereum.svg' },
  8453: { label: 'Base', logoSrc: '/chains/base.svg' },
  84532: { label: 'Base Sepolia', logoSrc: '/chains/base.svg' },
  42161: { label: 'Arbitrum', logoSrc: '/chains/arbitrium.svg' },
};

export function ChainBadge({ chainId, chainName }: { chainId: number; chainName: string | null }) {
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

export function RaisedProgressMini({ percent }: { percent: number }) {
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

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getTimeLabel(auction: AuctionListItem): string {
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

export function AuctionCard({
  auction,
  ethPriceUsd,
}: {
  auction: AuctionListItem;
  ethPriceUsd: number | null;
}) {
  const raised = auction.raised ?? 0;
  const target = auction.target ?? 0;
  const raisedPercent = target > 0 ? (raised / target) * 100 : 100;
  const timeLeft = getTimeLabel(auction);

  const minimumFdvUsd = useMemo(
    () => convertFdvToUsd(auction.minimumFdv, auction.currency, ethPriceUsd),
    [auction.minimumFdv, auction.currency, ethPriceUsd]
  );
  const currentFdvUsd = useMemo(
    () => convertFdvToUsd(auction.currentFdv, auction.currency, ethPriceUsd),
    [auction.currentFdv, auction.currency, ethPriceUsd]
  );

  const fdvDisplay = useMemo(() => {
    const min = minimumFdvUsd;
    const current = currentFdvUsd;
    const formatUsd = (value: number | null) => (value == null ? null : `$${formatFdv(value)}`);
    const minText = formatUsd(min);
    const currentText = formatUsd(current);

    if (auction.status === 'planned') {
      return minText == null ? 'FDV min: -' : `FDV min: ${minText}`;
    }

    if (auction.status === 'active') {
      if (minText != null && currentText != null) {
        if (minText === currentText) {
          return `FDV min/current: ${minText}`;
        }
        return `FDV min: ${minText} current: ${currentText}`;
      }
      if (minText != null) return `FDV min: ${minText}`;
      if (currentText != null) return `FDV current: ${currentText}`;
      return 'FDV min/current: -';
    }

    if (
      auction.status === 'ended' ||
      auction.status === 'claimable' ||
      auction.status === 'graduated'
    ) {
      if (minText != null && currentText != null) {
        if (minText === currentText) {
          return `FDV min/final: ${minText}`;
        }
        return `FDV min: ${minText} final: ${currentText}`;
      }
      if (minText != null) return `FDV min: ${minText}`;
      if (currentText != null) return `FDV final: ${currentText}`;
      return 'FDV min/final: -';
    }

    return minText == null ? 'FDV min: -' : `FDV min: ${minText}`;
  }, [auction.status, minimumFdvUsd, currentFdvUsd]);

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
              {auction.isTestnet && (
                <span className="bg-amber-500/30 text-amber-200 text-[10px] px-2 py-1 rounded uppercase tracking-wide">
                  testnet
                </span>
              )}
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
              <span className="text-white/80">{fdvDisplay}</span>
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}
