import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';
import type { DecryptedArtifact } from '@/sync/artifactTypes';

// Hoisted mocks
const mockFetchArtifactWithBody = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const mockCreateArtifact = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockUseFocusEffect = vi.hoisted(() => vi.fn());

vi.mock('@react-navigation/native', () => ({
    useFocusEffect: mockUseFocusEffect,
}));

vi.mock('@/sync/sync', () => ({
    sync: {
        fetchArtifactWithBody: mockFetchArtifactWithBody,
        createArtifact: mockCreateArtifact,
    },
}));

vi.mock('@/sync/kanbanTypes', () => ({
    DEFAULT_KANBAN_BOARD: { title: 'Board', tasks: [], columns: [] },
    DEFAULT_TEAM_ROLES: [],
    DEFAULT_TEAM_AGREEMENTS: { statusUpdates: '', handoffs: '', escalation: '', definitionOfDone: '' },
    KanbanBoard: {},
}));

import { useArtifactAutoInit } from './useArtifactAutoInit';

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

const mockRouter = {
    replace: vi.fn(),
};

function makeBaseParams(overrides = {}) {
    return {
        teamId: 'team-1',
        // default: artifact exists so auto-init doesn't fire; override to null for init tests
        artifact: { id: 'art-1' } as unknown as DecryptedArtifact | null | undefined,
        isAuthenticated: true,
        desktopBridge: null as unknown,
        hasLocalTeamSessions: false,
        isDataReady: true,
        isLoading: false,
        setIsLoading: vi.fn(),
        router: mockRouter,
        ...overrides,
    };
}

describe('useArtifactAutoInit', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        // useFocusEffect is a no-op in tests (no React Navigation context)
        mockUseFocusEffect.mockImplementation(() => undefined);
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    it('returns autoInitAttempted as false initially', () => {
        const params = makeBaseParams();
        const { result } = renderHook(() => useArtifactAutoInit(params));
        expect(result.current.autoInitAttempted).toBe(false);
    });

    it('returns redirectUnavailableTeam as a function', () => {
        const params = makeBaseParams();
        const { result } = renderHook(() => useArtifactAutoInit(params));
        expect(typeof result.current.redirectUnavailableTeam).toBe('function');
    });

    it('redirectUnavailableTeam does nothing when desktopBridge is present', () => {
        const params = makeBaseParams({ desktopBridge: { isBridge: true } });
        const { result } = renderHook(() => useArtifactAutoInit(params));

        act(() => {
            result.current.redirectUnavailableTeam();
        });

        expect(mockRouter.replace).not.toHaveBeenCalled();
    });

    it('redirectUnavailableTeam navigates to /teams when no desktop bridge', () => {
        const params = makeBaseParams({ desktopBridge: null });
        const { result } = renderHook(() => useArtifactAutoInit(params));

        act(() => {
            result.current.redirectUnavailableTeam();
        });

        expect(mockRouter.replace).toHaveBeenCalledWith('/teams');
    });

    it('redirectUnavailableTeam only redirects once (idempotent)', () => {
        const params = makeBaseParams({ desktopBridge: null });
        const { result } = renderHook(() => useArtifactAutoInit(params));

        act(() => {
            result.current.redirectUnavailableTeam();
            result.current.redirectUnavailableTeam();
        });

        expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    });

    it('does not trigger auto-init when desktopBridge is present', () => {
        const params = makeBaseParams({
            desktopBridge: { isBridge: true },
            artifact: null,
            isDataReady: true,
            isAuthenticated: true,
        });

        renderHook(() => useArtifactAutoInit(params));

        expect(mockFetchArtifactWithBody).not.toHaveBeenCalled();
    });

    it('triggers auto-init fetch when artifact is null and conditions are met', async () => {
        mockFetchArtifactWithBody.mockResolvedValueOnce({ id: 'art-1', body: '{}' });

        const params = makeBaseParams({
            desktopBridge: null,
            artifact: null,
            isDataReady: true,
            isAuthenticated: true,
            isLoading: false,
        });

        renderHook(() => useArtifactAutoInit(params));

        // allow microtasks to flush
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockFetchArtifactWithBody).toHaveBeenCalledWith('team-1');
    });
});
