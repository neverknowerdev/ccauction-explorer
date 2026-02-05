'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, createConfig } from 'wagmi';
import { base, baseSepolia, sepolia } from 'wagmi/chains';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { MiniAppProvider } from '@/contexts/MiniAppContext';
import { useState, useMemo, useEffect } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core';
import { DynamicWagmiConnector } from '@dynamic-labs/wagmi-connector';
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum';

// Create wagmi config for Farcaster mini-app
function createFarcasterConfig() {
  return createConfig({
    chains: [base, baseSepolia, sepolia],
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
      [sepolia.id]: http(),
    },
    connectors: [farcasterMiniApp()],
  });
}

// Create wagmi config for web (no connectors - Dynamic handles it)
function createWebConfig() {
  return createConfig({
    chains: [base, baseSepolia, sepolia],
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
      [sepolia.id]: http(),
    },
    connectors: [],
  });
}

// Farcaster mini-app provider tree
function FarcasterProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const wagmiConfig = useMemo(() => createFarcasterConfig(), []);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniAppProvider>{children}</MiniAppProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Define EVM networks for Dynamic to match wagmi config
const evmNetworks = [
  {
    blockExplorerUrls: ['https://basescan.org'],
    chainId: 8453,
    chainName: 'Base',
    iconUrls: ['https://icons.llamao.fi/icons/chains/rsz_base.jpg'],
    name: 'Base',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    networkId: 8453,
    rpcUrls: ['https://mainnet.base.org'],
    vanityName: 'Base',
  },
  {
    blockExplorerUrls: ['https://sepolia.basescan.org'],
    chainId: 84532,
    chainName: 'Base Sepolia',
    iconUrls: ['https://icons.llamao.fi/icons/chains/rsz_base.jpg'],
    name: 'Base Sepolia',
    nativeCurrency: {
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH',
    },
    networkId: 84532,
    rpcUrls: ['https://sepolia.base.org'],
    vanityName: 'Base Sepolia',
  },
  {
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
    chainId: 11155111,
    chainName: 'Sepolia',
    iconUrls: ['https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg'],
    name: 'Sepolia',
    nativeCurrency: {
      decimals: 18,
      name: 'Sepolia Ether',
      symbol: 'ETH',
    },
    networkId: 11155111,
    rpcUrls: ['https://rpc.sepolia.org'],
    vanityName: 'Sepolia Testnet',
  },
];

// Web provider tree with Dynamic
function WebProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const wagmiConfig = useMemo(() => createWebConfig(), []);
  const dynamicEnvironmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;

  if (!dynamicEnvironmentId) {
    console.warn('NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set. Dynamic wallet features will not work.');
  }

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId || '',
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks,
        },
      }}
    >
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <DynamicWagmiConnector>
            <MiniAppProvider>{children}</MiniAppProvider>
          </DynamicWagmiConnector>
        </QueryClientProvider>
      </WagmiProvider>
    </DynamicContextProvider>
  );
}

// Loading state while detecting environment
function LoadingProviders({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900">
      <div className="animate-pulse text-white text-lg">Loading...</div>
    </div>
  );
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [isMiniApp, setIsMiniApp] = useState<boolean | null>(null);

  useEffect(() => {
    const detectEnvironment = async () => {
      try {
        const inMiniApp = await sdk.isInMiniApp();
        setIsMiniApp(inMiniApp);
      } catch (error) {
        console.error('Error detecting environment:', error);
        setIsMiniApp(false);
      }
    };

    detectEnvironment();
  }, []);

  // Still detecting environment
  if (isMiniApp === null) {
    return <LoadingProviders>{children}</LoadingProviders>;
  }

  // Render appropriate provider tree
  if (isMiniApp) {
    return <FarcasterProviders>{children}</FarcasterProviders>;
  }

  return <WebProviders>{children}</WebProviders>;
}
