'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { useMiniApp } from '@/contexts/MiniAppContext';

// Simple Toggle Component
function Toggle({ label, checked, onChange, disabled }: { label: string, checked: boolean, onChange: (val: boolean) => void, disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-white text-sm font-medium">{label}</span>
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

export default function NotificationsPage() {
  const router = useRouter();
  const { walletAddress, requestFarcasterNotifications, isMiniApp } = useMiniApp();

  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState<any>({});

  // Channels State
  const [channels, setChannels] = useState({
    email: false,
    telegram: false,
    farcaster: false,
    web_push: false,
    baseapp: false,
  });

  // Filter State
  const [filters, setFilters] = useState({
    minRaisedAmount: '',
    minFdv: '',
    maxFdv: '',
  });

  useEffect(() => {
    if (walletAddress) {
      fetchPreferences();
    } else {
        setIsLoading(false);
    }
  }, [walletAddress]);

  const fetchPreferences = async () => {
    try {
      const res = await fetch('/api/notifications/preferences', {
        headers: { 'x-wallet-address': walletAddress! }
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences(data.preferences || {});

        const enabled = data.preferences?.enabledChannels || [];
        setChannels({
          email: enabled.includes('email'),
          telegram: enabled.includes('telegram'),
          farcaster: enabled.includes('farcaster'),
          web_push: enabled.includes('web_push'),
          baseapp: enabled.includes('baseapp'),
        });

        setFilters({
          minRaisedAmount: data.preferences?.minRaisedAmount || '',
          minFdv: data.preferences?.minFdv || '',
          maxFdv: data.preferences?.maxFdv || '',
        });
      }
    } catch (err) {
      console.error('Failed to load preferences', err);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreferences = async () => {
    const enabledChannels = Object.entries(channels)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    try {
      await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-wallet-address': walletAddress!
        },
        body: JSON.stringify({
          enabledChannels,
          minRaisedAmount: filters.minRaisedAmount || null,
          minFdv: filters.minFdv || null,
          maxFdv: filters.maxFdv || null,
          chainIds: null // All chains for now
        })
      });
      alert('Settings saved!');
    } catch (err) {
      alert('Failed to save settings');
    }
  };

  const handleWebPushToggle = async (enabled: boolean) => {
    if (enabled) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const sw = await navigator.serviceWorker.ready;
        let sub = await sw.pushManager.getSubscription();

        if (!sub) {
          const res = await fetch('/api/notifications/vapid-public-key');
          const { publicKey } = await res.json();
          const convertedKey = urlBase64ToUint8Array(publicKey);

          sub = await sw.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedKey
          });
        }

        await fetch('/api/notifications/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-wallet-address': walletAddress!
          },
          body: JSON.stringify({ webPushSubscription: sub })
        });

        setChannels(prev => ({ ...prev, web_push: true }));
      } else {
        alert('Permission denied');
      }
    } else {
      setChannels(prev => ({ ...prev, web_push: false }));
    }
  };

  const handleFarcasterToggle = async (enabled: boolean) => {
    if (enabled) {
      if (isMiniApp && requestFarcasterNotifications) {
        const success = await requestFarcasterNotifications();
        if (success) {
           setChannels(prev => ({ ...prev, farcaster: true }));
        } else {
           alert('Failed to enable Farcaster notifications');
        }
      } else {
        alert('Only available in Farcaster Mini App');
      }
    } else {
      setChannels(prev => ({ ...prev, farcaster: false }));
    }
  };

  const handleBaseAppToggle = async (enabled: boolean) => {
    // Basic implementation for BaseApp toggle
    // In reality, this would check if we are in Base environment
    // For now, allow enabling if the user selects it, logic handled in service
    setChannels(prev => ({ ...prev, baseapp: enabled }));
  };

  if (isLoading) return <div className="p-6 text-white text-center">Loading...</div>;

  return (
    <div className="min-h-screen pb-20 bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        <h1 className="text-xl font-bold text-white">Notifications</h1>
      </header>

      <main className="px-6 py-6 space-y-8">
        {/* Channels Section */}
        <section>
          <h2 className="text-white/70 text-sm font-semibold uppercase tracking-wider mb-4">Channels</h2>
          <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 divide-y divide-white/10">
            <Toggle
              label="Browser Push"
              checked={channels.web_push}
              onChange={handleWebPushToggle}
            />
            <Toggle
              label="Farcaster"
              checked={channels.farcaster}
              onChange={handleFarcasterToggle}
              disabled={!isMiniApp}
            />
            <Toggle
              label="Base Mini App"
              checked={channels.baseapp}
              onChange={handleBaseAppToggle}
            />
            <Toggle
              label="Email"
              checked={channels.email}
              onChange={(v) => setChannels(p => ({...p, email: v}))}
              disabled={true}
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
        <section>
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
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-colors shadow-lg shadow-purple-900/50"
        >
          Save Preferences
        </button>
      </main>

      <BottomNav />
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
