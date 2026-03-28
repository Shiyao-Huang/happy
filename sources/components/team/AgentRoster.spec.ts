import { describe, expect, it } from 'vitest';
import {
    buildRosterItems,
    computeRosterItem,
    type RosterMemberInput,
    type SessionInput,
} from './agentRosterUtils';

const now = Date.now();

function makeSession(active: boolean, ageMs: number): SessionInput {
    return { active, activeAt: now - ageMs };
}

function makeMember(sessionId: string, displayName?: string, roleId?: string): RosterMemberInput {
    return { sessionId, displayName, roleId };
}

// ------------------------------------------------------------------
// computeRosterItem
// ------------------------------------------------------------------

describe('computeRosterItem — presence state', () => {
    it('shows green dot when session is active and activeAt is within 2 minutes', () => {
        const item = computeRosterItem(
            makeMember('s1', 'Alice', 'master'),
            makeSession(true, 30_000), // 30 s ago
        );
        expect(item.dotColor).toBe('#22C55E');
        expect(item.inactive).toBe(false);
        expect(item.dead).toBe(false);
    });

    it('shows grey dot when session is active but heartbeat stale (>2 min)', () => {
        const item = computeRosterItem(
            makeMember('s1', 'Alice', 'master'),
            makeSession(true, 3 * 60_000), // 3 min ago
        );
        expect(item.dotColor).toBe('#8A7F74');
        expect(item.inactive).toBe(false);
        expect(item.dead).toBe(false);
    });

    it('shows grey dot when session is inactive but recent (<1 h)', () => {
        const item = computeRosterItem(
            makeMember('s1', 'Bob', 'implementer'),
            makeSession(false, 5 * 60_000), // 5 min ago
        );
        expect(item.dotColor).toBe('#8A7F74');
        expect(item.inactive).toBe(true);
        expect(item.dead).toBe(false);
    });

    it('shows dark-grey dot and marks dead when inactive >1 h', () => {
        const item = computeRosterItem(
            makeMember('s1', 'Carol', 'builder'),
            makeSession(false, 2 * 60 * 60_000), // 2 h ago
        );
        expect(item.dotColor).toBe('#4A4040');
        expect(item.inactive).toBe(true);
        expect(item.dead).toBe(true);
    });

    it('shows dark-grey dot when session is null (no session data)', () => {
        const item = computeRosterItem(makeMember('s1', 'Dave', 'qa'), null);
        expect(item.dotColor).toBe('#4A4040');
        expect(item.inactive).toBe(true);
        expect(item.dead).toBe(true);
    });

    it('shows dark-grey dot when session is undefined', () => {
        const item = computeRosterItem(makeMember('s1', 'Eve', 'scout'), undefined);
        expect(item.dotColor).toBe('#4A4040');
        expect(item.dead).toBe(true);
    });
});

describe('computeRosterItem — display fields', () => {
    it('uses sessionId as displayName when displayName is null', () => {
        const item = computeRosterItem({ sessionId: 'session-abc', displayName: null, roleId: null }, null);
        expect(item.displayName).toBe('session-abc');
    });

    it('uses sessionId as displayName when displayName is undefined', () => {
        const item = computeRosterItem({ sessionId: 'session-xyz', roleId: 'master' }, null);
        expect(item.displayName).toBe('session-xyz');
    });

    it('uses empty string as roleId when roleId is null', () => {
        const item = computeRosterItem({ sessionId: 's1', displayName: 'Alice', roleId: null }, null);
        expect(item.roleId).toBe('');
    });

    it('uses empty string as roleId when roleId is undefined', () => {
        const item = computeRosterItem({ sessionId: 's1', displayName: 'Alice' }, null);
        expect(item.roleId).toBe('');
    });

    it('echoes sessionId, displayName, and roleId into the result', () => {
        const item = computeRosterItem(makeMember('sid-1', 'Frank', 'implementer'), null);
        expect(item.sessionId).toBe('sid-1');
        expect(item.displayName).toBe('Frank');
        expect(item.roleId).toBe('implementer');
    });
});

// ------------------------------------------------------------------
// buildRosterItems
// ------------------------------------------------------------------

describe('buildRosterItems', () => {
    it('maps each member to a roster item using the session map', () => {
        const sessions = new Map<string, SessionInput>([
            ['s1', makeSession(true, 30_000)],       // green
            ['s2', makeSession(false, 2 * 60 * 60_000)], // dead
        ]);
        const members = [
            makeMember('s1', 'Alice', 'master'),
            makeMember('s2', 'Bob', 'builder'),
        ];
        const items = buildRosterItems(members, sessions);
        expect(items).toHaveLength(2);
        expect(items[0].dotColor).toBe('#22C55E');
        expect(items[1].dead).toBe(true);
    });

    it('returns empty array for empty member list', () => {
        expect(buildRosterItems([], new Map())).toEqual([]);
    });

    it('uses dark-grey for members with no matching session in the map', () => {
        const items = buildRosterItems(
            [makeMember('s-ghost', 'Ghost', 'builder')],
            new Map(),
        );
        expect(items).toHaveLength(1);
        expect(items[0].dotColor).toBe('#4A4040');
        expect(items[0].dead).toBe(true);
    });

    it('preserves member ordering from the input array', () => {
        const sessions = new Map<string, SessionInput>([
            ['sa', makeSession(true, 10_000)],
            ['sb', makeSession(true, 10_000)],
            ['sc', makeSession(true, 10_000)],
        ]);
        const members = [
            makeMember('sc', 'C', 'qa'),
            makeMember('sa', 'A', 'master'),
            makeMember('sb', 'B', 'builder'),
        ];
        const items = buildRosterItems(members, sessions);
        expect(items.map(i => i.sessionId)).toEqual(['sc', 'sa', 'sb']);
    });

    it('handles a single member with no session gracefully', () => {
        const items = buildRosterItems([makeMember('s1')], new Map());
        expect(items).toHaveLength(1);
        expect(items[0].displayName).toBe('s1');
        expect(items[0].dotColor).toBe('#4A4040');
    });
});
