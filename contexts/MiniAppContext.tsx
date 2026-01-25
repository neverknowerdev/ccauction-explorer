'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { sdk } from '@farcaster/miniapp-sdk';

interface MiniAppContextType {
  username: string | null;
  walletAddress: string | null;
  isReady: boolean;
  fid: number | null;
}

const MiniAppContext = createContext<MiniAppContextType>({
  username: null,
  walletAddress: null,
  isReady: false,
  fid: null,
});

function MiniAppContextProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [fid, setFid] = useState<number | null>(null);
  const { address } = useAccount();

  useEffect(() => {
    // Initialize Farcaster Mini App
    const initializeMiniApp = async () => {
      // Only run on client side
      if (typeof window === 'undefined') return;

      try {
        // Call ready() when page loads to hide splash screen
        await sdk.actions.ready();

        // Get user data from context (context is a Promise)
        const context = await sdk.context;
        if (context?.user) {
          const user = context.user;
          setFid(user.fid);

          if (user.displayName) {
            setUsername(user.displayName);
          } else if (user.username) {
            setUsername(user.username);
          } else {
            setUsername('Guest');
          }
        } else {
          setUsername('Guest');
        }

        setIsReady(true);
      } catch (error) {
        console.error('Error initializing Farcaster Mini App:', error);
        // Fallback for development
        setUsername('DemoUser');
        setIsReady(true);
      }
    };

    initializeMiniApp();
  }, []);

  return (
    <MiniAppContext.Provider value={{ username, walletAddress: address || null, isReady, fid }}>
      {children}
    </MiniAppContext.Provider>
  );
}

export function MiniAppProvider({ children }: { children: ReactNode }) {
  return <MiniAppContextProvider>{children}</MiniAppContextProvider>;
}

export function useMiniApp() {
  return useContext(MiniAppContext);
}
