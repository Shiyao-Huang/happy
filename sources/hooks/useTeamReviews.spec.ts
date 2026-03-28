import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

// Hoisted mocks
const mockSync = vi.hoisted(() => ({
    getCredentials: vi.fn(),
}));

const mockGetServerUrl = vi.hoisted(() => vi.fn().mockReturnValue('https://test-server.example'));

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock('@/sync/sync', () => ({
    sync: mockSync,
}));

vi.mock('@/sync/serverConfig', () => ({
    getServerUrl: mockGetServerUrl,
}));

// Replace global fetch
vi.stubGlobal('fetch', mockFetch);

import { useTeamReviews } from './useTeamReviews';

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
        rerender: (newHook?: () => Result) => {
            act(() => {
                renderer.update(React.createElement(newHook ? function W() { result.current = newHook(); return null; } : Wrapper));
            });
        },
        unmount: () => {
            act(() => {
                renderer.unmount();
            });
        },
    };
}

describe('useTeamReviews', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockGetServerUrl.mockReturnValue('https://test-server.example');
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: any) => {
            if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
                return;
            }
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('returns empty state initially', () => {
        mockSync.getCredentials.mockReturnValue(null);

        const { result } = renderHook(() => useTeamReviews('team-1', false));

        expect(result.current.teamScorecard).toBeNull();
        expect(result.current.teamPublicReviews).toEqual([]);
        expect(result.current.teamReviewLoading).toBe(false);
    });

    it('clears state and skips fetch when not authenticated', async () => {
        mockSync.getCredentials.mockReturnValue({ token: 'abc' });

        const { result } = renderHook(() => useTeamReviews('team-1', false));

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.current.teamScorecard).toBeNull();
        expect(result.current.teamPublicReviews).toEqual([]);
        expect(result.current.teamReviewLoading).toBe(false);
    });

    it('clears state and skips fetch when credentials are null', async () => {
        mockSync.getCredentials.mockReturnValue(null);

        const { result } = renderHook(() => useTeamReviews('team-1', true));

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.current.teamScorecard).toBeNull();
    });

    it('clears state and skips fetch when teamId is empty', async () => {
        mockSync.getCredentials.mockReturnValue({ token: 'abc' });

        const { result } = renderHook(() => useTeamReviews('', true));

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.current.teamScorecard).toBeNull();
    });

    it('fetches scorecard and reviews when authenticated with valid teamId', async () => {
        const mockScorecard = { averageRating: 4.5, reviewCount: 10 };
        const mockReviews = [{ id: 'r1', rating: 5 }, { id: 'r2', rating: 4 }];

        mockSync.getCredentials.mockReturnValue({ token: 'bearer-token' });
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/score')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockScorecard),
                });
            }
            if (url.includes('/reviews')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ reviews: mockReviews }),
                });
            }
            return Promise.resolve({ ok: false });
        });

        const { result } = renderHook(() => useTeamReviews('team-abc', true));

        // Loading starts
        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockFetch).toHaveBeenCalledWith(
            'https://test-server.example/v1/teams/team-abc/score',
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer bearer-token' }) }),
        );
        expect(mockFetch).toHaveBeenCalledWith(
            'https://test-server.example/v1/teams/team-abc/reviews?limit=3',
            expect.anything(),
        );

        expect(result.current.teamScorecard).toEqual(mockScorecard);
        expect(result.current.teamPublicReviews).toEqual(mockReviews);
        expect(result.current.teamReviewLoading).toBe(false);
    });

    it('URL-encodes teamId with special characters', async () => {
        mockSync.getCredentials.mockReturnValue({ token: 'tok' });
        mockFetch.mockResolvedValue({ ok: false });

        renderHook(() => useTeamReviews('team/special id', true));

        await act(async () => { await Promise.resolve(); });

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('team%2Fspecial%20id'),
            expect.anything(),
        );
    });

    it('degrades to empty state when score fetch fails', async () => {
        mockSync.getCredentials.mockReturnValue({ token: 'tok' });
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/score')) {
                return Promise.resolve({ ok: false });
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ reviews: [{ id: 'r1' }] }),
            });
        });

        const { result } = renderHook(() => useTeamReviews('team-1', true));

        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); });

        expect(result.current.teamScorecard).toBeNull();
        expect(result.current.teamPublicReviews).toEqual([{ id: 'r1' }]);
        expect(result.current.teamReviewLoading).toBe(false);
    });

    it('degrades to empty reviews when reviews fetch fails', async () => {
        const mockScorecard = { averageRating: 3.0, reviewCount: 2 };
        mockSync.getCredentials.mockReturnValue({ token: 'tok' });
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/score')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(mockScorecard),
                });
            }
            return Promise.resolve({ ok: false });
        });

        const { result } = renderHook(() => useTeamReviews('team-1', true));

        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); });

        expect(result.current.teamScorecard).toEqual(mockScorecard);
        expect(result.current.teamPublicReviews).toEqual([]);
    });

    it('clears state when fetch rejects', async () => {
        mockSync.getCredentials.mockReturnValue({ token: 'tok' });
        mockFetch.mockRejectedValue(new Error('network error'));

        const { result } = renderHook(() => useTeamReviews('team-1', true));

        await act(async () => { await Promise.resolve(); });
        await act(async () => { await Promise.resolve(); });

        expect(result.current.teamScorecard).toBeNull();
        expect(result.current.teamPublicReviews).toEqual([]);
        expect(result.current.teamReviewLoading).toBe(false);
    });

    it('does not setState after unmount (cancelled flag)', async () => {
        let resolveScore!: (v: any) => void;
        const scorePromise = new Promise<Response>((res) => { resolveScore = res; });

        mockSync.getCredentials.mockReturnValue({ token: 'tok' });
        mockFetch.mockImplementation((url: string) => {
            if (url.includes('/score')) return scorePromise;
            return Promise.resolve({ ok: false });
        });

        const { unmount } = renderHook(() => useTeamReviews('team-1', true));

        await act(async () => { await Promise.resolve(); });

        // Unmount before fetch resolves
        unmount();

        // Resolve after unmount — should not throw or setState
        await act(async () => {
            resolveScore({ ok: true, json: () => Promise.resolve({ averageRating: 5 }) });
            await Promise.resolve();
            await Promise.resolve();
        });

        // No assertion other than no error thrown
    });
});
