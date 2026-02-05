'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount } from 'wagmi';
import BottomNav from '@/components/BottomNav';
import { useCreateAuction, AuctionFormData, AuctionCreationStep } from '@/hooks/useCreateAuction';
import { TokenReleasePreset } from '@/lib/contracts/encoder';
import { BASE_SEPOLIA_CHAIN_ID } from '@/lib/contracts/addresses';

type FeeTier = '0.05%' | '0.3%' | '1.0%';

function getStepMessage(step: AuctionCreationStep): string {
  switch (step) {
    case 'idle':
      return '';
    case 'checking_network':
      return 'Checking network...';
    case 'switching_network':
      return 'Please switch to Base Sepolia...';
    case 'creating_token':
      return 'Creating token... Please confirm in your wallet.';
    case 'waiting_token_confirmation':
      return 'Waiting for token creation confirmation...';
    case 'distributing_token':
      return 'Setting up auction... Please confirm in your wallet.';
    case 'waiting_distribution_confirmation':
      return 'Waiting for auction setup confirmation...';
    case 'complete':
      return 'Auction created successfully!';
    case 'error':
      return 'An error occurred';
    default:
      return '';
  }
}

export default function CreateAuctionPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { step, error, tokenAddress, txHash, isLoading, createAuction, reset } = useCreateAuction();
  
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
  const [lpOwnership, setLpOwnership] = useState('50');
  const [fundraisingWallet, setFundraisingWallet] = useState('');

  // Set default times on mount
  useEffect(() => {
    const now = new Date();
    // Default start time: 10 minutes from now
    const defaultStart = new Date(now.getTime() + 10 * 60 * 1000);
    // Default end time: 1 day after start
    const defaultEnd = new Date(defaultStart.getTime() + 24 * 60 * 60 * 1000);
    
    const formatDateTime = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };
    
    setStartTime(formatDateTime(defaultStart));
    setEndTime(formatDateTime(defaultEnd));
    setDurationDays('1');
    setDurationHours('0');
    setDurationMinutes('0');
  }, []);

  // Set fundraising wallet to connected address if empty
  useEffect(() => {
    if (address && !fundraisingWallet) {
      setFundraisingWallet(address);
    }
  }, [address, fundraisingWallet]);

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

  const validateForm = (): string | null => {
    if (!isConnected) {
      return 'Please connect your wallet first';
    }
    
    if (!useExistingToken) {
      if (!tokenName.trim()) return 'Token name is required';
      if (!tokenTicker.trim()) return 'Token ticker is required';
    } else {
      if (!contractAddress.trim() || !contractAddress.startsWith('0x')) {
        return 'Valid contract address is required';
      }
    }
    
    if (!startTime) return 'Start time is required';
    if (!endTime) return 'End time is required';
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();
    
    if (start <= now) return 'Start time must be in the future';
    if (end <= start) return 'End time must be after start time';
    
    if (!targetRaisedValue || parseFloat(targetRaisedValue) <= 0) {
      return 'Target raised value must be greater than 0';
    }
    
    if (!floorPrice || parseFloat(floorPrice) <= 0) {
      return 'Floor price must be greater than 0';
    }
    
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }
    
    const formData: AuctionFormData = {
      tokenName: tokenName.trim(),
      tokenSymbol: tokenTicker.trim().toUpperCase(),
      tokenDescription: tokenDescription.trim(),
      tokenWebsite: tokenWebsite.trim(),
      tokenImage: tokenImage.trim(),
      useExistingToken,
      existingTokenAddress: contractAddress.trim(),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      targetRaisedValue: targetRaisedValue.trim(),
      maxRaisedLimit: maxRaisedLimit.trim() || targetRaisedValue.trim(),
      floorPrice: floorPrice.trim(),
      tokenReleasePreset,
      feeTier,
      lpOwnership: parseFloat(lpOwnership) || 50,
      fundraisingWallet: fundraisingWallet.trim(),
    };
    
    await createAuction(formData);
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

        {/* Status Banner */}
        {step !== 'idle' && (
          <div className={`mx-6 mt-4 p-4 rounded-xl border ${
            step === 'error' 
              ? 'bg-red-500/20 border-red-500/40 text-red-200' 
              : step === 'complete'
                ? 'bg-green-500/20 border-green-500/40 text-green-200'
                : 'bg-blue-500/20 border-blue-500/40 text-blue-200'
          }`}>
            <div className="flex items-center gap-3">
              {isLoading && (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <div className="flex-1">
                <p className="font-medium">{getStepMessage(step)}</p>
                {error && <p className="text-sm mt-1">{error}</p>}
                {tokenAddress && (
                  <p className="text-sm mt-1">
                    Token: <a 
                      href={`https://sepolia.basescan.org/address/${tokenAddress}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {tokenAddress.slice(0, 8)}...{tokenAddress.slice(-6)}
                    </a>
                  </p>
                )}
                {txHash && (
                  <p className="text-sm mt-1">
                    Tx: <a 
                      href={`https://sepolia.basescan.org/tx/${txHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {txHash.slice(0, 8)}...{txHash.slice(-6)}
                    </a>
                  </p>
                )}
              </div>
              {(step === 'error' || step === 'complete') && (
                <button
                  onClick={reset}
                  className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition-colors"
                >
                  {step === 'error' ? 'Try Again' : 'Create Another'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <main className="px-6 py-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Token Info Section */}
            <section className="bg-white/20 backdrop-blur-md rounded-xl p-5 border border-white/30">
              <h2 className="text-lg font-semibold text-white mb-4">Token</h2>
              <div className="space-y-4">
                {/* Toggle between manual entry and contract address */}
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setUseExistingToken(false)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${!useExistingToken
                      ? 'bg-white/30 text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                  >
                    Create new
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseExistingToken(true)}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${useExistingToken
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
                    <p className="text-white/60 text-xs mt-2">
                      Note: Using existing tokens requires additional setup. Contact support for help.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-white/90 text-sm font-medium mb-2">
                        Token Name <span className="text-red-300">*</span>
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
                        Token Ticker <span className="text-red-300">*</span>
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
                    Start Time <span className="text-red-300">*</span>
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
                    End Time <span className="text-red-300">*</span>
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
                    Target Raised Value (ETH) <span className="text-red-300">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={targetRaisedValue}
                    onChange={(e) => setTargetRaisedValue(e.target.value)}
                    placeholder="0.1"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <p className="text-white/60 text-xs mt-1">Minimum ETH required for auction to graduate</p>
                </div>
                <div>
                  <label className="block text-white/90 text-sm font-medium mb-2">
                    Max Raised Limit (ETH)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={maxRaisedLimit}
                    onChange={(e) => setMaxRaisedLimit(e.target.value)}
                    placeholder="Same as target"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <p className="text-white/60 text-xs mt-1">Maximum ETH used for initial LP position</p>
                </div>
                <div>
                  <label className="block text-white/90 text-sm font-medium mb-2">
                    Floor Price (ETH per token) <span className="text-red-300">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.000000001"
                    value={floorPrice}
                    onChange={(e) => setFloorPrice(e.target.value)}
                    placeholder="0.000001"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <p className="text-white/60 text-xs mt-1">Minimum price per token in the auction</p>
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
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${placeOneSidedCurrency ? 'bg-white/40' : 'bg-white/20'
                          }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${placeOneSidedCurrency ? 'translate-x-6' : 'translate-x-1'
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
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${placeOneSidedTokens ? 'bg-white/40' : 'bg-white/20'
                          }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${placeOneSidedTokens ? 'translate-x-6' : 'translate-x-1'
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
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${tokenReleasePreset === preset
                          ? 'bg-white/30 text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                          }`}
                      >
                        {preset === 'flat' ? 'Flat' : preset === 'front-loaded' ? 'Front-loaded' : 'Back-loaded'}
                      </button>
                    ))}
                  </div>
                  <p className="text-white/60 text-xs mt-2">
                    {tokenReleasePreset === 'flat' && 'Tokens released evenly throughout the auction'}
                    {tokenReleasePreset === 'front-loaded' && 'More tokens released early in the auction'}
                    {tokenReleasePreset === 'back-loaded' && 'More tokens released late in the auction'}
                  </p>
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
                        className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors ${feeTier === tier
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
                    step="1"
                    min="10"
                    max="90"
                    value={lpOwnership}
                    onChange={(e) => setLpOwnership(e.target.value)}
                    placeholder="50"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/50"
                  />
                  <p className="text-white/60 text-xs mt-1">
                    Percentage of tokens reserved for LP ({100 - (parseInt(lpOwnership) || 50)}% goes to auction)
                  </p>
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
                  <p className="text-white/60 text-xs mt-1">
                    Address that will receive LP position and excess funds
                  </p>
                </div>
              </div>
            </section>

            {/* Network Info */}
            <div className="bg-blue-500/20 border border-blue-500/40 rounded-xl p-4">
              <div className="flex items-center gap-2 text-blue-200">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm font-medium">Deploying on Base Sepolia Testnet</span>
              </div>
              <p className="text-blue-200/70 text-xs mt-2">
                This will create a new token and set up a CCA auction on the Uniswap Liquidity Launchpad.
              </p>
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isLoading || !isConnected}
                className={`w-full backdrop-blur-md rounded-xl py-4 px-6 border font-semibold transition-colors ${
                  isLoading || !isConnected
                    ? 'bg-white/10 border-white/20 text-white/50 cursor-not-allowed'
                    : 'bg-white/30 hover:bg-white/40 border-white/30 text-white'
                }`}
              >
                {isLoading ? 'Creating...' : !isConnected ? 'Connect Wallet to Create' : 'Create Auction'}
              </button>
            </div>
          </form>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
