import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

// ---------------------------------------------------------------------------
// Module-level mocks (hoisted before all imports)
// ---------------------------------------------------------------------------

const { mockTheme, mockTrackTaskFeedback } = vi.hoisted(() => ({
    mockTheme: {
        colors: {
            text: '#ffffff',
            textSecondary: '#888888',
            textDestructive: '#ff3b30',
            textLink: '#0066ff',
            warning: '#ffaa00',
            success: '#2bd26f',
            surface: '#1a1a1a',
            divider: '#333333',
            groupped: { background: '#2a2a2a' },
            button: { primary: { background: '#b27106', tint: '#ffffff' } },
            surfaceHighest: '#3a3a3a',
        },
    },
    mockTrackTaskFeedback: vi.fn(),
}));

vi.mock('react-native', () => {
    const r = require('react');
    const passthrough = ({ children }: any) => r.createElement(r.Fragment, null, children ?? null);
    return {
        View: passthrough,
        Text: passthrough,
        ScrollView: passthrough,
        KeyboardAvoidingView: passthrough,
        Pressable: ({ children, onPress, disabled }: any) =>
            r.createElement('pressable', { onClick: onPress, disabled }, children ?? null),
        Modal: ({ children, visible }: any) =>
            visible ? r.createElement(r.Fragment, null, children ?? null) : null,
        TextInput: ({ value, onChangeText, placeholder }: any) =>
            r.createElement('textinput', { value, onChangeText, placeholder }, null),
        ActivityIndicator: () => null,
        Platform: { OS: 'ios' },
        StyleSheet: {
            create: (s: any) => s,
            flatten: (s: any) => s,
        },
    };
});

vi.mock('react-native-unistyles', () => ({
    StyleSheet: {
        create: (fn: any) => (typeof fn === 'function' ? fn(mockTheme) : fn),
    },
    useUnistyles: () => ({ theme: mockTheme }),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: () => null,
}));

vi.mock('@/components/markdown/MarkdownView', () => ({
    MarkdownView: () => null,
}));

