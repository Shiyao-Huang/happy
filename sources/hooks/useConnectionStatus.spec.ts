import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

const mockState = vi.hoisted(() => ({
    useSocketStatus: vi.fn(),
}));

vi.mock('@/sync/storage', () => ({
    useSocketStatus: mockState.useSocketStatus,
}));

vi.mock('@/sync/apiSocket', () => ({
    apiSocket: { reconnect: vi.fn() },
}));

import { RECONNECTING_BANNER_DELAY_MS, useConnectionStatus } from './useConnectionStatus';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<Result>(hook: () => Result) {
    const result: { current: Result } = { current: undefined as unknown as Result };
    let renderer: ReturnType<typeof create>;

    function Wrapper() {
        result.current = hook();
        return null;
    }

    act(() => {
        renderer = create(React.createElement(Wrapper));
    });

    return {
        result,
        rerender: () => {
            act(() => {
                renderer.update(React.createElement(Wrapper));
            });
        },
        unmount: () => {
            act(() => {
                renderer.unmount();
            });
        },
    };
}

describe('useConnectionStatus', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        mockState.useSocketStatus.mockReset();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: any) => {
            if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
                return;
            }
        });
    });

    afterEach(() => {
        vi.useRealTimers();
        consoleErrorSpy.mockRestore();
    });

    it('should expose isReconnecting=true when socket disconnected', () => {
        mockState.useSocketStatus.mockReturnValue({
            status: 'disconnected',
            lastConnectedAt: 1000,
            lastDisconnectedAt: 1500,
        });

        const { result } = renderHook(() => useConnectionStatus());

        act(() => {
            vi.advanceTimersByTime(RECONNECTING_BANNER_DELAY_MS);
        });

        expect(result.current.status).toBe('reconnecting');
        expect(result.current.isReconnecting).toBe(true);
    });

    it('should expose status=connected when socket reconnects', () => {
        const socketState = {
            status: 'disconnected' as 'disconnected' | 'connected',
            lastConnectedAt: 1000,
            lastDisconnectedAt: 1500,
        };

        mockState.useSocketStatus.mockImplementation(() => socketState);

        const { result, rerender } = renderHook(() => useConnectionStatus());

        act(() => {
            vi.advanceTimersByTime(RECONNECTING_BANNER_DELAY_MS);
        });

        expect(result.current.status).toBe('reconnecting');

        socketState.status = 'connected';
        rerender();

        expect(result.current.status).toBe('connected');
        expect(result.current.isReconnecting).toBe(false);
    });

    it('should not show reconnecting immediately (debounce 500ms)', () => {
        mockState.useSocketStatus.mockReturnValue({
            status: 'disconnected',
            lastConnectedAt: 1000,
            lastDisconnectedAt: 1500,
        });

        const { result } = renderHook(() => useConnectionStatus());

        expect(result.current.status).toBe('connected');
        expect(result.current.isReconnecting).toBe(false);

        act(() => {
            vi.advanceTimersByTime(RECONNECTING_BANNER_DELAY_MS - 1);
        });

        expect(result.current.isReconnecting).toBe(false);

        act(() => {
            vi.advanceTimersByTime(1);
        });

        expect(result.current.status).toBe('reconnecting');
        expect(result.current.isReconnecting).toBe(true);
    });
});
