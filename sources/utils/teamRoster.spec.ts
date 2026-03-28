import { describe, expect, it } from 'vitest';

import {
    compareTeamRosterEntries,
    getTeamMemberMapFromArtifact,
    getTeamSessionIdsFromArtifact,
    parseTeamMembersFromArtifact,
} from './teamRoster';

describe('teamRoster helpers', () => {
    it('parses members from team artifact body', () => {
        const artifact = {
            sessions: ['session-1'],
            body: JSON.stringify({
                team: {
                    members: [
                        { sessionId: 'session-1', roleId: 'architect' },
                        { sessionId: 'session-2', roleId: 'implementer', runtimeType: 'codex' },
                    ],
                },
            }),
        };

        const members = parseTeamMembersFromArtifact(artifact);
        expect(members).toHaveLength(2);
        expect(members[1]?.sessionId).toBe('session-2');
        expect(members[1]?.runtimeType).toBe('codex');
    });

    it('merges header sessions with body members', () => {
        const artifact = {
            sessions: ['session-1'],
            body: JSON.stringify({
                team: {
                    members: [
                        { sessionId: 'session-2', roleId: 'implementer' },
                        { sessionId: 'session-1', roleId: 'architect' },
                    ],
                },
            }),
        };

        expect(getTeamSessionIdsFromArtifact(artifact)).toEqual(['session-1', 'session-2']);
    });

    it('builds a member map keyed by session id', () => {
        const artifact = {
            sessions: [],
            body: JSON.stringify({
                team: {
                    members: [
                        { sessionId: 'session-2', roleId: 'implementer', displayName: 'Codex Worker' },
                    ],
                },
            }),
        };

        const map = getTeamMemberMapFromArtifact(artifact);
        expect(map.get('session-2')?.displayName).toBe('Codex Worker');
    });
});

describe('parseTeamMembersFromArtifact (boundary)', () => {
    it('returns empty array for null artifact', () => {
        expect(parseTeamMembersFromArtifact(null)).toEqual([]);
    });

    it('returns empty array for undefined artifact', () => {
        expect(parseTeamMembersFromArtifact(undefined)).toEqual([]);
    });

    it('returns empty array when body is missing', () => {
        expect(parseTeamMembersFromArtifact({ sessions: [], body: '' })).toEqual([]);
    });

    it('returns empty array for invalid JSON body', () => {
        expect(parseTeamMembersFromArtifact({ sessions: [], body: 'not-json' })).toEqual([]);
    });

    it('returns empty array when members array is absent', () => {
        expect(parseTeamMembersFromArtifact({
            sessions: [],
            body: JSON.stringify({ team: {} }),
        })).toEqual([]);
    });

    it('returns empty array when body contains empty members array', () => {
        expect(parseTeamMembersFromArtifact({
            sessions: [],
            body: JSON.stringify({ team: { members: [] } }),
        })).toEqual([]);
    });

    it('filters out members without a sessionId', () => {
        const artifact = {
            sessions: [],
            body: JSON.stringify({
                team: {
                    members: [
                        { roleId: 'implementer' },                // no sessionId → filtered
                        { sessionId: '', roleId: 'reviewer' },    // empty string → filtered
                        { sessionId: 'valid-session', roleId: 'architect' },
                    ],
                },
            }),
        };
        const members = parseTeamMembersFromArtifact(artifact);
        expect(members).toHaveLength(1);
        expect(members[0]?.sessionId).toBe('valid-session');
    });
});

describe('getTeamMemberMapFromArtifact (boundary)', () => {
    it('returns empty map for null artifact', () => {
        const map = getTeamMemberMapFromArtifact(null);
        expect(map.size).toBe(0);
    });

    it('returns empty map for undefined artifact', () => {
        const map = getTeamMemberMapFromArtifact(undefined);
        expect(map.size).toBe(0);
    });

    it('maps multiple members by their sessionId', () => {
        const artifact = {
            sessions: [],
            body: JSON.stringify({
                team: {
                    members: [
                        { sessionId: 's1', roleId: 'master', displayName: 'Master' },
                        { sessionId: 's2', roleId: 'implementer', displayName: 'Builder' },
                    ],
                },
            }),
        };
        const map = getTeamMemberMapFromArtifact(artifact);
        expect(map.size).toBe(2);
        expect(map.get('s1')?.displayName).toBe('Master');
        expect(map.get('s2')?.displayName).toBe('Builder');
    });
});

describe('getTeamSessionIdsFromArtifact (boundary)', () => {
    it('returns empty array for null artifact', () => {
        expect(getTeamSessionIdsFromArtifact(null)).toEqual([]);
    });

    it('returns empty array for undefined artifact', () => {
        expect(getTeamSessionIdsFromArtifact(undefined)).toEqual([]);
    });

    it('deduplicates session ids that appear in both header and body members', () => {
        const artifact = {
            sessions: ['dup-session', 'header-only'],
            body: JSON.stringify({
                team: {
                    members: [
                        { sessionId: 'dup-session', roleId: 'implementer' },
                        { sessionId: 'body-only', roleId: 'reviewer' },
                    ],
                },
            }),
        };
        const ids = getTeamSessionIdsFromArtifact(artifact);
        expect(ids).toContain('dup-session');
        expect(ids).toContain('header-only');
        expect(ids).toContain('body-only');
        // Exactly 3 unique ids — no duplicates
        expect(ids.filter((id) => id === 'dup-session')).toHaveLength(1);
    });

    it('handles empty sessions array and empty members', () => {
        const artifact = {
            sessions: [],
            body: JSON.stringify({ team: { members: [] } }),
        };
        expect(getTeamSessionIdsFromArtifact(artifact)).toEqual([]);
    });
});

