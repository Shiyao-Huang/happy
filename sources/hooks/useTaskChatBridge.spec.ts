import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

// Hoisted mocks
const mockFormatTaskReference = vi.hoisted(() => vi.fn().mockReturnValue('#T-001'));

vi.mock('@/utils/taskChatSync', () => ({
    formatTaskReference: mockFormatTaskReference,
}));

import { useTaskChatBridge } from './useTaskChatBridge';
import type { KanbanTask } from '@/sync/kanbanTypes';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<Result>(hook: () => Result) {
    const result: { current: Result } = { current: undefined as unknown as Result };
    let renderer: ReturnType<typeof create>;

    function Wrapper() {
        result.current = hook();
        return null;
    }

    act(() => {
        renderer = create(React.createElement(Wrapper));
    });

    return {
        result,
        rerender: (newHook?: () => Result) => {
            act(() => {
                renderer.update(React.createElement(
                    newHook
                        ? function W() { result.current = newHook(); return null; }
                        : Wrapper
                ));
            });
        },
        unmount: () => {
            act(() => {
                renderer.unmount();
            });
        },
    };
}

// Minimal roster entry type matching what handleDiscussTask reads
type MinimalRosterEntry = {
    member: { sessionId: string; roleId?: string; displayName?: string };
    role?: { id?: string; title?: string };
    session?: { metadata?: { role?: string } };
};

function makeTask(overrides?: Partial<KanbanTask>): KanbanTask {
    return {
        id: 'task-1',
        title: 'Fix the bug',
        status: 'todo',
        createdAt: 1000,
        updatedAt: 2000,
        ...overrides,
    } as KanbanTask;
}

describe('useTaskChatBridge', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let handleTaskDetailClose: ReturnType<typeof vi.fn>;
    let selectTab: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        handleTaskDetailClose = vi.fn();
        selectTab = vi.fn();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: any) => {
            if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
                return;
            }
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('returns chatComposerPrefill as null initially', () => {
        const roster: MinimalRosterEntry[] = [];

        const { result } = renderHook(() =>
            useTaskChatBridge(roster, handleTaskDetailClose, selectTab)
        );

        expect(result.current.chatComposerPrefill).toBeNull();
    });

    it('returns handleDiscussTask as a function', () => {
        const { result } = renderHook(() =>
            useTaskChatBridge([], handleTaskDetailClose, selectTab)
        );

        expect(typeof result.current.handleDiscussTask).toBe('function');
    });

    it('calls handleTaskDetailClose and selectTab("chat") when handleDiscussTask invoked', () => {
        const { result } = renderHook(() =>
            useTaskChatBridge([], handleTaskDetailClose, selectTab)
        );

        act(() => {
            result.current.handleDiscussTask(makeTask());
        });

        expect(handleTaskDetailClose).toHaveBeenCalledTimes(1);
        expect(selectTab).toHaveBeenCalledWith('chat');
    });

    it('sets chatComposerPrefill with draft text using master fallback when no assignee', () => {
        const roster: MinimalRosterEntry[] = [
            {
                member: { sessionId: 'master-session', roleId: 'master' },
                role: { id: 'master' },
            },
        ];

        const { result } = renderHook(() =>
            useTaskChatBridge(roster, handleTaskDetailClose, selectTab)
        );

        act(() => {
            result.current.handleDiscussTask(makeTask({ assigneeId: undefined }));
        });

        expect(result.current.chatComposerPrefill).not.toBeNull();
        expect(result.current.chatComposerPrefill!.text).toContain('@master');
        expect(result.current.chatComposerPrefill!.text).toContain('#T-001');
        expect(result.current.chatComposerPrefill!.text).toContain('Fix the bug');
        expect(typeof result.current.chatComposerPrefill!.token).toBe('number');
    });

    it('uses assignee role id for mention when task has assignee in roster', () => {
        const roster: MinimalRosterEntry[] = [
            {
                member: { sessionId: 'builder-session', roleId: 'builder' },
                role: { id: 'builder' },
            },
        ];

        const { result } = renderHook(() =>
            useTaskChatBridge(roster, handleTaskDetailClose, selectTab)
        );

        act(() => {
            result.current.handleDiscussTask(makeTask({ assigneeId: 'builder-session' }));
        });

        expect(result.current.chatComposerPrefill!.text).toContain('@builder');
    });

    it('replaces spaces with hyphens in mention target', () => {
        const roster: MinimalRosterEntry[] = [
            {
                member: { sessionId: 'agent-session', roleId: '', displayName: 'My Agent' },
                role: undefined,
            },
        ];

        const { result } = renderHook(() =>
            useTaskChatBridge(roster, handleTaskDetailClose, selectTab)
        );

        act(() => {
            result.current.handleDiscussTask(makeTask({ assigneeId: 'agent-session' }));
        });

        expect(result.current.chatComposerPrefill!.text).toContain('@My-Agent');
    });

    it('falls back to "master" string when no assignee and no master in roster', () => {
        const roster: MinimalRosterEntry[] = [];

        const { result } = renderHook(() =>
            useTaskChatBridge(roster, handleTaskDetailClose, selectTab)
        );

        act(() => {
            result.current.handleDiscussTask(makeTask({ assigneeId: undefined }));
        });

        expect(result.current.chatComposerPrefill!.text).toContain('@master');
    });

    it('each call to handleDiscussTask produces a new token', () => {
        const { result } = renderHook(() =>
            useTaskChatBridge([], handleTaskDetailClose, selectTab)
        );

        act(() => {
            result.current.handleDiscussTask(makeTask());
        });
        const token1 = result.current.chatComposerPrefill!.token;

        // Advance time so tokens differ
        vi.setSystemTime(new Date(Date.now() + 100));

        act(() => {
            result.current.handleDiscussTask(makeTask({ id: 'task-2' }));
        });
        const token2 = result.current.chatComposerPrefill!.token;

        expect(token1).not.toBe(token2);
    });

    it('re-renders with new roster update mentionTarget', () => {
        let roster: MinimalRosterEntry[] = [];

        const { result, rerender } = renderHook(() =>
            useTaskChatBridge(roster, handleTaskDetailClose, selectTab)
        );

        // Add a new roster member
        roster = [
            {
                member: { sessionId: 'lead-session', roleId: 'lead' },
                role: { id: 'lead' },
            },
        ];
        rerender();

        act(() => {
            result.current.handleDiscussTask(makeTask({ assigneeId: 'lead-session' }));
        });

        expect(result.current.chatComposerPrefill!.text).toContain('@lead');
    });
});
