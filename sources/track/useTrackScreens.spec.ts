import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

// Mutable container so individual tests can set tracking to null or a mock object
const trackingContainer = vi.hoisted(() => ({
    value: null as { screen: ReturnType<typeof vi.fn> } | null,
}));

vi.mock('./tracking', () => ({
    get tracking() {
        return trackingContainer.value;
    },
}));

const mockUseSegments = vi.hoisted(() => vi.fn(() => [] as string[]));

vi.mock('expo-router', () => ({
    useSegments: mockUseSegments,
}));

import { useTrackScreens } from './useTrackScreens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook(hook: () => void) {
    let renderer: ReturnType<typeof create>;

    function Wrapper() {
        hook();
        return null;
    }

    act(() => {
        renderer = create(React.createElement(Wrapper));
    });

    return {
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

describe('useTrackScreens', () => {
    let mockScreen: ReturnType<typeof vi.fn>;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockScreen = vi.fn();
        trackingContainer.value = { screen: mockScreen };
        mockUseSegments.mockClear();
        mockUseSegments.mockReturnValue([]);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: any) => {
            if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
                return;
            }
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('should call tracking.screen on mount', () => {
        mockUseSegments.mockReturnValue(['home']);
        renderHook(() => useTrackScreens());
        expect(mockScreen).toHaveBeenCalledWith('home');
    });

    it('should not track when tracking is null (dev mode)', () => {
        trackingContainer.value = null;
        // With tracking=null, useSegments is not called and screen is never invoked
        renderHook(() => useTrackScreens());
        expect(mockScreen).not.toHaveBeenCalled();
        expect(mockUseSegments).not.toHaveBeenCalled();
    });

    it('should filter route group segments starting with "("', () => {
        mockUseSegments.mockReturnValue(['(app)', 'teams', '123']);
        renderHook(() => useTrackScreens());
        expect(mockScreen).toHaveBeenCalledWith('teams/123');
    });

    it('should filter all group segments and join the rest', () => {
        mockUseSegments.mockReturnValue(['(tabs)', '(app)', 'settings']);
        renderHook(() => useTrackScreens());
        expect(mockScreen).toHaveBeenCalledWith('settings');
    });

    it('should call screen with empty string when all segments are group segments', () => {
        mockUseSegments.mockReturnValue(['(app)', '(tabs)']);
        renderHook(() => useTrackScreens());
        expect(mockScreen).toHaveBeenCalledWith('');
    });

    it('should re-track when route changes', () => {
        const segments = ['home'] as string[];
        mockUseSegments.mockImplementation(() => segments);
        const { rerender } = renderHook(() => useTrackScreens());

        expect(mockScreen).toHaveBeenCalledTimes(1);
        expect(mockScreen).toHaveBeenCalledWith('home');

        segments[0] = 'settings';
        rerender();

        expect(mockScreen).toHaveBeenCalledTimes(2);
        expect(mockScreen).toHaveBeenLastCalledWith('settings');
    });

    it('should not re-track when route stays the same', () => {
        mockUseSegments.mockReturnValue(['home']);
        const { rerender } = renderHook(() => useTrackScreens());

        expect(mockScreen).toHaveBeenCalledTimes(1);
        rerender();
        // Effect dep [route] unchanged → should not fire again
        expect(mockScreen).toHaveBeenCalledTimes(1);
    });
});
