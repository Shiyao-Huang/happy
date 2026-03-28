import { describe, expect, it } from 'vitest';

import {
    buildSessionActivityMetrics,
    compareAgentSidebarEntries,
    formatTokenRateLabel,
    getStableSessionOrder,
    getTokenRateAccentColor,
    getTokenRateBucket,
} from './sessionActivityRanking';

function createSession(overrides: Record<string, any> = {}) {
    return {
        id: 'session-1',
        createdAt: 1000,
        metadata: null,
        latestUsage: null,
        ...overrides,
    };
}

describe('sessionActivityRanking', () => {
    it('computes a smoothed token rate from successive usage snapshots', () => {
        const first = buildSessionActivityMetrics([
            createSession({
                id: 'agent-a',
                latestUsage: {
                    inputTokens: 600,
                    outputTokens: 200,
                    cacheCreation: 0,
                    cacheRead: 0,
                    contextSize: 800,
                    timestamp: 10000,
                },
            }),
        ], new Map(), 10000);

        expect(first.metrics.get('agent-a')?.tokenRate).toBe(0);
        expect(first.metrics.get('agent-a')?.tokenRateBucket).toBe(0);

        const second = buildSessionActivityMetrics([
            createSession({
                id: 'agent-a',
                latestUsage: {
                    inputTokens: 1100,
                    outputTokens: 500,
                    cacheCreation: 0,
                    cacheRead: 0,
                    contextSize: 1600,
                    timestamp: 12000,
                },
            }),
        ], first.snapshots, 12000);

        expect(second.metrics.get('agent-a')?.tokenRate).toBe(400);
        expect(second.metrics.get('agent-a')?.tokenRateBucket).toBe(3);
    });

    it('decays stale rates instead of keeping agents permanently hot', () => {
        const seededSnapshots = new Map([
            ['agent-a', {
                totalTokens: 1600,
                usageTimestamp: 12000,
                smoothedRate: 180,
            }],
        ]);

        const result = buildSessionActivityMetrics([
            createSession({
                id: 'agent-a',
                latestUsage: {
                    inputTokens: 1100,
                    outputTokens: 500,
                    cacheCreation: 0,
                    cacheRead: 0,
                    contextSize: 1600,
                    timestamp: 12000,
                },
            }),
        ], seededSnapshots, 60000);

        expect(result.metrics.get('agent-a')?.tokenRate).toBe(0);
        expect(result.metrics.get('agent-a')?.tokenRateBucket).toBe(0);
    });

    it('sorts by activity bucket before falling back to stable spawn order', () => {
        const entries = [
            {
                name: 'Gamma',
                inactive: false,
                dead: false,
                tokenRateBucket: 2,
                stableOrder: 30,
            },
            {
                name: 'Alpha',
                inactive: false,
                dead: false,
                tokenRateBucket: 2,
                stableOrder: 10,
            },
            {
                name: 'Beta',
                inactive: false,
                dead: false,
                tokenRateBucket: 3,
                stableOrder: 20,
            },
            {
                name: 'Offline',
                inactive: true,
                dead: false,
                tokenRateBucket: 3,
                stableOrder: 5,
            },
        ];

        expect(entries.sort(compareAgentSidebarEntries).map((entry) => entry.name)).toEqual([
            'Beta',
            'Alpha',
            'Gamma',
            'Offline',
        ]);
    });

    it('exposes stable helper labels for the sidebar chip', () => {
        expect(getTokenRateBucket(9.9)).toBe(0);
        expect(getTokenRateBucket(75)).toBe(2);
        expect(formatTokenRateLabel(1250)).toBe('1.3K tok/s');
        expect(getStableSessionOrder(createSession({ metadata: { processStartedAt: 42 } }))).toBe(42);
    });
});

