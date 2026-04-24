import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/hubToken', () => ({
    getHubToken: vi.fn().mockResolvedValue('test-hub-token'),
    invalidateHubToken: vi.fn(),
}));

const getCurrentAuthMock = vi.fn().mockReturnValue(null);
const getServerUrlMock = vi.fn(() => 'http://happy-server.test');

vi.mock('@/auth/AuthContext', () => ({
    getCurrentAuth: getCurrentAuthMock,
}));

vi.mock('@/sync/serverConfig', () => ({
    getServerUrl: getServerUrlMock,
}));

function makeGenome(
    name: string,
    namespace = '@official',
    overrides: Partial<{
        runtimeType: 'claude' | 'codex' | 'open-code' | null;
        tags: string | null;
        feedbackData: string | null;
        spawnCount: number;
    }> = {},
) {
    return {
        id: `genome-${name}`,
        namespace,
        name,
        version: 1,
        status: 'official' as const,
        description: null,
        spec: '{}',
        tags: overrides.tags ?? null,
        category: null,
        isPublic: namespace === '@official',
        spawnCount: overrides.spawnCount ?? 0,
        downloadCount: 0,
        starCount: 0,
        feedbackData: overrides.feedbackData ?? null,
        publisherId: null,
        parentId: null,
        runtimeType: overrides.runtimeType ?? ('claude' as const),
        lifecycle: null,
        createdAt: '2026-03-29T00:00:00.000Z',
        updatedAt: '2026-03-29T00:00:00.000Z',
    };
}

