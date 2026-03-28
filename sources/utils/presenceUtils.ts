/**
 * presenceUtils.ts
 *
 * Pure utility functions for agent presence state — no React dependency.
 * These can be safely imported in both component and test contexts.
 */

const STALE_THRESHOLD_MS = 2 * 60 * 1000;  // 2 min without heartbeat = stale (active but no pings)
const DEAD_THRESHOLD_MS = 60 * 60 * 1000;  // 1 hour without activity = "ended"

export interface AgentPresenceVisual {
    /** Semantic presence state */
    state: 'online' | 'stale' | 'offline' | 'dead';
    /** Presence-driven dot color: green / grey / dark-grey */
    dotColor: string;
    /** True when session is not active (offline or dead) */
    inactive: boolean;
    /** True when session has been inactive for over 1 hour */
    dead: boolean;
}

/**
 * Returns presence-driven visual properties for an agent sidebar row.
 *
 * Four states:
 *   - online  (active=true, fresh heartbeat):  green     #22C55E
 *   - stale   (active=true, heartbeat >2min):   grey      #8A7F74  (still alive, but heartbeat stale)
 *   - offline (active=false, <1h):              grey      #8A7F74
 *   - dead    (active=false, ≥1h or no activeAt): dark-grey #4A4040
 */
export function getAgentPresenceVisual(session: { active: boolean; activeAt: number }): AgentPresenceVisual {
    if (session.active) {
        // Keep active sessions in the live bucket even if their heartbeat is stale.
        const isStale = session.activeAt > 0 && (Date.now() - session.activeAt > STALE_THRESHOLD_MS);
        if (!isStale) {
            return { state: 'online', dotColor: '#22C55E', inactive: false, dead: false };
        }
        return { state: 'stale', dotColor: '#8A7F74', inactive: false, dead: false };
    }
    const isDead = session.activeAt > 0 && (Date.now() - session.activeAt > DEAD_THRESHOLD_MS);
    return {
        state: isDead ? 'dead' : 'offline',
        dotColor: isDead ? '#4A4040' : '#8A7F74',
        inactive: true,
        dead: isDead,
    };
}