describe('buildSessionActivityMetrics (boundary)', () => {
    it('returns empty maps for an empty session list', () => {
        const result = buildSessionActivityMetrics([], new Map(), 10000);
        expect(result.metrics.size).toBe(0);
        expect(result.snapshots.size).toBe(0);
    });

    it('handles a session with null latestUsage', () => {
        const result = buildSessionActivityMetrics(
            [createSession({ id: 'no-usage', latestUsage: null })],
            new Map(),
            10000,
        );
        expect(result.metrics.get('no-usage')?.tokenRate).toBe(0);
        expect(result.metrics.get('no-usage')?.tokenRateBucket).toBe(0);
        expect(result.snapshots.get('no-usage')?.totalTokens).toBe(0);
    });

    it('tracks multiple sessions independently', () => {
        const sessions = [
            createSession({
                id: 'session-a',
                latestUsage: {
                    inputTokens: 100, outputTokens: 0,
                    cacheCreation: 0, cacheRead: 0,
                    contextSize: 100, timestamp: 5000,
                },
            }),
            createSession({ id: 'session-b', latestUsage: null }),
        ];
        const result = buildSessionActivityMetrics(sessions, new Map(), 5000);
        expect(result.metrics.has('session-a')).toBe(true);
        expect(result.metrics.has('session-b')).toBe(true);
        expect(result.metrics.get('session-b')?.tokenRate).toBe(0);
    });

    it('resets smoothed rate when total tokens decrease (rollback detection)', () => {
        const prevSnapshots = new Map([
            ['agent-x', { totalTokens: 1000, usageTimestamp: 10000, smoothedRate: 200 }],
        ]);
        // totalTokens (50) < previous.totalTokens (1000) → delta = 50
        // elapsed = 1 s, instantRate = 50 tok/s
        // smoothedRate = 200 + (50 - 200) * 0.35 = 147.5
        const result = buildSessionActivityMetrics(
            [createSession({
                id: 'agent-x',
                latestUsage: {
                    inputTokens: 50, outputTokens: 0,
                    cacheCreation: 0, cacheRead: 0,
                    contextSize: 50, timestamp: 11000,
                },
            })],
            prevSnapshots,
            11000,
        );
        expect(result.metrics.get('agent-x')?.tokenRate).toBeCloseTo(147.5, 0);
    });

    it('records snapshot even when no previous snapshot exists', () => {
        const sessions = [
            createSession({
                id: 'new-agent',
                latestUsage: {
                    inputTokens: 300, outputTokens: 0,
                    cacheCreation: 0, cacheRead: 0,
                    contextSize: 300, timestamp: 8000,
                },
            }),
        ];
        const result = buildSessionActivityMetrics(sessions, new Map(), 8000);
        // First snapshot: smoothedRate = 0 (no previous), usageAgeMs = 0
        expect(result.snapshots.get('new-agent')?.usageTimestamp).toBe(8000);
        expect(result.metrics.get('new-agent')?.tokenRate).toBe(0);
    });
});

describe('getTokenRateBucket (boundary)', () => {
    it('returns 0 for NaN (non-finite)', () => expect(getTokenRateBucket(NaN)).toBe(0));
    it('returns 0 for Infinity (non-finite)', () => expect(getTokenRateBucket(Infinity)).toBe(0));
    it('returns 0 for negative rate', () => expect(getTokenRateBucket(-1)).toBe(0));
    it('returns 0 for zero', () => expect(getTokenRateBucket(0)).toBe(0));
    it('returns 0 for rate just below LIGHT threshold (9.9)', () => expect(getTokenRateBucket(9.9)).toBe(0));
    it('returns 1 at LIGHT threshold (10)', () => expect(getTokenRateBucket(10)).toBe(1));
    it('returns 1 between LIGHT and WARM (30)', () => expect(getTokenRateBucket(30)).toBe(1));
    it('returns 2 at WARM threshold (60)', () => expect(getTokenRateBucket(60)).toBe(2));
    it('returns 2 just below HOT threshold (159)', () => expect(getTokenRateBucket(159)).toBe(2));
    it('returns 3 at HOT threshold (160)', () => expect(getTokenRateBucket(160)).toBe(3));
    it('returns 3 well above HOT threshold (500)', () => expect(getTokenRateBucket(500)).toBe(3));
});

