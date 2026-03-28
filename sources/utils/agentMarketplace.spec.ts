import { describe, expect, it, vi } from 'vitest';

import type { AuthCredentials } from '@/auth/tokenStorage';
import type { Genome as PrivateGenome } from '@/sync/apiEvolution';

import type { GenomeRecord } from './genomeHub';
import {
    fetchAccessibleGenomeById,
    filterPrivateMarketplaceGenomes,
    isSpecialMarketplaceGenome,
    mapOwnedPrivateGenomesToRecords,
    selectMarketplaceGenomes,
    sortGenomesForDisplay,
    toGenomeRecordFromPrivateGenome,
} from './agentMarketplace';

function createGenomeRecord(overrides: Partial<GenomeRecord> & Pick<GenomeRecord, 'id' | 'name'>): GenomeRecord {
    return {
        id: overrides.id,
        namespace: overrides.namespace ?? '@public',
        name: overrides.name,
        version: overrides.version ?? 1,
        status: overrides.status ?? 'draft',
        description: overrides.description ?? null,
        spec: overrides.spec ?? '{}',
        tags: overrides.tags ?? null,
        category: overrides.category ?? null,
        isPublic: overrides.isPublic ?? true,
        spawnCount: overrides.spawnCount ?? 0,
        downloadCount: overrides.downloadCount ?? 0,
        starCount: overrides.starCount ?? 0,
        feedbackData: overrides.feedbackData ?? null,
        lifecycle: overrides.lifecycle ?? null,
        publisherId: overrides.publisherId ?? null,
        parentId: overrides.parentId ?? null,
        createdAt: overrides.createdAt ?? '2026-03-17T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-03-17T00:00:00.000Z',
    };
}

function createPrivateGenome(overrides: Partial<PrivateGenome> & Pick<PrivateGenome, 'id' | 'name' | 'accountId'>): PrivateGenome {
    return {
        id: overrides.id,
        accountId: overrides.accountId,
        namespace: overrides.namespace ?? null,
        name: overrides.name,
        version: overrides.version ?? 1,
        description: overrides.description ?? null,
        spec: overrides.spec ?? '{}',
        parentSessionId: overrides.parentSessionId ?? 'session-1',
        teamId: overrides.teamId ?? null,
        tags: overrides.tags ?? null,
        category: overrides.category ?? null,
        spawnCount: overrides.spawnCount ?? 0,
        lastSpawnedAt: overrides.lastSpawnedAt ?? null,
        isPublic: overrides.isPublic ?? false,
        feedbackData: overrides.feedbackData ?? null,
        createdAt: overrides.createdAt ?? '2026-03-17T00:00:00.000Z',
        updatedAt: overrides.updatedAt ?? '2026-03-17T00:00:00.000Z',
    };
}

