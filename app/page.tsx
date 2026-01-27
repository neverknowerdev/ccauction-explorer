'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AppIcon from '@/components/AppIcon';
import { useMiniApp } from '@/contexts/MiniAppContext';

export default function HomePage() {
  const router = useRouter();
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);
  const { username } = useMiniApp();

  useEffect(() => {
    const seen = localStorage.getItem('hasSeenOnboarding');
    if (!seen) {
      router.push('/onboarding');
    } else {
      setHasSeenOnboarding(true);
    }
  }, [router]);

  if (!hasSeenOnboarding) {
    return null;
  }

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
        <main className="px-6 py-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
              <p className="text-white/80 text-sm mb-1">Active Auctions</p>
              <p className="text-2xl font-bold text-white">24</p>
            </div>
            <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30">
              <p className="text-white/80 text-sm mb-1">Your Bids</p>
              <p className="text-2xl font-bold text-white">8</p>
            </div>
          </div>

          {/* Featured Auctions */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Featured Auctions</h2>
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-semibold text-white">Auction #{item}</h3>
                      <p className="text-white/70 text-sm">Collection Name</p>
                    </div>
                    <span className="bg-green-500/30 text-green-200 text-xs px-2 py-1 rounded">
                      Live
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <div>
                      <p className="text-white/60 text-xs">Current Bid</p>
                      <p className="text-white font-semibold">0.5 ETH</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/60 text-xs">Time Left</p>
                      <p className="text-white font-semibold">2h 15m</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Quick Actions */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => router.push('/create-auction')}
                className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors text-white text-left"
              >
                <p className="font-semibold mb-1">Create Auction</p>
                <p className="text-xs text-white/70">Start your own</p>
              </button>
              <button className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors text-white text-left">
                <p className="font-semibold mb-1">Browse All</p>
                <p className="text-xs text-white/70">See everything</p>
              </button>
            </div>
          </section>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