describe('compareTeamRosterEntries', () => {
    it('keeps role priority ahead of runtime message churn', () => {
        const master = {
            member: {
                sessionId: 'session-master',
                roleId: 'master',
            },
            session: {
                createdAt: 200,
                active: true,
                metadata: { role: 'master' },
            } as any,
            fallbackIndex: 1,
        };

        const implementer = {
            member: {
                sessionId: 'session-impl',
                roleId: 'implementer',
            },
            session: {
                createdAt: 100,
                active: true,
                metadata: { role: 'implementer' },
            } as any,
            fallbackIndex: 0,
        };

        expect(compareTeamRosterEntries(master, implementer)).toBeLessThan(0);
    });

    it('uses lifecycle spawn time instead of volatile array order', () => {
        const earlier = {
            member: {
                memberId: 'member-a',
                sessionId: 'session-a',
                roleId: 'implementer',
                lifecycle: {
                    spawnRequestedAt: 10,
                },
            },
            session: {
                createdAt: 200,
                active: true,
                metadata: { role: 'implementer' },
            } as any,
            fallbackIndex: 5,
        };

        const later = {
            member: {
                memberId: 'member-b',
                sessionId: 'session-b',
                roleId: 'implementer',
                lifecycle: {
                    spawnRequestedAt: 20,
                },
            },
            session: {
                createdAt: 100,
                active: true,
                metadata: { role: 'implementer' },
            } as any,
            fallbackIndex: 0,
        };

        expect(compareTeamRosterEntries(earlier, later)).toBeLessThan(0);
    });

    it('keeps stable ordering regardless of active flag changes', () => {
        const active = {
            member: {
                sessionId: 'same-session',
                roleId: 'implementer',
            },
            session: {
                createdAt: 100,
                active: true,
                metadata: { role: 'implementer' },
            } as any,
            fallbackIndex: 1,
        };

        const inactive = {
            member: {
                sessionId: 'same-session',
                roleId: 'implementer',
            },
            session: {
                createdAt: 100,
                active: false,
                metadata: { role: 'implementer' },
            } as any,
            fallbackIndex: 0,
        };

        expect(compareTeamRosterEntries(active, inactive)).toBeGreaterThan(0);
    });
});

describe('compareTeamRosterEntries (boundary)', () => {
    it('assigns default priority 5 to unknown roles, sorting them after known roles', () => {
        const knownRole = {
            member: { sessionId: 's1', roleId: 'implementer' },
            session: null,
            fallbackIndex: 0,
        };
        const unknownRole = {
            member: { sessionId: 's2', roleId: 'unknown-custom-role' },
            session: null,
            fallbackIndex: 1,
        };
        // implementer priority = 2, unknown priority = 5 → known comes first
        expect(compareTeamRosterEntries(knownRole, unknownRole)).toBeLessThan(0);
        expect(compareTeamRosterEntries(unknownRole, knownRole)).toBeGreaterThan(0);
    });

    it('breaks ties with fallbackIndex when no lifecycle or session createdAt', () => {
        const first = {
            member: { sessionId: 's1', roleId: 'builder' },
            session: null,
            fallbackIndex: 0,
        };
        const second = {
            member: { sessionId: 's2', roleId: 'builder' },
            session: null,
            fallbackIndex: 1,
        };
        // Both have MAX_SAFE_INTEGER spawn order and empty identity → fallbackIndex decides
        expect(compareTeamRosterEntries(first, second)).toBeLessThan(0);
    });

    it('uses processStartedAt from lifecycle when spawnRequestedAt is absent', () => {
        const earlier = {
            member: {
                sessionId: 's-early',
                roleId: 'architect',
                lifecycle: { processStartedAt: 100 },
            },
            session: null,
            fallbackIndex: 0,
        };
        const later = {
            member: {
                sessionId: 's-late',
                roleId: 'architect',
                lifecycle: { processStartedAt: 200 },
            },
            session: null,
            fallbackIndex: 0,
        };
        expect(compareTeamRosterEntries(earlier, later)).toBeLessThan(0);
    });

    it('places supervisor after all non-supervisor roles', () => {
        const builder = {
            member: { sessionId: 's1', roleId: 'builder' },
            session: null,
            fallbackIndex: 99,
        };
        const supervisor = {
            member: { sessionId: 's2', roleId: 'supervisor' },
            session: null,
            fallbackIndex: 0,
        };
        // supervisor priority = 99, builder priority = 2 → builder comes first
        expect(compareTeamRosterEntries(builder, supervisor)).toBeLessThan(0);
    });
});
