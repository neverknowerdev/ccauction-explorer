'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMiniApp } from '@/contexts/MiniAppContext';

export type NotificationState =
    | 'unknown'      // haven't checked yet
    | 'unsupported'  // browser doesn't support Notification API
    | 'denied'       // user blocked permanently
    | 'granted'      // at least one channel active
    | 'idle';        // supported but never asked

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const output = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        output[i] = rawData.charCodeAt(i);
    }
    return output;
}

async function subscribeWebPush(walletAddress: string): Promise<boolean> {
    try {
        // 1. Request browser notification permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return false;

        // 2. Register (or reuse) the service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // 3. Get or create a push subscription
        let sub = await registration.pushManager.getSubscription();
        if (!sub) {
            // Fetch VAPID key and subscribe
            let applicationServerKey: ArrayBuffer | undefined;
            try {
                const res = await fetch('/api/notifications/vapid-public-key');
                if (res.ok) {
                    const { publicKey } = await res.json();
                    applicationServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer;
                }
            } catch {
                // No VAPID key — still register so at least the SW is active
            }

            sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                ...(applicationServerKey ? { applicationServerKey } : {}),
            });
        }

        // 4. Persist to DB
        await fetch('/api/notifications/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-wallet-address': walletAddress,
            },
            body: JSON.stringify({ webPushSubscription: sub.toJSON() }),
        });

        return true;
    } catch (err) {
        console.error('[useNotifications] Web Push error:', err);
        return false;
    }
}

async function subscribeFarcaster(
    requestFarcasterNotifications: () => Promise<boolean>
): Promise<boolean> {
    try {
        return await requestFarcasterNotifications();
    } catch (err) {
        console.error('[useNotifications] Farcaster error:', err);
        return false;
    }
}

export function useNotifications() {
    const { isMiniApp, requestFarcasterNotifications, walletAddress } = useMiniApp();

    const [state, setState] = useState<NotificationState>('unknown');
    const [requesting, setRequesting] = useState(false);

    // Determine initial state
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const alreadyGranted = localStorage.getItem('notificationsGranted') === 'true';
        if (alreadyGranted) {
            setState('granted');
            return;
        }

        if (!('Notification' in window)) {
            setState('unsupported');
            return;
        }

        if (Notification.permission === 'denied') {
            setState('denied');
            return;
        }

        setState('idle');
    }, []);

    const request = useCallback(async () => {
        if (requesting || state === 'granted') return;
        setRequesting(true);

        let success = false;

        // We always try web push (works in browser AND in mini-app webview)
        // Additionally try Farcaster if inside a mini-app
        const hasWallet = !!walletAddress;

        if (hasWallet) {
            const webPushSuccess = await subscribeWebPush(walletAddress);
            if (webPushSuccess) success = true;
        } else if ('Notification' in window) {
            // No wallet — still ask for browser permission so the SW is registered
            const perm = await Notification.requestPermission();
            if (perm === 'granted') success = true;
        }

        if (isMiniApp && requestFarcasterNotifications) {
            const farcasterSuccess = await subscribeFarcaster(requestFarcasterNotifications);
            if (farcasterSuccess) success = true;
        }

        if (success) {
            localStorage.setItem('notificationsGranted', 'true');
            setState('granted');
        } else if ('Notification' in window && Notification.permission === 'denied') {
            setState('denied');
        }

        setRequesting(false);
    }, [isMiniApp, requestFarcasterNotifications, walletAddress, state, requesting]);

    return { state, requesting, request };
}