describe('genomeHub role alias lookup', () => {
    const originalGenomeHubUrl = process.env.EXPO_PUBLIC_GENOME_HUB_URL;

    beforeEach(() => {
        process.env.EXPO_PUBLIC_GENOME_HUB_URL = 'http://genome-hub.test';
        getCurrentAuthMock.mockReturnValue(null);
        getServerUrlMock.mockReturnValue('http://happy-server.test');
        vi.resetModules();
    });

    afterEach(() => {
        if (originalGenomeHubUrl === undefined) {
            delete process.env.EXPO_PUBLIC_GENOME_HUB_URL;
        } else {
            process.env.EXPO_PUBLIC_GENOME_HUB_URL = originalGenomeHubUrl;
        }
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('canonicalizes retired official role names before hitting genome-hub', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                genome: makeGenome('implementer', '@official', {
                    tags: '["official","canonical","builder"]',
                }),
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeByName } = await import('./genomeHub');
        const genome = await fetchGenomeByName('@official', 'builder');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40official/implementer',
            expect.any(Object),
        );
        expect(genome?.name).toBe('implementer');
    });

    it('maps official aliases to canonical lookup names in the frontend', async () => {
        const { resolveCanonicalGenomeName, resolveOfficialRoleGenomeName } = await import('./genomeHub');

        expect(resolveCanonicalGenomeName('@official', 'architect')).toBe('researcher');
        expect(resolveCanonicalGenomeName('@official', 'paper_writer')).toBe('researcher');
        expect(resolveCanonicalGenomeName('@official', 'builder')).toBe('implementer');
        expect(resolveCanonicalGenomeName('@private', 'StoryTeller')).toBe('StoryTeller');
        expect(resolveOfficialRoleGenomeName('design-architect')).toBe('gstack-design-architect');
        expect(resolveOfficialRoleGenomeName('harness-architect')).toBeNull();
    });

    it('preserves non-official names instead of lowercasing them', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genome: makeGenome('MyPrivateBuilder', '@private') }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeByName } = await import('./genomeHub');
        const genome = await fetchGenomeByName('@private', 'MyPrivateBuilder');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40private/MyPrivateBuilder',
            expect.any(Object),
        );
        expect(genome?.namespace).toBe('@private');
        expect(genome?.name).toBe('MyPrivateBuilder');
    });

    it('prefers canonical official role lookup before stale spec ids', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genome: makeGenome('researcher', '@official') }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeWithOfficialFallback } = await import('./genomeHub');
        const genome = await fetchGenomeWithOfficialFallback({
            roleId: 'architect',
            runtimeType: 'claude',
            specId: '@official/harness-architect',
        });

        expect(genome?.name).toBe('researcher');
        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40official/researcher',
            expect.any(Object),
        );
        expect(fetchMock).not.toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40official/harness-architect',
            expect.any(Object),
        );
    });

    it('skips unknown official refs instead of issuing guaranteed 404 lookups', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeWithOfficialFallback } = await import('./genomeHub');
        const genome = await fetchGenomeWithOfficialFallback({
            specId: '@official/harness-architect',
        });

        expect(genome).toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not fall back to stale opaque ids once an official role lookup has already failed', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({}),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeWithOfficialFallback } = await import('./genomeHub');
        const genome = await fetchGenomeWithOfficialFallback({
            roleId: 'architect',
            runtimeType: 'claude',
            specId: 'cmnhuelkt001cfxws3bwgb9p1',
        });

        expect(genome).toBeNull();
        expect(fetchMock).not.toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/id/cmnhuelkt001cfxws3bwgb9p1',
            expect.any(Object),
        );
    });

    it('derives genome hub URL from the configured server URL when hub env is missing', async () => {
        delete process.env.EXPO_PUBLIC_GENOME_HUB_URL;
        getServerUrlMock.mockReturnValue('https://tenant.example.com/api');
        vi.resetModules();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genomes: [], total: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { searchGenomes } = await import('./genomeHub');
        await searchGenomes({ limit: 1 });

        expect(fetchMock).toHaveBeenCalledWith(
            'https://tenant.example.com/genome/genomes?limit=1',
            expect.any(Object),
        );
    });

    it('derives direct local genome hub ports from direct local server ports', async () => {
        delete process.env.EXPO_PUBLIC_GENOME_HUB_URL;
        getServerUrlMock.mockReturnValue('http://localhost:3005');
        vi.resetModules();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genomes: [], total: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { searchGenomes } = await import('./genomeHub');
        await searchGenomes({ limit: 1 });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://localhost:3006/genomes?limit=1',
            expect.any(Object),
        );
    });

    it('passes runtimeType through search queries', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genomes: [], total: 0 }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { searchGenomes } = await import('./genomeHub');
        await searchGenomes({ namespace: '@official', runtimeType: 'codex', limit: 20 });

        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes?namespace=%40official&runtimeType=codex&limit=20',
            expect.any(Object),
        );
    });

    it('returns null when the official genome runtime does not match the requested runtime', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genome: makeGenome('org-manager') }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchPreferredGenomeByName } = await import('./genomeHub');
        const genome = await fetchPreferredGenomeByName('@official', 'org-manager', 'codex');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40official/org-manager',
            expect.any(Object),
        );
        expect(genome).toBeNull();
    });

    it('falls back to a runtime-matching marketplace genome when the official lineage uses another runtime', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ genome: makeGenome('org-manager') }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    genomes: [
                        makeGenome('codex-org-manager', '@community', {
                            runtimeType: 'codex',
                            tags: '["org-manager","coordination"]',
                            feedbackData: '{"avgScore":88,"evaluationCount":4}',
                            spawnCount: 5,
                        }),
                    ],
                    total: 1,
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const { resolvePreferredGenomeForRole } = await import('./genomeHub');
        const genome = await resolvePreferredGenomeForRole('org-manager', 'codex');

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://genome-hub.test/genomes/%40official/org-manager',
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://genome-hub.test/genomes?q=org-manager&runtimeType=codex&sortBy=score&limit=20',
            expect.any(Object),
        );
        expect(genome?.namespace).toBe('@community');
        expect(genome?.runtimeType).toBe('codex');
        expect(genome?.name).toBe('codex-org-manager');
    });

    it('lets genome-hub resolve legacy official diff and seed lookups', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ diffs: [{ id: 'diff-1', genomeId: 'genome-implementer', version: 2, description: 'builder->implementer', verdictRefs: null, changes: '[]', strategy: 'conservative', authorRole: 'supervisor', createdAt: '2026-03-29T00:00:00.000Z' }] }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ seed: '{"role":"implementer"}' }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeDiffs, fetchGenomeSeed } = await import('./genomeHub');
        const diffs = await fetchGenomeDiffs('@official', 'builder');
        const seed = await fetchGenomeSeed('@official', 'builder');

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://genome-hub.test/genomes/%40official/implementer/diffs',
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://genome-hub.test/genomes/%40official/implementer/seed',
            expect.any(Object),
        );
        expect(diffs).toHaveLength(1);
        expect(seed).toBe('{"role":"implementer"}');
    });

    it('lets genome-hub resolve legacy official ledger lookups and surfaces replay evidence', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                ledger: [
                    {
                        id: 'ledger-1',
                        genomeId: 'genome-implementer',
                        version: 2,
                        seqNo: 1,
                        timestamp: '2026-03-30T00:00:00.000Z',
                        diffType: 'kv',
                        path: 'behavior.onIdle',
                        op: null,
                        oldValue: '"wait"',
                        newValue: '"self-assign"',
                        content: null,
                    },
                ],
                replayedSpec: '{"role":"implementer","version":2}',
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeLedger } = await import('./genomeHub');
        const result = await fetchGenomeLedger('@official', 'builder', 2);

        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40official/implementer/ledger?version=2',
            expect.any(Object),
        );
        expect(result.ledger).toHaveLength(1);
        expect(result.replayedSpec).toBe('{"role":"implementer","version":2}');
    });

    it('deduplicates repeated genome-by-id reads within the cache window', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genome: makeGenome('help-agent') }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeById } = await import('./genomeHub');
        const first = await fetchGenomeById('cmnhtzjs4000sfxwsl6psjv97');
        const second = await fetchGenomeById('cmnhtzjs4000sfxwsl6psjv97');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first?.name).toBe('help-agent');
        expect(second?.name).toBe('help-agent');
    });

    it('enters a short cooldown after a 429 and skips follow-up reads during that window', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({}),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeByName, fetchGenomeById } = await import('./genomeHub');
        const first = await fetchGenomeByName('@official', 'help-agent');
        const second = await fetchGenomeById('cmnhtzjs4000sfxwsl6psjv97');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(first).toBeNull();
        expect(second).toBeNull();
    });

    it('treats namespaced refs passed into fetchGenomeById as lineage lookups', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ genome: makeGenome('help-agent') }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeById } = await import('./genomeHub');
        const genome = await fetchGenomeById('@official/help-agent');

        expect(fetchMock).toHaveBeenCalledWith(
            'http://genome-hub.test/genomes/%40official/help-agent',
            expect.any(Object),
        );
        expect(genome?.name).toBe('help-agent');
    });

    it('falls back to the authenticated happy-server genome route when hub returns 404 for an id lookup', async () => {
        getCurrentAuthMock.mockReturnValue({
            credentials: {
                token: 'server-token',
            },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({}),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ genome: makeGenome('local-helper', '@private') }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeById } = await import('./genomeHub');
        const genome = await fetchGenomeById('cmnhuirnm0026fxws72k0bcjf');

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://genome-hub.test/genomes/id/cmnhuirnm0026fxws72k0bcjf',
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://happy-server.test/v1/genomes/cmnhuirnm0026fxws72k0bcjf',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer server-token',
                }),
            }),
        );
        expect(genome?.namespace).toBe('@private');
        expect(genome?.name).toBe('local-helper');
    });

    it('falls back to the authenticated happy-server genome route when hub returns 404 for a namespaced lookup', async () => {
        getCurrentAuthMock.mockReturnValue({
            credentials: {
                token: 'server-token',
            },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                json: async () => ({}),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ genomes: [], total: 0 }),
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ genome: makeGenome('help-agent', '@private') }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeByName } = await import('./genomeHub');
        const genome = await fetchGenomeByName('@official', 'help-agent');

        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://genome-hub.test/genomes/%40official/help-agent',
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            'http://genome-hub.test/genomes?q=help-agent&namespace=%40official&sortBy=score&limit=20',
            expect.any(Object),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            'http://happy-server.test/v1/genomes/%40official/help-agent/latest',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer server-token',
                }),
            }),
        );
        expect(genome?.namespace).toBe('@private');
        expect(genome?.name).toBe('help-agent');
    });

    it('falls back to the local visible genome list for plain non-id names', async () => {
        getCurrentAuthMock.mockReturnValue({
            credentials: {
                token: 'server-token',
            },
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    genomes: [
                        makeGenome('x-content-creator-v1', '@private'),
                    ],
                }),
            });
        vi.stubGlobal('fetch', fetchMock);

        const { fetchGenomeById } = await import('./genomeHub');
        const genome = await fetchGenomeById('x-content-creator-v1');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            'http://happy-server.test/v1/genomes?limit=200',
            expect.objectContaining({
                headers: expect.objectContaining({
                    Authorization: 'Bearer server-token',
                }),
            }),
        );
        expect(genome?.name).toBe('x-content-creator-v1');
    });

    it('derives safe legion member labels from canonical and legacy member fields', async () => {
        const { getLegionMemberDisplayName, getLegionMemberReference } = await import('./genomeHub');

        expect(getLegionMemberDisplayName({
            roleAlias: 'org-manager',
            genome: '@official/org-manager',
        })).toBe('org-manager');

        expect(getLegionMemberDisplayName({
            displayName: '军团指挥官',
            genomeRef: 'Army Commander',
        })).toBe('军团指挥官');

        expect(getLegionMemberDisplayName({
            genome: '@official/master:5',
        })).toBe('master:5');

        expect(getLegionMemberDisplayName({
            role: 'content-strategist',
            genomeRef: 'legacy/content-strategist',
        })).toBe('content-strategist');

        expect(getLegionMemberDisplayName({})).toBe('?');
        expect(getLegionMemberReference({
            genomeRef: 'legacy/content-strategist',
        })).toBe('legacy/content-strategist');
    });
});
