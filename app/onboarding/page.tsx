'use client';

import { useRouter } from 'next/navigation';
import AppIcon from '@/components/AppIcon';

export default function OnboardingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="flex flex-col items-center max-w-md w-full">
        {/* Icon */}
        <div className="mb-8">
          <AppIcon size={80} />
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-white mb-4 text-center">
          CCA Auctions Explorer
        </h1>

        {/* Description */}
        <p className="text-white/90 text-center mb-2 text-lg">
          Discover and participate in decentralized auctions
        </p>
        <p className="text-white/80 text-center mb-12 text-sm leading-relaxed">
          Explore live auctions, place bids, and manage your orders all in one place.
          Experience the future of decentralized trading.
        </p>

        {/* Buttons */}
        <div className="w-full space-y-4">
          <button
            onClick={() => {
              localStorage.setItem('hasSeenOnboarding', 'true');
              router.push('/');
            }}
            className="w-full bg-white text-purple-600 font-semibold py-4 px-6 rounded-xl shadow-lg hover:bg-white/95 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Explore
          </button>
          <button
            onClick={() => {
              // Could navigate to a learn more page or show a modal
              alert('Learn more about CCA Auctions coming soon!');
            }}
            className="w-full bg-white/20 text-white font-medium py-4 px-6 rounded-xl border border-white/30 hover:bg-white/30 transition-all"
          >
            Learn more
          </button>
        </div>
      </div>
    </div>
  );
}
