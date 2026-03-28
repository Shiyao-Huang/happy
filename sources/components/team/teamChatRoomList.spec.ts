import { describe, expect, it } from 'vitest';
import type { TeamMessage } from '@/sync/teamMessageTypes';
import {
    appendTeamMessage,
    dedupeAndSortTeamMessages,
    isNearBottom,
    mergeTeamMessages,
} from './teamChatRoomList';

function makeMessage(id: string, timestamp: number, content = id): TeamMessage {
    return {
        id,
        teamId: 'team-1',
        type: 'chat',
        content,
        timestamp,
        fromDisplayName: 'User',
    };
}

describe('teamChatRoomList helpers', () => {
    it('dedupeAndSortTeamMessages keeps the newest payload per id and sorts chronologically', () => {
        const result = dedupeAndSortTeamMessages([
            makeMessage('b', 3000, 'late'),
            makeMessage('a', 1000, 'first'),
            makeMessage('b', 2000, 'replacement'),
        ]);

        expect(result).toEqual([
            makeMessage('a', 1000, 'first'),
            makeMessage('b', 2000, 'replacement'),
        ]);
    });

    it('mergeTeamMessages deduplicates incoming messages and trims to the latest 500 by default', () => {
        const previous = Array.from({ length: 500 }, (_, index) =>
            makeMessage(`msg-${index}`, index)
        );
        const result = mergeTeamMessages(previous, [
            makeMessage('msg-250', 9999, 'updated duplicate'),
            makeMessage('msg-500', 500),
        ]);

        expect(result).toHaveLength(500);
        expect(result[0].id).toBe('msg-1');
        expect(result.at(-1)).toEqual(makeMessage('msg-250', 9999, 'updated duplicate'));
    });

    it('appendTeamMessage preserves ordering and deduplicates by id', () => {
        const result = appendTeamMessage(
            [
                makeMessage('msg-1', 1000),
                makeMessage('msg-2', 3000),
            ],
            makeMessage('msg-2', 2000, 'replacement')
        );

        expect(result).toEqual([
            makeMessage('msg-1', 1000),
            makeMessage('msg-2', 2000, 'replacement'),
        ]);
    });

    it('isNearBottom only returns true when within the configured threshold', () => {
        expect(isNearBottom(400, 500, 980)).toBe(true);
        expect(isNearBottom(400, 300, 980)).toBe(false);
    });
});
