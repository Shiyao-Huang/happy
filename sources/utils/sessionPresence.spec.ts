import { describe, expect, it } from 'vitest';

import { getAgentPresenceVisual } from './presenceUtils';

const DEAD_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

describe('getAgentPresenceVisual', () => {
    it('online state: active=true returns green dot, inactive=false, dead=false', () => {
        const result = getAgentPresenceVisual({ active: true, activeAt: Date.now() });
        expect(result.state).toBe('online');
        expect(result.dotColor).toBe('#22C55E');
        expect(result.inactive).toBe(false);
        expect(result.dead).toBe(false);
    });

    it('stale-but-active state stays in the live bucket with a grey dot', () => {
        const staleActiveAt = Date.now() - (3 * 60 * 1000);
        const result = getAgentPresenceVisual({ active: true, activeAt: staleActiveAt });
        expect(result.state).toBe('stale');
        expect(result.dotColor).toBe('#8A7F74');
        expect(result.inactive).toBe(false);
        expect(result.dead).toBe(false);
    });

    it('offline state: active=false, within 1h returns grey dot, inactive=true, dead=false', () => {
        const recentlyActiveAt = Date.now() - (30 * 60 * 1000); // 30 min ago
        const result = getAgentPresenceVisual({ active: false, activeAt: recentlyActiveAt });
        expect(result.state).toBe('offline');
        expect(result.dotColor).toBe('#8A7F74');
        expect(result.inactive).toBe(true);
        expect(result.dead).toBe(false);
    });

    it('dead state: active=false, over 1h returns dark-grey dot, inactive=true, dead=true', () => {
        const longInactiveAt = Date.now() - (DEAD_THRESHOLD_MS + 1000); // just over 1 hour ago
        const result = getAgentPresenceVisual({ active: false, activeAt: longInactiveAt });
        expect(result.state).toBe('dead');
        expect(result.dotColor).toBe('#4A4040');
        expect(result.inactive).toBe(true);
        expect(result.dead).toBe(true);
    });

    it('inactive with no activeAt (0): not dead, offline grey dot', () => {
        const result = getAgentPresenceVisual({ active: false, activeAt: 0 });
        expect(result.state).toBe('offline');
        expect(result.dotColor).toBe('#8A7F74');
        expect(result.inactive).toBe(true);
        expect(result.dead).toBe(false);
    });
});
