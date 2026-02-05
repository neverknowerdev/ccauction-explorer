'use client';

import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useAccount } from 'wagmi';
import { useMiniApp } from '@/contexts/MiniAppContext';

export function ConnectWalletButton() {
  const { setShowAuthFlow } = useDynamicContext();
  const { address, isConnected } = useAccount();
  const { isMiniApp, isReady } = useMiniApp();

  // Don't show if not ready, in mini-app, or wallet is already connected
  if (!isReady || isMiniApp || (isConnected && address)) {
    return null;
  }

  return (
    <button
      onClick={() => setShowAuthFlow(true)}
      className="fixed top-4 right-4 z-50 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg shadow-lg transition-colors duration-200"
    >
      Connect Wallet
    </button>
  );
}
