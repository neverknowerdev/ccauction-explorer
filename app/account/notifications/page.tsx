'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import { useMiniApp } from '@/contexts/MiniAppContext';

function Toggle({ label, checked, onChange, disabled, testId }: { label: string, checked: boolean, onChange: (val: boolean) => void, disabled?: boolean, testId?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className={`text-sm font-medium ${disabled ? 'text-white/40' : 'text-white'}`}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-purple-500' : 'bg-white/20'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        disabled={disabled}
        data-testid={testId}
      >
        <span
          className={`absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </button>
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { walletAddress, requestFarcasterNotifications, isMiniApp } = useMiniApp();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [isBaseApp, setIsBaseApp] = useState(false);

  const [channels, setChannels] = useState({
    email: false,
    telegram: false,
    farcaster: false,
    web_push: false,
    baseapp: false,
  });

  const [filters, setFilters] = useState({
    minRaisedAmount: '50',
    minFdv: '',
    maxFdv: '',
  });

  const [emailInput, setEmailInput] = useState('');
  const [telegramInput, setTelegramInput] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  useEffect(() => {
    setIsBaseApp(typeof window !== 'undefined' && window.navigator.userAgent.includes('Coinbase'));
    if (walletAddress) {
      // Sync any pending web push subscription from before login
      const syncPendingSubscription = async () => {
        try {
          const pending = localStorage.getItem('pending_web_push');
          if (pending) {
            await fetch('/api/notifications/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-wallet-address': walletAddress
              },
              body: JSON.stringify({ webPushSubscription: JSON.parse(pending) })
            });
            localStorage.removeItem('pending_web_push');
          }
        } catch (e) {
          console.error("Failed to sync pending web push sub", e);
        }
      };

      syncPendingSubscription().then(() => fetchPreferences());
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
        const enabled = data.preferences?.enabledChannels || [];
        setChannels({
          email: enabled.includes('email'),
          telegram: enabled.includes('telegram'),
          farcaster: enabled.includes('farcaster'),
          web_push: enabled.includes('web_push'),
          baseapp: enabled.includes('baseapp'),
        });

        setEmailInput(data.settings?.email || '');
        setTelegramInput(data.settings?.telegramChatId || '');
        setIsEmailVerified(data.settings?.emailVerified || false);

        setFilters({
          minRaisedAmount: data.preferences?.minRaisedAmount ?? '50',
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
    setIsSaving(true);
    setSaveStatus('idle');
    const enabledChannels = Object.entries(channels)
      .filter(([_, enabled]) => enabled)
      .map(([key]) => key);

    try {
      const res = await fetch('/api/notifications/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(walletAddress ? { 'x-wallet-address': walletAddress } : {}),
        },
        body: JSON.stringify({
          enabledChannels,
          minRaisedAmount: filters.minRaisedAmount || null,
          minFdv: filters.minFdv || null,
          maxFdv: filters.maxFdv || null,
          chainIds: null,
          email: channels.email ? emailInput : undefined,
          telegramChatId: channels.telegram ? telegramInput : undefined,
        }),
      });
      setSaveStatus(res.ok ? 'ok' : 'error');
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleWebPushToggle = async (enabled: boolean) => {
    if (enabled) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        let sub: PushSubscription | null = null;
        try {
          await navigator.serviceWorker.register('/sw.js');
          const sw = await navigator.serviceWorker.ready;
          let currentSub = await sw.pushManager.getSubscription();

          // Force re-subscription for fresh credentials when re-enabling
          if (currentSub) {
            await currentSub.unsubscribe();
          }

          let applicationServerKey: BufferSource | undefined;
          try {
            const res = await fetch('/api/notifications/vapid-public-key');
            if (res.ok) {
              const { publicKey } = await res.json();
              applicationServerKey = urlBase64ToUint8Array(publicKey);
            }
          } catch { }

          sub = await sw.pushManager.subscribe({
            userVisibleOnly: true,
            ...(applicationServerKey ? { applicationServerKey } : {}),
          });

        } catch (e) {
          console.error("SW Registration failed: ", e);
        }

        if (sub) {
          if (walletAddress) {
            await fetch('/api/notifications/register', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-wallet-address': walletAddress
              },
              body: JSON.stringify({ webPushSubscription: sub.toJSON() })
            });
          } else {
            localStorage.setItem('pending_web_push', JSON.stringify(sub.toJSON()));
          }
        }
        setChannels(prev => ({ ...prev, web_push: true }));
      } else {
        alert('Permission denied');
      }
    } else {
      try {
        const sw = await navigator.serviceWorker.ready;
        const currentSub = await sw.pushManager.getSubscription();
        if (currentSub) await currentSub.unsubscribe();
      } catch (e) {
        console.error("Failed to unsubscribe SW", e);
      }
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
    setChannels(prev => ({ ...prev, baseapp: enabled }));
  };

  if (isLoading) return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        <div className="p-6 text-white text-center">Loading...</div>
      </div>
    </div>
  );

  const isSaveDisabled = !walletAddress || isSaving ||
    (channels.email && !emailInput.trim()) ||
    (channels.telegram && !telegramInput.trim());

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-md mx-auto">
        <header className="bg-white/10 backdrop-blur-md border-b border-white/20 px-6 py-4 flex items-center gap-3">
          <button onClick={() => router.back()} className="text-white/80 hover:text-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-white">Notifications</h1>
        </header>

        <main className="px-4 py-5 space-y-5">
          {!walletAddress && (
            <div className="bg-purple-500/20 border border-purple-500/40 rounded-xl p-4 mb-4 text-center">
              <p className="text-white text-sm">Please connect your wallet to manage your preferences and save settings.</p>
            </div>
          )}

          <section>
            <h2 className="text-white/70 text-xs uppercase tracking-wider mb-3 px-1">Channels</h2>
            <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 divide-y divide-white/10 overflow-hidden">
              <Toggle
                label="Browser Push"
                checked={channels.web_push}
                onChange={handleWebPushToggle}
                testId="toggle-push"
              />
              {isMiniApp && (
                <Toggle
                  label="Farcaster App"
                  checked={channels.farcaster}
                  onChange={handleFarcasterToggle}
                />
              )}
              {isBaseApp && (
                <Toggle
                  label="Base App"
                  checked={channels.baseapp}
                  onChange={handleBaseAppToggle}
                />
              )}

              <div className="divide-y divide-white/10">
                <Toggle
                  label="Email"
                  checked={channels.email}
                  disabled={!walletAddress}
                  onChange={(v) => {
                    setChannels(p => ({ ...p, email: v }));
                    if (!v && !emailInput) setIsEmailVerified(false);
                  }}
                />
                {channels.email && (
                  <div className="px-4 py-3 bg-black/20">
                    <label className="block text-white/70 text-xs mb-1.5">Email Address</label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      disabled={!walletAddress}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-400 focus:outline-none placeholder-white/30 disabled:opacity-50"
                      placeholder="you@example.com"
                    />
                    {isEmailVerified ? (
                      <span className="text-xs text-green-400 mt-2 block">✓ Verified</span>
                    ) : (
                      <span className="text-xs text-yellow-400 mt-2 block">Pending Verification (Wait for OTP module)</span>
                    )}
                  </div>
                )}
              </div>

              <div className="divide-y divide-white/10">
                <Toggle
                  label="Telegram Bot"
                  checked={channels.telegram}
                  disabled={!walletAddress}
                  onChange={(v) => setChannels(p => ({ ...p, telegram: v }))}
                />
                {channels.telegram && (
                  <div className="px-4 py-3 bg-black/20">
                    <p className="text-white/80 text-xs mb-3">
                      To enable Telegram alerts: <br />
                      1. Open <strong>@CCAuctionBot</strong> on Telegram<br />
                      2. Send <code>/start</code><br />
                      3. Enter your Chat ID below:
                    </p>
                    <input
                      type="text"
                      value={telegramInput}
                      onChange={(e) => setTelegramInput(e.target.value)}
                      disabled={!walletAddress}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-400 focus:outline-none placeholder-white/30 disabled:opacity-50"
                      placeholder="e.g. 123456789"
                    />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className={!walletAddress ? "opacity-50 pointer-events-none" : ""}>
            <h2 className="text-white/70 text-xs uppercase tracking-wider mb-3 px-1">Alert Rules</h2>
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 space-y-4">
              <div>
                <label className="block text-white/70 text-xs mb-1">Min Raised Amount ($)</label>
                <p className="text-white/40 text-xs mb-1.5">Filters out test and fake auctions</p>
                <input
                  type="number"
                  value={filters.minRaisedAmount}
                  onChange={(e) => setFilters(p => ({ ...p, minRaisedAmount: e.target.value }))}
                  disabled={!walletAddress}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-400 transition-colors disabled:opacity-50"
                  placeholder="e.g. 50"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/70 text-xs mb-1.5">Min FDV ($)</label>
                  <input
                    type="number"
                    value={filters.minFdv}
                    onChange={(e) => setFilters(p => ({ ...p, minFdv: e.target.value }))}
                    disabled={!walletAddress}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-400 transition-colors disabled:opacity-50"
                    placeholder="Min"
                  />
                </div>
                <div>
                  <label className="block text-white/70 text-xs mb-1.5">Max FDV ($)</label>
                  <input
                    type="number"
                    value={filters.maxFdv}
                    onChange={(e) => setFilters(p => ({ ...p, maxFdv: e.target.value }))}
                    disabled={!walletAddress}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:border-purple-400 transition-colors disabled:opacity-50"
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </section>

          {saveStatus === 'ok' && (
            <div className="flex items-center gap-2 bg-green-500/15 border border-green-400/25 rounded-xl px-4 py-3">
              <span className="text-green-400 text-base">✓</span>
              <p className="text-green-300 text-sm">Preferences saved!</p>
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 bg-red-500/15 border border-red-400/25 rounded-xl px-4 py-3">
              <span className="text-red-400 text-base">✕</span>
              <p className="text-red-300 text-sm">Failed to save — please try again.</p>
            </div>
          )}

          <button
            onClick={savePreferences}
            disabled={isSaveDisabled}
            className="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {isSaving ? 'Saving…' : 'Save Preferences'}
          </button>
        </main>
      </div>

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