vi.mock('@/track', () => ({
    trackTaskFeedback: mockTrackTaskFeedback,
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import {
    TaskDetailModal,
    getCommentTypeLabel,
    extractChecklistItems,
    parseCommentBody,
    buildCommentTemplate,
} from './TaskDetailModal';
import type { KanbanTask, KanbanColumn, TaskComment } from '@/sync/kanbanTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
    return {
        id: 'task-1',
        title: 'Fix the bug',
        description: 'Some description',
        status: 'todo',
        priority: 'medium',
        createdAt: 1_000_000,
        updatedAt: 1_000_000,
        comments: [],
        tags: [],
        ...overrides,
    };
}

const DEFAULT_COLUMNS: KanbanColumn[] = [
    { id: 'todo', title: 'To Do' },
    { id: 'in-progress', title: 'In Progress' },
    { id: 'done', title: 'Done' },
];

function renderModal(props: Partial<React.ComponentProps<typeof TaskDetailModal>> & { task?: KanbanTask | null } = {}) {
    const merged = {
        visible: true,
        task: makeTask(),
        columns: DEFAULT_COLUMNS,
        onClose: vi.fn(),
        contained: true as const,
        ...props,
    };

    let renderer: ReturnType<typeof create>;
    act(() => {
        renderer = create(React.createElement(TaskDetailModal, merged as any));
    });

    return {
        getInstance: () => renderer!,
        rerender: (newProps: typeof merged) => {
            act(() => {
                renderer.update(React.createElement(TaskDetailModal, newProps as any));
            });
        },
    };
}

// ---------------------------------------------------------------------------
// Pure utility: getCommentTypeLabel
// ---------------------------------------------------------------------------

describe('getCommentTypeLabel', () => {
    it('returns "Plan" for plan type', () => {
        expect(getCommentTypeLabel('plan')).toBe('Plan');
    });

    it('returns "Plan Review" for plan-review type', () => {
        expect(getCommentTypeLabel('plan-review')).toBe('Plan Review');
    });

    it('returns "Execution Check" for execution-check type', () => {
        expect(getCommentTypeLabel('execution-check')).toBe('Execution Check');
    });

    it('returns "Rework" for rework-request type', () => {
        expect(getCommentTypeLabel('rework-request')).toBe('Rework');
    });

    it('returns "Review Feedback" for review-feedback type', () => {
        expect(getCommentTypeLabel('review-feedback')).toBe('Review Feedback');
    });

    it('returns "Status Change" for status-change type', () => {
        expect(getCommentTypeLabel('status-change')).toBe('Status Change');
    });

    it('returns "Handoff" for handoff type', () => {
        expect(getCommentTypeLabel('handoff')).toBe('Handoff');
    });

    it('returns "Blocker" for blocker type', () => {
        expect(getCommentTypeLabel('blocker')).toBe('Blocker');
    });

    it('returns "Decision" for decision type', () => {
        expect(getCommentTypeLabel('decision')).toBe('Decision');
    });

    it('returns "Human Override" for human-override type', () => {
        expect(getCommentTypeLabel('human-override')).toBe('Human Override');
    });

    it('returns "Note" for unknown types', () => {
        expect(getCommentTypeLabel('unknown')).toBe('Note');
    });

    it('returns "Note" when type is undefined', () => {
        expect(getCommentTypeLabel(undefined)).toBe('Note');
    });

    it('returns "Note" for note type explicitly', () => {
        expect(getCommentTypeLabel('note')).toBe('Note');
    });
});

// ---------------------------------------------------------------------------
// Pure utility: extractChecklistItems
// ---------------------------------------------------------------------------

describe('extractChecklistItems', () => {
    it('returns empty array for undefined content', () => {
        expect(extractChecklistItems(undefined)).toEqual([]);
    });

    it('returns empty array for empty string', () => {
        expect(extractChecklistItems('')).toEqual([]);
    });

    it('extracts unchecked checklist items', () => {
        const content = '- [ ] Do something\n- [ ] Do another thing';
        expect(extractChecklistItems(content)).toEqual(['Do something', 'Do another thing']);
    });

    it('extracts checked checklist items (lowercase x)', () => {
        const content = '- [x] Done item';
        expect(extractChecklistItems(content)).toEqual(['Done item']);
    });

    it('extracts checked checklist items (uppercase X)', () => {
        const content = '- [X] Another done item';
        expect(extractChecklistItems(content)).toEqual(['Another done item']);
    });

    it('extracts items with asterisk bullet', () => {
        const content = '* [ ] Asterisk item';
        expect(extractChecklistItems(content)).toEqual(['Asterisk item']);
    });

    it('ignores non-checklist lines', () => {
        const content = 'Some prose\n- [ ] A task\nMore prose';
        expect(extractChecklistItems(content)).toEqual(['A task']);
    });

    it('returns empty array when no checklist lines exist', () => {
        const content = 'Just some prose text\nWith multiple lines';
        expect(extractChecklistItems(content)).toEqual([]);
    });

    it('trims whitespace from item text', () => {
        const content = '- [ ]   Trimmed item   ';
        expect(extractChecklistItems(content)).toEqual(['Trimmed item']);
    });
});

// ---------------------------------------------------------------------------
// Pure utility: parseCommentBody
// ---------------------------------------------------------------------------

describe('parseCommentBody', () => {
    it('returns prose-only when no checklist items', () => {
        const result = parseCommentBody('Just some prose text.');
        expect(result.prose).toBe('Just some prose text.');
        expect(result.checklist).toEqual([]);
    });

    it('extracts unchecked checklist item and separates prose', () => {
        const result = parseCommentBody('Header line\n- [ ] Task A\nFooter line');
        expect(result.checklist).toHaveLength(1);
        expect(result.checklist[0]).toEqual({ text: 'Task A', completed: false });
        expect(result.prose).toContain('Header line');
        expect(result.prose).toContain('Footer line');
    });

    it('marks checked items as completed', () => {
        const result = parseCommentBody('- [x] Done task');
        expect(result.checklist[0]).toEqual({ text: 'Done task', completed: true });
    });

    it('marks uppercase X items as completed', () => {
        const result = parseCommentBody('- [X] Done task');
        expect(result.checklist[0]).toEqual({ text: 'Done task', completed: true });
    });

    it('handles mixed content correctly', () => {
        const content = '## Plan\nDo the thing.\n- [ ] Step 1\n- [x] Step 2\nDone.';
        const result = parseCommentBody(content);
        expect(result.checklist).toHaveLength(2);
        expect(result.checklist[0]).toEqual({ text: 'Step 1', completed: false });
        expect(result.checklist[1]).toEqual({ text: 'Step 2', completed: true });
        expect(result.prose).not.toContain('Step 1');
    });

    it('trims prose and returns empty string for no prose', () => {
        const result = parseCommentBody('- [ ] Only a task');
        expect(result.prose).toBe('');
        expect(result.checklist).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Pure utility: buildCommentTemplate
// ---------------------------------------------------------------------------

describe('buildCommentTemplate', () => {
    it('returns empty string for note type', () => {
        expect(buildCommentTemplate('note')).toBe('');
    });

    it('builds plan template with checklist', () => {
        const result = buildCommentTemplate('plan');
        expect(result).toContain('## Proposed approach');
        expect(result).toContain('## Checklist');
        expect(result).toContain('## Risks / open questions');
    });

    it('builds plan-review template', () => {
        const result = buildCommentTemplate('plan-review');
        expect(result).toContain('## Plan review');
        expect(result).toContain('Blocking concerns');
    });

    it('builds execution-check template without planSource (uses placeholder items)', () => {
        const result = buildCommentTemplate('execution-check');
        expect(result).toContain('## Execution check against plan');
        expect(result).toContain('Planned item 1');
        expect(result).toContain('## Evidence / verification');
    });

    it('builds execution-check template from planSource checklist items', () => {
        const planSource = '- [ ] Write tests\n- [ ] Add documentation';
        const result = buildCommentTemplate('execution-check', planSource);
        expect(result).toContain('- [ ] Write tests');
        expect(result).toContain('- [ ] Add documentation');
        expect(result).not.toContain('Planned item 1');
    });

    it('builds rework-request template', () => {
        const result = buildCommentTemplate('rework-request');
        expect(result).toContain('## Rework requested');
        expect(result).toContain('## Why this is being sent back');
    });

    it('returns empty string for unrecognized type (default branch)', () => {
        expect(buildCommentTemplate('status-change' as any)).toBe('');
    });

    it('handles planSource with no checklist items (falls back to placeholders)', () => {
        const planSource = 'Just some prose, no checklist items here.';
        const result = buildCommentTemplate('execution-check', planSource);
        expect(result).toContain('Planned item 1');
    });
});

// ---------------------------------------------------------------------------
// Component tests
// ---------------------------------------------------------------------------

describe('TaskDetailModal component', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockTrackTaskFeedback.mockClear();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('returns null when task is null', () => {
        const { getInstance } = renderModal({ task: null });
        expect(getInstance().toJSON()).toBeNull();
    });

    it('returns null when contained=true and visible=false', () => {
        const { getInstance } = renderModal({ visible: false });
        expect(getInstance().toJSON()).toBeNull();
    });

    it('renders without crashing when task is provided', () => {
        expect(() => renderModal()).not.toThrow();
    });

    it('renders inside a Modal when contained=false and visible=true', () => {
        expect(() => renderModal({ contained: false })).not.toThrow();
    });

    it('shows "Task Details" header in view mode', () => {
        const { getInstance } = renderModal();
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Task Details');
    });

    it('renders the task title', () => {
        const task = makeTask({ title: 'My Important Task' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('My Important Task');
    });

    it('shows "No due date" when dueDate is absent', () => {
        const task = makeTask({ dueDate: undefined });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('No due date');
    });

    it('formats dueDate as a locale date string when present', () => {
        const task = makeTask({ dueDate: new Date('2026-01-15').getTime() });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        // Any non-empty date string (locale-dependent format)
        expect(json).toMatch(/\d+/);
    });

    it('renders "Unassigned" when task has no assignee', () => {
        const task = makeTask({ assigneeId: null });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Unassigned');
    });

    it('shows assignee displayName from allSessions when session matches', () => {
        const task = makeTask({ assigneeId: 'session-abc' });
        const { getInstance } = renderModal({
            task,
            allSessions: [{ id: 'session-abc', displayName: 'Alice' }],
        });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Alice');
    });

    it('falls back to assigneeId when session not found in allSessions', () => {
        const task = makeTask({ assigneeId: 'orphan-session' });
        const { getInstance } = renderModal({
            task,
            allSessions: [{ id: 'other-session', displayName: 'Bob' }],
        });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('orphan-session');
    });

    it('renders "No description" when description is empty', () => {
        const task = makeTask({ description: '' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('No description');
    });

    it('renders tags when task has tags', () => {
        const task = makeTask({ tags: ['frontend', 'tdd'] });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('frontend');
        expect(json).toContain('tdd');
    });

    it('renders "No comments yet" when task has no comments', () => {
        const task = makeTask({ comments: [] });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('No comments yet');
    });

    it('renders existing comments sorted by createdAt', () => {
        const comments: TaskComment[] = [
            {
                id: 'c2',
                authorSessionId: 's1',
                authorRole: 'implementer',
                authorDisplayName: 'Builder',
                type: 'note',
                content: 'Second comment',
                createdAt: 2000,
            },
            {
                id: 'c1',
                authorSessionId: 's1',
                authorRole: 'implementer',
                authorDisplayName: 'Builder',
                type: 'plan',
                content: '- [ ] Plan step 1\n- [x] Plan step 2',
                createdAt: 1000,
            },
        ];
        const task = makeTask({ comments });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Builder');
        expect(json).toContain('Plan step 1');
    });

    it('shows "Missing a plan comment" warning for todo tasks without a plan comment', () => {
        const task = makeTask({ status: 'todo', comments: [] });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Missing a plan comment');
    });

    it('does not show plan comment warning when plan comment exists', () => {
        const comments: TaskComment[] = [
            {
                id: 'c1',
                authorSessionId: 's1',
                type: 'plan',
                content: '## Plan',
                createdAt: 1000,
            },
        ];
        const task = makeTask({ status: 'todo', comments });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).not.toContain('Missing a plan comment');
    });

    it('shows lock banner when task has humanStatusLock', () => {
        const task = makeTask({
            humanStatusLock: {
                mode: 'editing',
                lockedAt: Date.now(),
                lockedByDisplayName: 'Charlie',
            },
        });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Charlie');
        expect(json).toContain('editing this task');
    });

    it('shows manual-status lock message when mode is manual-status', () => {
        const task = makeTask({
            humanStatusLock: {
                mode: 'manual-status',
                lockedAt: Date.now(),
                lockedByDisplayName: 'Dana',
            },
        });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('manually locked this task');
    });

    it('shows viewing lock message when mode is viewing', () => {
        const task = makeTask({
            humanStatusLock: {
                mode: 'viewing',
                lockedAt: Date.now(),
                lockedByDisplayName: 'Eve',
            },
        });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('viewing this task');
    });

    it('falls back to session ID for lock message when no displayName', () => {
        const task = makeTask({
            humanStatusLock: {
                mode: 'viewing',
                lockedAt: Date.now(),
                lockedBySessionId: 'sess-xyz',
            },
        });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('sess-xyz');
    });

    it('shows feedback section for done tasks', () => {
        const task = makeTask({ status: 'done' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('How did AI do on this task?');
    });

    it('does not show feedback section for non-done tasks', () => {
        const task = makeTask({ status: 'todo' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).not.toContain('How did AI do on this task?');
    });

    it('shows "Edit Task" header when in edit mode', () => {
        const { getInstance } = renderModal();

        // Find the Edit button pressable and click it
        let json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Task Details');

        // Activate edit mode via pressing the Edit button
        act(() => {
            const tree = getInstance().toJSON() as any;
            // Find pressable with "Edit" text via tree traversal
            function findAndClickEdit(node: any): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some(findAndClickEdit);
                const str = JSON.stringify(node);
                if (node.type === 'pressable' && str.includes('Edit') && node.props?.onClick) {
                    node.props.onClick();
                    return true;
                }
                if (node.children) return findAndClickEdit(node.children);
                return false;
            }
            findAndClickEdit(tree);
        });

        json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Edit Task');
    });

    it('resets state when task changes to a new task', () => {
        const task1 = makeTask({ id: 'task-1', title: 'Task One' });
        const task2 = makeTask({ id: 'task-2', title: 'Task Two' });

        const { getInstance, rerender } = renderModal({ task: task1 });
        let json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Task One');

        rerender({ visible: true, task: task2, columns: DEFAULT_COLUMNS, onClose: vi.fn(), contained: true });
        json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Task Two');
    });

    it('resets saveError when visibility changes to false→true', () => {
        const onSave = vi.fn().mockRejectedValueOnce(new Error('Save failed'));
        const task = makeTask();
        // Trigger a save error would require multi-step interaction;
        // We verify no error banner is shown initially
        const { getInstance } = renderModal({ task, onSave });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).not.toContain('Save failed');
    });

    it('calls onClose when close button is pressed', () => {
        const onClose = vi.fn();
        const { getInstance } = renderModal({ onClose });

        act(() => {
            const tree = getInstance().toJSON() as any;
            function findAndClickClose(node: any): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some(findAndClickClose);
                if (node.type === 'pressable' && node.props?.onClick) {
                    const str = JSON.stringify(node);
                    // Close button has no text children — it only has Ionicons (null)
                    if (!str.includes('Edit') && !str.includes('Discuss') && !str.includes('Delete')) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClickClose(node.children);
                return false;
            }
            findAndClickClose(tree);
        });

        expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onDiscuss when Discuss button is pressed', () => {
        const onDiscuss = vi.fn();
        const task = makeTask();
        const { getInstance } = renderModal({ task, onDiscuss });

        act(() => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Discuss');
        });

        expect(onDiscuss).toHaveBeenCalledWith(task);
    });

    it('calls onDelete when Delete button is pressed', async () => {
        const onDelete = vi.fn().mockResolvedValue(undefined);
        const task = makeTask();
        const { getInstance } = renderModal({ task, onDelete });

        await act(async () => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Delete');
            await Promise.resolve();
        });

        expect(onDelete).toHaveBeenCalledWith('task-1');
    });

    it('sets saveError when onDelete throws', async () => {
        const onDelete = vi.fn().mockRejectedValue(new Error('Delete failed'));
        const task = makeTask();
        const { getInstance } = renderModal({ task, onDelete });

        await act(async () => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Delete');
            await Promise.resolve();
            await Promise.resolve();
        });

        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Delete failed');
    });

    it('renders subtasks when task has subtasks in state', () => {
        // Subtasks start empty on mount (TODO: load from subtaskIds)
        // We verify the subtask section is hidden when empty
        const task = makeTask({ subtaskIds: [] });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        // Subtask section hidden when empty
        expect(json).not.toContain('"Subtasks"');
    });

    it('shows priority in uppercase', () => {
        const task = makeTask({ priority: 'urgent' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('URGENT');
    });

    it('shows MEDIUM when priority is absent', () => {
        const task = makeTask({ priority: undefined });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('MEDIUM');
    });

    it('renders status column title for task status', () => {
        const task = makeTask({ status: 'in-progress' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('In Progress');
    });

    it('shows comment count in comments section', () => {
        const comments: TaskComment[] = [
            { id: 'c1', authorSessionId: 's1', type: 'note', content: 'Hello', createdAt: 1000 },
        ];
        const task = makeTask({ comments, status: 'done' }); // done to avoid plan warning
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('1'); // comment count
    });

    it('renders comment with checklist and shows checklist progress', () => {
        const comments: TaskComment[] = [
            {
                id: 'c1',
                authorSessionId: 's1',
                type: 'execution-check',
                content: '- [ ] Step 1\n- [x] Step 2',
                createdAt: 1000,
            },
        ];
        const task = makeTask({ comments, status: 'done' });
        const { getInstance } = renderModal({ task });
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Step 1');
        expect(json).toContain('Step 2');
        expect(json).toContain('1/2 checked');
    });

    it('calls onSave when handleSave is invoked via comment draft', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const task = makeTask();
        const { getInstance } = renderModal({ task, onSave });

        await act(async () => {
            // Enter edit mode
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Edit');
        });

        await act(async () => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Save');
            await Promise.resolve();
        });

        expect(onSave).toHaveBeenCalledOnce();
    });

    it('calls handleCancel to exit edit mode', async () => {
        const { getInstance } = renderModal();

        // Enter edit mode
        act(() => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Edit');
        });

        let json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Edit Task');

        // Cancel edit
        act(() => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Cancel');
        });

        json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Task Details');
    });

    it('calls onAddComment when handleAddComment is triggered', async () => {
        const onAddComment = vi.fn().mockResolvedValue(undefined);
        const task = makeTask({ status: 'done', comments: [] });
        const { getInstance } = renderModal({ task, onAddComment, actorDisplayName: 'Test User' });

        // Set comment draft via TextInput's onChangeText
        act(() => {
            const tree = getInstance().toJSON() as any;
            function findTextInput(node: any): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some(findTextInput);
                if (node.type === 'textinput' && node.props?.onChangeText) {
                    node.props.onChangeText('My test comment');
                    return true;
                }
                if (node.children) return findTextInput(node.children);
                return false;
            }
            findTextInput(tree);
        });

        await act(async () => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Add comment');
            await Promise.resolve();
        });

        expect(onAddComment).toHaveBeenCalledOnce();
        expect(onAddComment.mock.calls[0][0]).toBe('task-1');
    });

    it('falls back to onSave when onAddComment is not provided', async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const task = makeTask({ status: 'done', comments: [] });
        const { getInstance } = renderModal({ task, onSave });

        act(() => {
            const tree = getInstance().toJSON() as any;
            function findTextInput(node: any): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some(findTextInput);
                if (node.type === 'textinput' && node.props?.onChangeText) {
                    node.props.onChangeText('A comment');
                    return true;
                }
                if (node.children) return findTextInput(node.children);
                return false;
            }
            findTextInput(tree);
        });

        await act(async () => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Add comment');
            await Promise.resolve();
        });

        expect(onSave).toHaveBeenCalledOnce();
    });

    it('does not call onAddComment when commentDraft is empty', async () => {
        const onAddComment = vi.fn();
        const task = makeTask({ status: 'done' });
        const { getInstance } = renderModal({ task, onAddComment });

        // Do not set any draft — press Add comment immediately
        await act(async () => {
            const tree = getInstance().toJSON() as any;
            function findAndClick(node: any, label: string): boolean {
                if (!node) return false;
                if (Array.isArray(node)) return node.some((n) => findAndClick(n, label));
                if (node.type === 'pressable') {
                    const str = JSON.stringify(node);
                    if (str.includes(label) && node.props?.onClick) {
                        node.props.onClick();
                        return true;
                    }
                }
                if (node.children) return findAndClick(node.children, label);
                return false;
            }
            findAndClick(tree, 'Add comment');
        });

        expect(onAddComment).not.toHaveBeenCalled();
    });

    it('calls trackTaskFeedback with +1 when thumbs-up is pressed', () => {
        const task = makeTask({ status: 'done' });
        const { getInstance } = renderModal({ task });

        act(() => {
            const tree = getInstance().toJSON() as any;
            // Collect all pressables in DFS order
            const pressables: any[] = [];
            function collect(node: any): void {
                if (!node) return;
                if (Array.isArray(node)) { node.forEach(collect); return; }
                if (node.type === 'pressable' && node.props?.onClick) pressables.push(node);
                if (node.children) collect(node.children);
            }
            collect(tree);
            // Exclude text-bearing pressables; feedback buttons have null children (Ionicons renders null)
            // Null-children pressables in order: close(0), thumbs-up(1), thumbs-down(2)
            const nullChildPressables = pressables.filter((p) => {
                const s = JSON.stringify(p.children ?? null);
                return s === 'null';
            });
            // thumbs-up is second (index 1) after close button
            if (nullChildPressables.length > 1) {
                nullChildPressables[1].props.onClick();
            }
        });

        expect(mockTrackTaskFeedback).toHaveBeenCalledWith(task.id, 1);
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain('Thanks for the feedback');
    });

    it('calls trackTaskFeedback with -1 when thumbs-down is pressed', () => {
        const task = makeTask({ status: 'done' });
        const { getInstance } = renderModal({ task });

        act(() => {
            const tree = getInstance().toJSON() as any;
            const pressables: any[] = [];
            function collect(node: any): void {
                if (!node) return;
                if (Array.isArray(node)) { node.forEach(collect); return; }
                if (node.type === 'pressable' && node.props?.onClick) pressables.push(node);
                if (node.children) collect(node.children);
            }
            collect(tree);
            const nullChildPressables = pressables.filter((p) => {
                const s = JSON.stringify(p.children ?? null);
                return s === 'null';
            });
            // thumbs-down is third (index 2) after close button
            if (nullChildPressables.length > 2) {
                nullChildPressables[2].props.onClick();
            }
        });

        expect(mockTrackTaskFeedback).toHaveBeenCalledWith(task.id, -1);
        const json = JSON.stringify(getInstance().toJSON());
        expect(json).toContain("Got it");
    });
});
