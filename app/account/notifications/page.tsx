'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { useMiniApp } from '@/contexts/MiniAppContext';

function Toggle({ label, checked, onChange, disabled }: { label: string, checked: boolean, onChange: (val: boolean) => void, disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className={`text-sm font-medium ${disabled ? 'text-white/50' : 'text-white'}`}>{label}</span>
      <button
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-green-500' : 'bg-gray-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        disabled={disabled}
      >
        <span
          className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { walletAddress, requestFarcasterNotifications, isMiniApp, isLoading: isWalletLoading } = useMiniApp();

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [channels, setChannels] = useState({
    push: false,      // "Web Notifications" or "Mini-App Notifications"
    email: false,
    telegram: false,
  });
  const [filters, setFilters] = useState({
    minRaisedAmount: '',
    minFdv: '',
    maxFdv: '',
  });

  // Fetch preferences when wallet is connected
  useEffect(() => {
    if (walletAddress) {
      fetchPreferences();
    }
  }, [walletAddress]);

  const fetchPreferences = async () => {
    setIsLoadingData(true);
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: { 'x-wallet-address': walletAddress! }
      });
      if (res.ok) {
        const data = await res.json();
        const prefs = data.preferences || {};
        const enabled = prefs.enabledChannels || [];

        // Map backend channels to UI state
        // 'web_push', 'farcaster', 'baseapp' -> 'push' toggle
        const hasPush = enabled.includes('web_push') || enabled.includes('farcaster') || enabled.includes('baseapp');

        setChannels({
          push: hasPush,
          email: enabled.includes('email'),
          telegram: enabled.includes('telegram'),
        });

        setFilters({
          minRaisedAmount: prefs.minRaisedAmount || '',
          minFdv: prefs.minFdv || '',
          maxFdv: prefs.maxFdv || '',
        });
      }
    } catch (err) {
      console.error('Failed to load preferences', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handlePushToggle = async (enabled: boolean) => {
    if (!walletAddress) return;

    if (enabled) {
      if (isMiniApp) {
        // Mini-App Flow
        if (requestFarcasterNotifications) {
          const success = await requestFarcasterNotifications();
          if (success) setChannels(p => ({ ...p, push: true }));
          else alert('Failed to enable Mini-App notifications');
        } else {
          // Fallback or BaseApp specific check if needed
          setChannels(p => ({ ...p, push: true }));
        }
      } else {
        // Web Flow
        if (!('Notification' in window)) {
          alert('This browser does not support desktop notification');
          return;
        }

        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        if (permission === 'granted') {
          try {
            const sw = await navigator.serviceWorker.ready;
            let sub = await sw.pushManager.getSubscription();
            if (!sub) {
              const res = await fetch('/api/notifications/vapid-public-key');
              const { publicKey } = await res.json();
              if (!publicKey) throw new Error('VAPID key missing');

              sub = await sw.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
              });
            }

            // Register subscription
            await fetch('/api/notifications/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-wallet-address': walletAddress
              },
              body: JSON.stringify({ webPushSubscription: sub })
            });

            setChannels(p => ({ ...p, push: true }));
          } catch (e) {
            console.error(e);
            alert('Failed to subscribe to push notifications');
          }
        } else {
          alert('Permission denied. Please enable notifications in your browser settings.');
        }
      }
    } else {
      setChannels(p => ({ ...p, push: false }));
    }
  };

  const savePreferences = async () => {
    if (!walletAddress) return;

    // Map UI 'push' back to specific backend channels based on context
    const enabledChannels = [];
    if (channels.email) enabledChannels.push('email');
    if (channels.telegram) enabledChannels.push('telegram');

    if (channels.push) {
      if (isMiniApp) {
        // For MiniApp, we might enable 'farcaster' AND 'baseapp' generally,
        // or rely on what tokens we have. For simplicity, enable both flags.
        enabledChannels.push('farcaster');
        enabledChannels.push('baseapp');
      } else {
        enabledChannels.push('web_push');
      }
    }

    try {
      await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': walletAddress
        },
        body: JSON.stringify({
          enabledChannels,
          minRaisedAmount: filters.minRaisedAmount || null,
          minFdv: filters.minFdv || null,
          maxFdv: filters.maxFdv || null,
          chainIds: null
        })
      });
      alert('Preferences saved!');
      // Reload/Refresh data to ensure consistency
      fetchPreferences();
    } catch (err) {
      alert('Failed to save settings');
    }
  };

  const isLocked = !walletAddress;

  if (isWalletLoading) return <div className="p-6 text-white text-center">Loading...</div>;

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-xl font-bold text-white">Notifications</h1>
      </header>

      <main className="px-6 py-6 space-y-8">
        {isLocked && (
          <div className="bg-yellow-500/20 text-yellow-200 p-4 rounded-xl border border-yellow-500/30 text-sm">
            Please connect your wallet to manage notifications.
          </div>
        )}

        {/* Channels Section */}
        <section className={isLocked ? 'opacity-50 pointer-events-none' : ''}>
          <h2 className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-4">Channels</h2>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 divide-y divide-white/10">
            <Toggle
              label={isMiniApp ? "Mini-App Notifications" : "Web Notifications"}
              checked={channels.push}
              onChange={handlePushToggle}
            />
            <Toggle
              label="Email"
              checked={channels.email}
              onChange={(v) => setChannels(p => ({...p, email: v}))}
              disabled={true} // Still placeholder for verify flow
            />
            <Toggle
              label="Telegram"
              checked={channels.telegram}
              onChange={(v) => setChannels(p => ({...p, telegram: v}))}
              disabled={true}
            />
          </div>
        </section>

        {/* Filters Section */}
        <section className={isLocked ? 'opacity-50 pointer-events-none' : ''}>
          <h2 className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-4">Alert Rules</h2>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 border border-white/20 space-y-4">
            <div>
              <label className="block text-white/80 text-sm mb-1">Min Raised Amount ($)</label>
              <input
                type="number"
                value={filters.minRaisedAmount}
                onChange={(e) => setFilters(p => ({...p, minRaisedAmount: e.target.value}))}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                placeholder="e.g. 1000"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white/80 text-sm mb-1">Min FDV ($)</label>
                <input
                  type="number"
                  value={filters.minFdv}
                  onChange={(e) => setFilters(p => ({...p, minFdv: e.target.value}))}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                  placeholder="Min"
                />
              </div>
              <div>
                <label className="block text-white/80 text-sm mb-1">Max FDV ($)</label>
                <input
                  type="number"
                  value={filters.maxFdv}
                  onChange={(e) => setFilters(p => ({...p, maxFdv: e.target.value}))}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-500"
                  placeholder="Max"
                />
              </div>
            </div>
          </div>
        </section>

        <button
          onClick={savePreferences}
          disabled={isLocked || isLoadingData}
          className={`w-full font-bold py-3 rounded-xl transition-colors shadow-lg ${isLocked ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/50'}`}
        >
          {isLoadingData ? 'Saving...' : 'Save Preferences'}
        </button>
      </main>

      <BottomNav />
    </div>
  );
}
