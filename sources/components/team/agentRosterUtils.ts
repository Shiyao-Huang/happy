/**
 * agentRosterUtils.ts
 *
 * Pure utility functions for building the AgentRoster view model.
 * No React or native dependencies — fully unit-testable with vitest.
 */

import { getAgentPresenceVisual } from '@/utils/presenceUtils';

export interface RosterMemberInput {
    sessionId: string;
    displayName?: string | null;
    roleId?: string | null;
}

export interface SessionInput {
    active: boolean;
    activeAt: number;
}

export interface AgentRosterItem {
    sessionId: string;
    displayName: string;
    roleId: string;
    /** Presence-driven dot color (green / grey / dark-grey) */
    dotColor: string;
    /** True when session is inactive */
    inactive: boolean;
    /** True when session has been inactive for over 1 hour */
    dead: boolean;
}

const MISSING_SESSION_VISUAL = { dotColor: '#4A4040', inactive: true, dead: true } as const;

/**
 * Compute a single roster item for one team member + their optional session.
 */
export function computeRosterItem(
    member: RosterMemberInput,
    session: SessionInput | null | undefined,
): AgentRosterItem {
    const presence = session ? getAgentPresenceVisual(session) : MISSING_SESSION_VISUAL;
    return {
        sessionId: member.sessionId,
        displayName: member.displayName || member.sessionId,
        roleId: member.roleId || '',
        dotColor: presence.dotColor,
        inactive: presence.inactive,
        dead: presence.dead,
    };
}

/**
 * Build a roster item list for all members, resolving presence from a session map.
 * Input order is preserved.
 */
export function buildRosterItems(
    members: RosterMemberInput[],
    sessions: Map<string, SessionInput>,
): AgentRosterItem[] {
    return members.map((member) =>
        computeRosterItem(member, sessions.get(member.sessionId)),
    );
}
