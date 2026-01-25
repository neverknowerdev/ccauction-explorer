'use client';

import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import AppIcon from '@/components/AppIcon';
import { useMiniApp } from '@/contexts/MiniAppContext';
import { formatWalletAddress } from '@/utils/format';

export default function AccountPage() {
  const router = useRouter();
  const { username, walletAddress, profilePicture } = useMiniApp();

  const handleResetOnboarding = () => {
    localStorage.removeItem('hasSeenOnboarding');
    router.push('/onboarding');
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4">
          <h1 className="text-2xl font-bold text-white">Account</h1>
        </header>

        {/* Content */}
        <main className="px-6 py-6 space-y-6">
          {/* Profile Section */}
          <div className="bg-white/20 backdrop-blur-md rounded-xl p-6 border border-white/30 text-center">
            <div className="flex justify-center mb-4">
              {profilePicture ? (
                <img
                  src={profilePicture}
                  alt={username || 'Profile'}
                  className="w-20 h-20 rounded-full object-cover border-2 border-white/30"
                />
              ) : (
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                  <AppIcon size={50} />
                </div>
              )}
            </div>
            {username && (
              <h2 className="text-xl font-bold text-white mb-2">{username}</h2>
            )}
            <p className="text-white/90 text-base font-mono mb-1">
              {walletAddress ? formatWalletAddress(walletAddress) : 'Not connected'}
            </p>
            {walletAddress && (
              <p className="text-white/60 text-xs font-mono break-all">
                {walletAddress}
              </p>
            )}
            <p className="text-white/70 text-xs mt-1">Connected Wallet</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 text-center">
              <p className="text-2xl font-bold text-white mb-1">8</p>
              <p className="text-white/70 text-xs">Active Bids</p>
            </div>
            <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 text-center">
              <p className="text-2xl font-bold text-white mb-1">3</p>
              <p className="text-white/70 text-xs">Won</p>
            </div>
            <div className="bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 text-center">
              <p className="text-2xl font-bold text-white mb-1">12</p>
              <p className="text-white/70 text-xs">Total Bids</p>
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-3">
            <button className="w-full bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">Wallet Settings</p>
                  <p className="text-white/70 text-sm">Manage your wallet</p>
                </div>
                <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button className="w-full bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">Notification Preferences</p>
                  <p className="text-white/70 text-sm">Customize alerts</p>
                </div>
                <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button className="w-full bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors text-left">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">Help & Support</p>
                  <p className="text-white/70 text-sm">Get assistance</p>
                </div>
                <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>

            <button
              onClick={handleResetOnboarding}
              className="w-full bg-white/20 backdrop-blur-md rounded-xl p-4 border border-white/30 hover:bg-white/30 transition-colors text-left"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">About</p>
                  <p className="text-white/70 text-sm">View onboarding</p>
                </div>
                <svg className="w-5 h-5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