describe('agentMarketplace', () => {
    it('filters private genomes by tab, category, and query', () => {
        const genomes = [
            createGenomeRecord({
                id: 'g1',
                name: 'Coordinator Alpha',
                category: 'coordination',
                tags: '["planner"]',
                spec: JSON.stringify({ runtimeType: 'codex', resume: { specialties: ['Go review'] } }),
            }),
            createGenomeRecord({ id: 'g2', name: 'Support Beta', category: 'support' }),
            createGenomeRecord({ id: 'g3', name: 'Corps Gamma', category: 'corps' }),
        ];

        expect(filterPrivateMarketplaceGenomes(genomes, {
            tab: 'agents',
            category: 'coordination',
            query: 'planner',
        }).map((genome) => genome.id)).toEqual(['g1']);

        expect(filterPrivateMarketplaceGenomes(genomes, {
            tab: 'corps',
            category: 'all',
            query: '',
        }).map((genome) => genome.id)).toEqual(['g3']);

        expect(filterPrivateMarketplaceGenomes(genomes, {
            tab: 'agents',
            category: 'coordination',
            query: 'go review',
        }).map((genome) => genome.id)).toEqual(['g1']);
    });

    it('selects favorites across public and private sources while preserving filters', () => {
        const publicGenomes = [
            createGenomeRecord({ id: 'public-1', name: 'Market Planner', category: 'coordination' }),
            createGenomeRecord({ id: 'public-2', name: 'Market Support', category: 'support' }),
        ];
        const privateGenomes = [
            createGenomeRecord({ id: 'private-1', name: 'My Planner', category: 'coordination', isPublic: false }),
            createGenomeRecord({ id: 'private-2', name: 'My Corps', category: 'corps', isPublic: false }),
        ];

        const selected = selectMarketplaceGenomes({
            sourceTab: 'favorites',
            publicGenomes,
            privateGenomes,
            favoriteGenomeIds: ['public-1', 'private-1', 'private-2'],
            tab: 'agents',
            category: 'coordination',
            query: 'planner',
        });

        expect(selected.map((genome) => genome.id)).toEqual(['public-1', 'private-1']);
    });

    it('sorts favorites first, then status priority, then recency', () => {
        const genomes = [
            createGenomeRecord({ id: 'draft-new', name: 'Draft New', status: 'draft', updatedAt: '2026-03-18T00:00:00.000Z' }),
            createGenomeRecord({ id: 'official-old', name: 'Official Old', status: 'official', updatedAt: '2026-03-16T00:00:00.000Z' }),
            createGenomeRecord({ id: 'favorite-draft', name: 'Favorite Draft', status: 'draft', updatedAt: '2026-03-15T00:00:00.000Z' }),
        ];

        expect(sortGenomesForDisplay(genomes, ['favorite-draft']).map((genome) => genome.id)).toEqual([
            'favorite-draft',
            'official-old',
            'draft-new',
        ]);
    });

    it('falls back to paginated private genome lookup when the public marketplace misses', async () => {
        const credentials = { token: 'test-token' } as AuthCredentials;
        const privateGenome = createPrivateGenome({
            id: 'private-42',
            name: 'Private Genome',
            accountId: 'user-1',
            category: 'support',
        });
        const fetchPublicGenomeById = vi.fn().mockResolvedValue(null);
        const fetchPrivateGenomesPage = vi
            .fn()
            .mockResolvedValueOnce({
                genomes: [
                    createPrivateGenome({ id: 'private-10', name: 'Other', accountId: 'user-1' }),
                ],
                total: 2,
            })
            .mockResolvedValueOnce({
                genomes: [privateGenome],
                total: 2,
            });

        const result = await fetchAccessibleGenomeById('private-42', {
            credentials,
            pageSize: 1,
            fetchPublicGenomeById,
            fetchPrivateGenomesPage,
        });

        expect(fetchPublicGenomeById).toHaveBeenCalledWith('private-42');
        expect(fetchPrivateGenomesPage).toHaveBeenNthCalledWith(1, credentials, { limit: 1, offset: 0 });
        expect(fetchPrivateGenomesPage).toHaveBeenNthCalledWith(2, credentials, { limit: 1, offset: 1 });
        expect(result).toEqual(toGenomeRecordFromPrivateGenome(privateGenome));
    });
});

describe('isSpecialMarketplaceGenome', () => {
    it('returns true when tags contain "special"', () => {
        expect(isSpecialMarketplaceGenome({ name: 'My Agent', tags: '["special","coding"]' })).toBe(true);
    });

    it('returns true when tags contain "agent-builder"', () => {
        expect(isSpecialMarketplaceGenome({ name: 'My Agent', tags: '["agent-builder"]' })).toBe(true);
    });

    it('returns true when name contains "agent-builder"', () => {
        expect(isSpecialMarketplaceGenome({ name: 'Agent-Builder Pro', tags: null })).toBe(true);
    });

    it('returns false for ordinary genome with no special tags or name', () => {
        expect(isSpecialMarketplaceGenome({ name: 'Regular Agent', tags: '["coding","typescript"]' })).toBe(false);
    });

    it('returns false when tags is null and name is ordinary', () => {
        expect(isSpecialMarketplaceGenome({ name: 'Plain Implementer', tags: null })).toBe(false);
    });

    it('is case-insensitive for name matching', () => {
        expect(isSpecialMarketplaceGenome({ name: 'AGENT-BUILDER supreme', tags: null })).toBe(true);
    });
});

