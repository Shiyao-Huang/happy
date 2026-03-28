import React from 'react';
import { formatTaskReference } from '@/utils/taskChatSync';
import type { KanbanTask } from '@/sync/kanbanTypes';

type RosterEntry = {
    member: { sessionId: string; roleId?: string; displayName?: string };
    role?: { id?: string; title?: string };
    session?: { metadata?: { role?: string } | null };
};

type ChatComposerPrefill = { text: string; token: number };

type TeamStandardTab = 'chat' | 'board' | 'info' | 'evolution';

/**
 * Manages the "Discuss" button flow: builds an @mention draft and switches
 * the active tab to Chat, pre-filling the composer with a task reference.
 *
 * Extracts handleDiscussTask + chatComposerPrefill state from teams/[id].tsx
 * so that the dep array stays stable ([handleTaskDetailClose, roster, selectTab]).
 */
export function useTaskChatBridge(
    roster: RosterEntry[],
    handleTaskDetailClose: () => void,
    selectTab: (tab: TeamStandardTab) => void,
): {
    handleDiscussTask: (task: KanbanTask) => void;
    chatComposerPrefill: ChatComposerPrefill | null;
} {
    const [chatComposerPrefill, setChatComposerPrefill] = React.useState<ChatComposerPrefill | null>(null);

    // Keep a stable ref so handleDiscussTask doesn't need roster in its dep array
    const rosterRef = React.useRef(roster);
    rosterRef.current = roster;

    const handleDiscussTask = React.useCallback((task: KanbanTask) => {
        const currentRoster = rosterRef.current;

        const assigneeEntry = task.assigneeId
            ? currentRoster.find((entry) => entry.member.sessionId === task.assigneeId)
            : null;
        const masterEntry = currentRoster.find((entry) => {
            const roleId = entry.role?.id || entry.member.roleId || entry.session?.metadata?.role;
            return roleId === 'master';
        });

        const mentionTarget = assigneeEntry
            ? (assigneeEntry.role?.id || assigneeEntry.member.roleId || assigneeEntry.member.displayName || 'master')
            : (masterEntry?.role?.id || masterEntry?.member.roleId || 'master');

        const mentionText = `@${String(mentionTarget).replace(/\s+/g, '-')}`;
        const draft = `${mentionText} Let's discuss ${formatTaskReference(task)} (${task.title}) `;

        handleTaskDetailClose();
        selectTab('chat');
        setChatComposerPrefill({
            text: draft,
            token: Date.now(),
        });
    }, [handleTaskDetailClose, selectTab]);

    return { handleDiscussTask, chatComposerPrefill };
}
