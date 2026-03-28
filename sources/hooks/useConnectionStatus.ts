import * as React from 'react';
import { useSocketStatus } from '@/sync/storage';
import { apiSocket } from '@/sync/apiSocket';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'error';

export const RECONNECTING_BANNER_DELAY_MS = 500;

export interface UseConnectionStatusResult {
    status: ConnectionStatus;
    isReconnecting: boolean;
    /** True when disconnected for more than RECONNECTING_BANNER_DELAY_MS */
    isDisconnected: boolean;
    /** Seconds since last disconnect, null if currently connected */
    disconnectedForSeconds: number | null;
    /** Manually trigger a reconnect attempt */
    reconnect: () => void;
}

export function useConnectionStatus(): UseConnectionStatusResult {
    const socketStatus = useSocketStatus();
    const hadConnectedBefore = socketStatus.lastConnectedAt !== null;
    const shouldDebounceReconnect = hadConnectedBefore
        && (socketStatus.status === 'connecting'
            || socketStatus.status === 'disconnected'
            || socketStatus.status === 'error');

    const [showReconnectBanner, setShowReconnectBanner] = React.useState(false);

    React.useEffect(() => {
        if (!shouldDebounceReconnect) {
            setShowReconnectBanner(false);
            return;
        }

        const timeout = setTimeout(() => {
            setShowReconnectBanner(true);
        }, RECONNECTING_BANNER_DELAY_MS);

        return () => clearTimeout(timeout);
    }, [shouldDebounceReconnect, socketStatus.status, socketStatus.lastConnectedAt]);

    const status: ConnectionStatus = React.useMemo(() => {
        if (socketStatus.status === 'connected') {
            return 'connected';
        }

        if (showReconnectBanner) {
            return 'reconnecting';
        }

        if (socketStatus.status === 'error') {
            return 'error';
        }

        return 'connected';
    }, [showReconnectBanner, socketStatus.status]);

    // Tick every second while disconnected to update elapsed time display
    const [now, setNow] = React.useState(() => Date.now());
    const isCurrentlyDisconnected = status === 'reconnecting' || status === 'error';
    React.useEffect(() => {
        if (!isCurrentlyDisconnected) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [isCurrentlyDisconnected]);

    const disconnectedForSeconds = React.useMemo(() => {
        if (!isCurrentlyDisconnected || !socketStatus.lastDisconnectedAt) return null;
        return Math.floor((now - socketStatus.lastDisconnectedAt) / 1000);
    }, [isCurrentlyDisconnected, now, socketStatus.lastDisconnectedAt]);

    const reconnect = React.useCallback(() => {
        apiSocket.reconnect();
    }, []);

    return {
        status,
        isReconnecting: status === 'reconnecting',
        isDisconnected: isCurrentlyDisconnected,
        disconnectedForSeconds,
        reconnect,
    };
}