describe('toGenomeRecordFromPrivateGenome', () => {
    it('sets status to "official" when namespace is "@official"', () => {
        const genome = createPrivateGenome({
            id: 'g-1',
            name: 'Official Agent',
            accountId: 'acc-1',
            namespace: '@official',
        });
        const record = toGenomeRecordFromPrivateGenome(genome);
        expect(record.status).toBe('official');
        expect(record.namespace).toBe('@official');
    });

    it('sets status to "draft" for non-official genome with no status field', () => {
        const genome = createPrivateGenome({
            id: 'g-2',
            name: 'Private Agent',
            accountId: 'acc-1',
            namespace: '@private',
        });
        const record = toGenomeRecordFromPrivateGenome(genome);
        expect(record.status).toBe('draft');
    });

    it('sets namespace to "@private" when genome namespace is null', () => {
        const genome = createPrivateGenome({ id: 'g-3', name: 'Agent', accountId: 'acc-1', namespace: null });
        const record = toGenomeRecordFromPrivateGenome(genome);
        expect(record.namespace).toBe('@private');
    });

    it('maps accountId to publisherId', () => {
        const genome = createPrivateGenome({ id: 'g-4', name: 'Agent', accountId: 'account-xyz' });
        const record = toGenomeRecordFromPrivateGenome(genome);
        expect(record.publisherId).toBe('account-xyz');
    });

    it('always sets downloadCount and starCount to 0', () => {
        const genome = createPrivateGenome({ id: 'g-5', name: 'Agent', accountId: 'acc-1' });
        const record = toGenomeRecordFromPrivateGenome(genome);
        expect(record.downloadCount).toBe(0);
        expect(record.starCount).toBe(0);
    });
});

describe('mapOwnedPrivateGenomesToRecords', () => {
    it('returns empty array for empty input', () => {
        expect(mapOwnedPrivateGenomesToRecords([])).toEqual([]);
    });

    it('maps each private genome to a GenomeRecord', () => {
        const genomes = [
            createPrivateGenome({ id: 'a', name: 'Agent A', accountId: 'acc-1' }),
            createPrivateGenome({ id: 'b', name: 'Agent B', accountId: 'acc-1' }),
        ];
        const records = mapOwnedPrivateGenomesToRecords(genomes);
        expect(records).toHaveLength(2);
        expect(records[0]?.id).toBe('a');
        expect(records[1]?.id).toBe('b');
    });
});

describe('filterPrivateMarketplaceGenomes (boundary)', () => {
    it('returns empty array for empty genome list', () => {
        expect(filterPrivateMarketplaceGenomes([], { tab: 'agents', category: 'all', query: '' })).toEqual([]);
    });

    it('corps tab ignores category filter (returns all corps)', () => {
        const genomes = [
            createGenomeRecord({ id: 'c1', name: 'Corps One', category: 'corps' }),
            createGenomeRecord({ id: 'c2', name: 'Corps Two', category: 'corps' }),
            createGenomeRecord({ id: 'a1', name: 'Agent One', category: 'coordination' }),
        ];
        // Corps tab with specific category should still return all corps (category ignored for corps tab)
        const result = filterPrivateMarketplaceGenomes(genomes, {
            tab: 'corps',
            category: 'coordination',
            query: '',
        });
        expect(result.map((g) => g.id)).toEqual(['c1', 'c2']);
    });

    it('returns all agents when category is "all" and query is empty', () => {
        const genomes = [
            createGenomeRecord({ id: 'a1', name: 'Alpha', category: 'coordination' }),
            createGenomeRecord({ id: 'a2', name: 'Beta', category: 'support' }),
        ];
        const result = filterPrivateMarketplaceGenomes(genomes, { tab: 'agents', category: 'all', query: '' });
        expect(result).toHaveLength(2);
    });

    it('filters by query case-insensitively against name', () => {
        const genomes = [
            createGenomeRecord({ id: 'a1', name: 'TypeScript Expert', category: 'execution' }),
            createGenomeRecord({ id: 'a2', name: 'Python Specialist', category: 'execution' }),
        ];
        const result = filterPrivateMarketplaceGenomes(genomes, {
            tab: 'agents',
            category: 'all',
            query: 'TYPESCRIPT',
        });
        expect(result.map((g) => g.id)).toEqual(['a1']);
    });
});

