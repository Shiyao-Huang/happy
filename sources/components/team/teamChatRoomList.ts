import type { TeamMessage } from '@/sync/teamMessageTypes';

export const TEAM_CHAT_MESSAGE_LIMIT = 500;
export const TEAM_CHAT_NEAR_BOTTOM_THRESHOLD_PX = 100;

export function dedupeAndSortTeamMessages(messages: TeamMessage[]): TeamMessage[] {
    return Array.from(new Map(messages.map((message) => [message.id, message])).values())
        .sort((a, b) => a.timestamp - b.timestamp);
}

export function mergeTeamMessages(
    previous: TeamMessage[],
    incoming: TeamMessage[],
    limit = TEAM_CHAT_MESSAGE_LIMIT
): TeamMessage[] {
    const merged = dedupeAndSortTeamMessages([...previous, ...incoming]);
    return merged.length > limit ? merged.slice(-limit) : merged;
}

export function appendTeamMessage(
    previous: TeamMessage[],
    message: TeamMessage,
    limit = TEAM_CHAT_MESSAGE_LIMIT
): TeamMessage[] {
    return mergeTeamMessages(previous, [message], limit);
}

export function isNearBottom(
    layoutHeight: number,
    offsetY: number,
    contentHeight: number,
    threshold = TEAM_CHAT_NEAR_BOTTOM_THRESHOLD_PX
): boolean {
    return layoutHeight + offsetY >= contentHeight - threshold;
}