describe('getTokenRateAccentColor', () => {
    it('returns muted grey for bucket 0', () => expect(getTokenRateAccentColor(0)).toBe('#8A9BAA'));
    it('returns green for bucket 1', () => expect(getTokenRateAccentColor(1)).toBe('#34C759'));
    it('returns blue for bucket 2', () => expect(getTokenRateAccentColor(2)).toBe('#2E90FA'));
    it('returns orange for bucket >= 3', () => {
        expect(getTokenRateAccentColor(3)).toBe('#FF8A00');
        expect(getTokenRateAccentColor(99)).toBe('#FF8A00');
    });
    it('returns muted grey for negative bucket', () => expect(getTokenRateAccentColor(-1)).toBe('#8A9BAA'));
});

describe('formatTokenRateLabel (boundary)', () => {
    it('returns undefined for NaN', () => expect(formatTokenRateLabel(NaN)).toBeUndefined());
    it('returns undefined for Infinity (non-finite)', () => expect(formatTokenRateLabel(Infinity)).toBeUndefined());
    it('returns undefined for rate below threshold (9.9)', () => expect(formatTokenRateLabel(9.9)).toBeUndefined());
    it('returns compact label at LIGHT threshold (10)', () => expect(formatTokenRateLabel(10)).toBe('10 tok/s'));
    it('returns rounded label for hundreds (150)', () => expect(formatTokenRateLabel(150)).toBe('150 tok/s'));
    it('returns K-suffix for thousands (1000)', () => expect(formatTokenRateLabel(1000)).toBe('1.0K tok/s'));
    it('returns M-suffix for millions (2000000)', () => expect(formatTokenRateLabel(2000000)).toBe('2.0M tok/s'));
});

describe('getStableSessionOrder (boundary)', () => {
    it('returns createdAt when metadata is null', () => {
        expect(getStableSessionOrder(createSession({ createdAt: 500, metadata: null }))).toBe(500);
    });

    it('returns createdAt when metadata has no processStartedAt field', () => {
        expect(getStableSessionOrder(createSession({ createdAt: 500, metadata: {} }))).toBe(500);
    });

    it('falls back to createdAt when processStartedAt is NaN', () => {
        expect(
            getStableSessionOrder(createSession({ createdAt: 500, metadata: { processStartedAt: NaN } })),
        ).toBe(500);
    });

    it('falls back to createdAt when processStartedAt is a string', () => {
        expect(
            getStableSessionOrder(createSession({ createdAt: 500, metadata: { processStartedAt: '42' } })),
        ).toBe(500);
    });
});

describe('compareAgentSidebarEntries (boundary)', () => {
    it('sorts inactive+dead after inactive+alive', () => {
        const alive = { name: 'Alive', inactive: true, dead: false, tokenRateBucket: 0, stableOrder: 1 };
        const dead = { name: 'Dead', inactive: true, dead: true, tokenRateBucket: 0, stableOrder: 1 };
        expect(compareAgentSidebarEntries(alive, dead)).toBeLessThan(0);
        expect(compareAgentSidebarEntries(dead, alive)).toBeGreaterThan(0);
    });

    it('breaks ties on all numeric fields by name alphabetically', () => {
        const alpha = { name: 'Alpha', inactive: false, dead: false, tokenRateBucket: 1, stableOrder: 100 };
        const zeta = { name: 'Zeta', inactive: false, dead: false, tokenRateBucket: 1, stableOrder: 100 };
        expect(compareAgentSidebarEntries(alpha, zeta)).toBeLessThan(0);
        expect(compareAgentSidebarEntries(zeta, alpha)).toBeGreaterThan(0);
    });

    it('returns 0 for identical entries', () => {
        const entry = { name: 'Same', inactive: false, dead: false, tokenRateBucket: 2, stableOrder: 50 };
        expect(compareAgentSidebarEntries(entry, entry)).toBe(0);
    });

    it('active entries always come before inactive entries regardless of bucket', () => {
        const activeHighBucket = {
            name: 'HotActive', inactive: false, dead: false, tokenRateBucket: 0, stableOrder: 999,
        };
        const inactiveLowBucket = {
            name: 'ColdInactive', inactive: true, dead: false, tokenRateBucket: 3, stableOrder: 1,
        };
        expect(compareAgentSidebarEntries(activeHighBucket, inactiveLowBucket)).toBeLessThan(0);
    });
});