describe('sortGenomesForDisplay (boundary)', () => {
    it('returns empty array for empty input', () => {
        expect(sortGenomesForDisplay([], [])).toEqual([]);
    });

    it('places special genomes before favorites and status priority', () => {
        const genomes = [
            createGenomeRecord({ id: 'favorite', name: 'My Favorite', status: 'official' }),
            createGenomeRecord({ id: 'special', name: 'agent-builder supreme', status: 'draft' }),
        ];
        const sorted = sortGenomesForDisplay(genomes, ['favorite']);
        // special (agent-builder in name) should come before favorite official
        expect(sorted[0]?.id).toBe('special');
        expect(sorted[1]?.id).toBe('favorite');
    });

    it('returns single-element array unchanged', () => {
        const genomes = [createGenomeRecord({ id: 'only', name: 'Only One' })];
        expect(sortGenomesForDisplay(genomes, []).map((g) => g.id)).toEqual(['only']);
    });

    it('does not mutate the input array', () => {
        const genomes = [
            createGenomeRecord({ id: 'a', name: 'A', status: 'draft', updatedAt: '2026-03-18T00:00:00.000Z' }),
            createGenomeRecord({ id: 'b', name: 'B', status: 'official', updatedAt: '2026-03-16T00:00:00.000Z' }),
        ];
        const original = [...genomes];
        sortGenomesForDisplay(genomes, []);
        expect(genomes[0]?.id).toBe(original[0]?.id);
        expect(genomes[1]?.id).toBe(original[1]?.id);
    });
});

describe('selectMarketplaceGenomes (boundary)', () => {
    const publicGenomes = [
        createGenomeRecord({ id: 'pub-1', name: 'Public Agent', category: 'coordination' }),
        createGenomeRecord({ id: 'pub-corps', name: 'Public Corps', category: 'corps' }),
    ];
    const privateGenomes = [
        createGenomeRecord({ id: 'priv-1', name: 'Private Agent', category: 'coordination', isPublic: false }),
    ];

    it('returns only filtered private genomes for "mine" sourceTab', () => {
        const result = selectMarketplaceGenomes({
            sourceTab: 'mine',
            publicGenomes,
            privateGenomes,
            favoriteGenomeIds: [],
            tab: 'agents',
            category: 'all',
            query: '',
        });
        expect(result.map((g) => g.id)).toEqual(['priv-1']);
    });

    it('returns only filtered public genomes for "market" sourceTab', () => {
        const result = selectMarketplaceGenomes({
            sourceTab: 'market',
            publicGenomes,
            privateGenomes,
            favoriteGenomeIds: [],
            tab: 'agents',
            category: 'all',
            query: '',
        });
        expect(result.map((g) => g.id)).toEqual(['pub-1']);
    });

    it('returns empty array when no favorites match the filter', () => {
        const result = selectMarketplaceGenomes({
            sourceTab: 'favorites',
            publicGenomes,
            privateGenomes,
            favoriteGenomeIds: ['nonexistent'],
            tab: 'agents',
            category: 'all',
            query: '',
        });
        expect(result).toEqual([]);
    });
});

describe('fetchAccessibleGenomeById (boundary)', () => {
    it('returns the public genome immediately when found', async () => {
        const publicGenome = createGenomeRecord({ id: 'known', name: 'Known Genome' });
        const fetchPublicGenomeById = vi.fn().mockResolvedValue(publicGenome);
        const fetchPrivateGenomesPage = vi.fn();

        const result = await fetchAccessibleGenomeById('known', {
            fetchPublicGenomeById,
            fetchPrivateGenomesPage,
        });

        expect(result).toEqual(publicGenome);
        expect(fetchPrivateGenomesPage).not.toHaveBeenCalled();
    });

    it('returns null when genome not found publicly and no credentials provided', async () => {
        const fetchPublicGenomeById = vi.fn().mockResolvedValue(null);

        const result = await fetchAccessibleGenomeById('missing', {
            credentials: null,
            fetchPublicGenomeById,
        });

        expect(result).toBeNull();
    });

    it('returns null when private pages are empty', async () => {
        const credentials = { token: 'tok' } as AuthCredentials;
        const fetchPublicGenomeById = vi.fn().mockResolvedValue(null);
        const fetchPrivateGenomesPage = vi.fn().mockResolvedValue({ genomes: [], total: 0 });

        const result = await fetchAccessibleGenomeById('ghost', {
            credentials,
            fetchPublicGenomeById,
            fetchPrivateGenomesPage,
        });

        expect(result).toBeNull();
        expect(fetchPrivateGenomesPage).toHaveBeenCalledTimes(1);
    });
});
