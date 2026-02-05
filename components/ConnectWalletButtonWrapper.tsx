'use client';

import { useMiniApp } from '@/contexts/MiniAppContext';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useAccount } from 'wagmi';
import { formatWalletAddress } from '@/utils/format';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useState, useEffect, useRef } from 'react';

// This wrapper ensures ConnectWalletButton is only rendered when Dynamic is available
// (i.e., when not in Farcaster mini-app)
export function ConnectWalletButtonWrapper() {
  const { isMiniApp, isReady } = useMiniApp();
  const { address, isConnected } = useAccount();
  const { handleLogOut } = useDynamicContext();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    await handleLogOut();
    setIsDropdownOpen(false);
  };

  // Don't render if not ready or if we're in mini-app (Dynamic isn't available there)
  if (!isReady || isMiniApp) {
    return null;
  }

  // Show wallet address with dropdown if connected, otherwise show connect button
  if (isConnected && address) {
    return (
      <div className="fixed top-4 right-4 z-50" ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg shadow-lg transition-colors duration-200 flex items-center gap-2"
        >
          <span>{formatWalletAddress(address)}</span>
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isDropdownOpen && (
          <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
            <div className="py-1">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-150"
              >
                Disconnect Wallet
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return <ConnectWalletButton />;
}
