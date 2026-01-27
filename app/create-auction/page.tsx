'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';

type TokenReleasePreset = 'flat' | 'front-loaded' | 'back-loaded';
type FeeTier = '0.05%' | '0.3%' | '1.0%';

export default function CreateAuctionPage() {
  const router = useRouter();
  const [useExistingToken, setUseExistingToken] = useState(false);

  // Token Info
  const [tokenName, setTokenName] = useState('');
  const [tokenTicker, setTokenTicker] = useState('');
  const [tokenImage, setTokenImage] = useState('');
  const [tokenDescription, setTokenDescription] = useState('');
  const [tokenWebsite, setTokenWebsite] = useState('');
  const [contractAddress, setContractAddress] = useState('');

  // Time Settings
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [durationDays, setDurationDays] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const durationChangedRef = useRef(false);
  const endTimeChangedRef = useRef(false);

  // Auction Settings
  const [targetRaisedValue, setTargetRaisedValue] = useState('');
  const [maxRaisedLimit, setMaxRaisedLimit] = useState('');
  const [floorPrice, setFloorPrice] = useState('');
  const [placeOneSidedCurrency, setPlaceOneSidedCurrency] = useState(false);
  const [placeOneSidedTokens, setPlaceOneSidedTokens] = useState(false);
  const [tokenReleasePreset, setTokenReleasePreset] = useState<TokenReleasePreset>('flat');

  // Pool Settings
  const [feeTier, setFeeTier] = useState<FeeTier>('0.3%');
  const [lpOwnership, setLpOwnership] = useState('');
  const [fundraisingWallet, setFundraisingWallet] = useState('');

  // Calculate End Time from Start Time + Duration
  useEffect(() => {
    // Only calculate if duration was changed and we're not in the middle of an endTime change
    if (durationChangedRef.current && startTime && !endTimeChangedRef.current) {
      const days = parseInt(durationDays) || 0;
      const hours = parseInt(durationHours) || 0;
      const minutes = parseInt(durationMinutes) || 0;

      if (days > 0 || hours > 0 || minutes > 0) {
        const start = new Date(startTime);
        const totalMinutes = days * 24 * 60 + hours * 60 + minutes;
        const end = new Date(start.getTime() + totalMinutes * 60 * 1000);

        // Format as datetime-local (YYYY-MM-DDTHH:mm)
        const year = end.getFullYear();
        const month = String(end.getMonth() + 1).padStart(2, '0');
        const day = String(end.getDate()).padStart(2, '0');
        const hour = String(end.getHours()).padStart(2, '0');
        const minute = String(end.getMinutes()).padStart(2, '0');
        const formattedEndTime = `${year}-${month}-${day}T${hour}:${minute}`;

        setEndTime(formattedEndTime);
      } else {
        // Clear End Time when all duration values are zero
        setEndTime('');
      }
      durationChangedRef.current = false;
    }
  }, [durationDays, durationHours, durationMinutes, startTime]);

  // Calculate Duration from Start Time and End Time
  useEffect(() => {
    if (endTimeChangedRef.current && startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);

      if (end <= start) {
        endTimeChangedRef.current = false;
        return;
      }

      const diffMs = end.getTime() - start.getTime();
      const totalMinutes = Math.floor(diffMs / (1000 * 60));
      const totalHours = Math.floor(totalMinutes / 60);
      const totalDays = Math.floor(totalHours / 24);

      const remainingHours = totalHours % 24;
      const remainingMinutes = totalMinutes % 60;

      setDurationDays(String(totalDays));
      setDurationHours(String(remainingHours));
      setDurationMinutes(String(remainingMinutes));
      endTimeChangedRef.current = false;
    }
  }, [endTime, startTime]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement auction creation logic
    console.log('Creating auction with:', {
      tokenInfo: useExistingToken
        ? { contractAddress }
        : { tokenName, tokenTicker, tokenImage, tokenDescription, tokenWebsite },
      auctionSettings: {
        targetRaisedValue,
        maxRaisedLimit,
        startTime,
        endTime,
        duration: {
          days: durationDays,
          hours: durationHours,
          minutes: durationMinutes,
        },
        floorPrice,
        placeOneSidedPosition: {
          currency: placeOneSidedCurrency,
          tokens: placeOneSidedTokens,
        },
        tokenReleasePreset,
      },
      poolSettings: {
        feeTier,
        lpOwnership,
        fundraisingWallet,
      },
    });
    // Navigate back or show success message
    router.push('/');
  };

  return (
    <div className="min-h-screen pb-20">
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
            <h1 className="text-xl font-bold text-white">Create Auction</h1>
          </div>
        </header>

        {/* Content */}
        <main className="px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Token Info Section */}
            <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
              <h2 className="text-lg font-semibold text-white mb-4">Token Info</h2>
              <div className="space-y-4">
                  {/* Toggle between manual entry and contract address */}
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setUseExistingToken(false)}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                        !useExistingToken
                          ? 'bg-white/30 text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      Manual Entry
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseExistingToken(true)}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                        useExistingToken
                          ? 'bg-white/30 text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      Pick Existing Token
                    </button>
                  </div>

                  {useExistingToken ? (
                    <div>
                      <label className="block text-white/90 text-sm font-medium mb-2">
                        Contract Address
                      </label>
                      <input
                        type="text"
                        value={contractAddress}
                        onChange={(e) => setContractAddress(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                      />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-white/90 text-sm font-medium mb-2">
                          Token Name
                        </label>
                        <input
                          type="text"
                          value={tokenName}
                          onChange={(e) => setTokenName(e.target.value)}
                          placeholder="My Token"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                      <div>
                        <label className="block text-white/90 text-sm font-medium mb-2">
                          Token Ticker
                        </label>
                        <input
                          type="text"
                          value={tokenTicker}
                          onChange={(e) => setTokenTicker(e.target.value)}
                          placeholder="MTK"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                      <div>
                        <label className="block text-white/90 text-sm font-medium mb-2">
                          Image URL
                        </label>
                        <input
                          type="url"
                          value={tokenImage}
                          onChange={(e) => setTokenImage(e.target.value)}
                          placeholder="https://..."
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                      <div>
                        <label className="block text-white/90 text-sm font-medium mb-2">
                          Description
                        </label>
                        <textarea
                          value={tokenDescription}
                          onChange={(e) => setTokenDescription(e.target.value)}
                          placeholder="Describe your token..."
                          rows={3}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-white/90 text-sm font-medium mb-2">
                          Website
                        </label>
                        <input
                          type="url"
                          value={tokenWebsite}
                          onChange={(e) => setTokenWebsite(e.target.value)}
                          placeholder="https://..."
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                        />
                      </div>
                    </div>
                  )}
                </div>
            </section>

            {/* Auction Time Section */}
            <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
              <h2 className="text-lg font-semibold text-white mb-4">Auction Time</h2>
              <div className="space-y-4">
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Start Time
                    </label>
                    <input
                      type="datetime-local"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        // If duration is set, recalculate endTime
                        const days = parseInt(durationDays) || 0;
                        const hours = parseInt(durationHours) || 0;
                        const minutes = parseInt(durationMinutes) || 0;
                        if (days > 0 || hours > 0 || minutes > 0) {
                          durationChangedRef.current = true;
                        }
                      }}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      value={endTime}
                      onChange={(e) => {
                        endTimeChangedRef.current = true;
                        setEndTime(e.target.value);
                      }}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Duration
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          value={durationDays}
                          onChange={(e) => {
                            durationChangedRef.current = true;
                            setDurationDays(e.target.value);
                          }}
                          placeholder="0"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 text-center"
                        />
                        <p className="text-white/60 text-xs text-center mt-1">Days</p>
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={durationHours}
                          onChange={(e) => {
                            durationChangedRef.current = true;
                            setDurationHours(e.target.value);
                          }}
                          placeholder="0"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 text-center"
                        />
                        <p className="text-white/60 text-xs text-center mt-1">Hours</p>
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          max="59"
                          value={durationMinutes}
                          onChange={(e) => {
                            durationChangedRef.current = true;
                            setDurationMinutes(e.target.value);
                          }}
                          placeholder="0"
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 text-center"
                        />
                        <p className="text-white/60 text-xs text-center mt-1">Minutes</p>
                      </div>
                    </div>
                  </div>
                </div>
            </section>

            {/* Auction Settings Section */}
            <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
              <h2 className="text-lg font-semibold text-white mb-4">Auction Settings</h2>
              <div className="space-y-4">
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Target Raised Value
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={targetRaisedValue}
                      onChange={(e) => setTargetRaisedValue(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Max Raised Limit (maxCurrencyForLP)
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={maxRaisedLimit}
                      onChange={(e) => setMaxRaisedLimit(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Floor Price
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={floorPrice}
                      onChange={(e) => setFloorPrice(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>

                  {/* Place One Sided Position */}
                  <div className="pt-2 border-t border-white/20">
                    <h3 className="text-white font-medium mb-3">Place One Sided Position</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-white/90 text-sm font-medium">
                          Currency
                        </label>
                        <button
                          type="button"
                          onClick={() => setPlaceOneSidedCurrency(!placeOneSidedCurrency)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            placeOneSidedCurrency ? 'bg-white/40' : 'bg-white/20'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              placeOneSidedCurrency ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-white/90 text-sm font-medium">
                          Tokens
                        </label>
                        <button
                          type="button"
                          onClick={() => setPlaceOneSidedTokens(!placeOneSidedTokens)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            placeOneSidedTokens ? 'bg-white/40' : 'bg-white/20'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              placeOneSidedTokens ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Token Release Preset */}
                  <div className="pt-2 border-t border-white/20">
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Token Release Preset
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['flat', 'front-loaded', 'back-loaded'] as TokenReleasePreset[]).map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setTokenReleasePreset(preset)}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            tokenReleasePreset === preset
                              ? 'bg-white/30 text-white'
                              : 'bg-white/10 text-white/70 hover:bg-white/20'
                          }`}
                        >
                          {preset === 'flat' ? 'Flat' : preset === 'front-loaded' ? 'Front-loaded' : 'Back-loaded'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
            </section>

            {/* Pool Settings Section */}
            <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
              <h2 className="text-lg font-semibold text-white mb-4">Pool Settings</h2>
              <div className="space-y-4">
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Fee Tier
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['0.05%', '0.3%', '1.0%'] as FeeTier[]).map((tier) => (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setFeeTier(tier)}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                            feeTier === tier
                              ? 'bg-white/30 text-white'
                              : 'bg-white/10 text-white/70 hover:bg-white/20'
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      LP Ownership (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={lpOwnership}
                      onChange={(e) => setLpOwnership(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                    />
                  </div>
                  <div>
                    <label className="block text-white/90 text-sm font-medium mb-2">
                      Fundraising Wallet
                    </label>
                    <input
                      type="text"
                      value={fundraisingWallet}
                      onChange={(e) => setFundraisingWallet(e.target.value)}
                      placeholder="0x..."
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50 font-mono text-sm"
                    />
                  </div>
                </div>
            </section>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                className="w-full bg-white/30 hover:bg-white/40 backdrop-blur-md rounded-xl py-4 px-6 border border-white/30 text-white font-semibold transition-colors"
              >
                Create Auction
              </button>
            </div>
          </form>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
