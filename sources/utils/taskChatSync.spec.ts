import { describe, expect, it, vi } from 'vitest';

import {
    createTaskFromChatMessage,
    createTaskMetadata,
    createTaskUpdateMessage,
    extractTaskFromMessage,
    extractTaskIds,
    formatTaskReference,
    generateTaskMessage,
    insertTaskReference,
    normalizeTaskPriorityForTeamMessage,
    renderTaskCard,
    shouldCreateTaskFromMessage,
    syncTaskStatusToChat,
} from './taskChatSync';

describe('normalizeTaskPriorityForTeamMessage', () => {
    it('maps medium to normal for team message metadata', () => {
        expect(normalizeTaskPriorityForTeamMessage('medium')).toBe('normal');
    });

    it('keeps server-supported priorities unchanged', () => {
        expect(normalizeTaskPriorityForTeamMessage('low')).toBe('low');
        expect(normalizeTaskPriorityForTeamMessage('normal')).toBe('normal');
        expect(normalizeTaskPriorityForTeamMessage('high')).toBe('high');
        expect(normalizeTaskPriorityForTeamMessage('urgent')).toBe('urgent');
    });

    it('drops unsupported priority values', () => {
        expect(normalizeTaskPriorityForTeamMessage('unknown')).toBeUndefined();
        expect(normalizeTaskPriorityForTeamMessage()).toBeUndefined();
    });
});

describe('createTaskMetadata', () => {
    it('overrides medium detail priority with normal in returned metadata', () => {
        const metadata = createTaskMetadata('task-1', 'created', {
            priority: 'medium',
            status: 'todo',
        });

        expect(metadata).toMatchObject({
            taskId: 'task-1',
            priority: 'normal',
            status: 'todo',
            _action: 'created',
        });
    });

    it('omits priority field when no details provided', () => {
        const metadata = createTaskMetadata('task-2', 'completed');
        expect(metadata).toMatchObject({
            taskId: 'task-2',
            _action: 'completed',
        });
        expect(metadata.priority).toBeUndefined();
    });

    it('omits priority field when details has no priority', () => {
        const metadata = createTaskMetadata('task-3', 'updated', { status: 'in-progress' });
        expect(metadata).toMatchObject({
            taskId: 'task-3',
            _action: 'updated',
            status: 'in-progress',
        });
        expect(metadata.priority).toBeUndefined();
    });

    it('includes _timestamp as a number', () => {
        const before = Date.now();
        const metadata = createTaskMetadata('task-4', 'assigned');
        const after = Date.now();
        expect(typeof metadata._timestamp).toBe('number');
        expect(metadata._timestamp).toBeGreaterThanOrEqual(before);
        expect(metadata._timestamp).toBeLessThanOrEqual(after);
    });
});

describe('extractTaskIds', () => {
    it('extracts task ids using the #task- format', () => {
        expect(extractTaskIds('Check #task-abc for details')).toEqual(['abc']);
    });

    it('extracts task ids using the @task: format', () => {
        expect(extractTaskIds('See @task:def')).toEqual(['def']);
    });

    it('extracts task ids using the [Task:...] format', () => {
        expect(extractTaskIds('Related [Task:ghi]')).toEqual(['ghi']);
    });

    it('extracts ids from all three formats in one message', () => {
        const ids = extractTaskIds('#task-abc @task:def [Task:ghi]');
        expect(ids).toContain('abc');
        expect(ids).toContain('def');
        expect(ids).toContain('ghi');
        expect(ids).toHaveLength(3);
    });

    it('returns empty array for empty string', () => {
        expect(extractTaskIds('')).toEqual([]);
    });

    it('returns empty array when no task references found', () => {
        expect(extractTaskIds('No task references here.')).toEqual([]);
    });

    it('deduplicates repeated task ids', () => {
        const ids = extractTaskIds('#task-dup @task:dup [Task:dup]');
        expect(ids).toEqual(['dup']);
    });

    it('handles task ids with hyphens and underscores', () => {
        const ids = extractTaskIds('#task-my-task_01');
        expect(ids).toEqual(['my-task_01']);
    });
});

describe('generateTaskMessage', () => {
    function makeTask(overrides: Record<string, any> = {}) {
        return {
            id: 't1',
            title: 'My Task',
            status: 'todo',
            createdAt: 0,
            updatedAt: 0,
            ...overrides,
        };
    }

    it('includes actor name and action text in message', () => {
        const msg = generateTaskMessage('created', makeTask(), 'Alice');
        expect(msg).toContain('Alice');
        expect(msg).toContain('创建了任务');
        expect(msg).toContain('**My Task**');
    });

    it('uses "有人" as default actor when actorName is absent', () => {
        const msg = generateTaskMessage('completed', makeTask(), undefined);
        expect(msg).toContain('有人');
        expect(msg).toContain('完成了任务');
    });

    it('includes a task reference in the message body', () => {
        const msg = generateTaskMessage('updated', makeTask({ id: 'abc' }), 'Bob');
        expect(msg).toContain('#task-abc');
    });

    it('truncates long descriptions at 360 characters', () => {
        const longDesc = 'x'.repeat(400);
        const msg = generateTaskMessage('assigned', makeTask({ description: longDesc }), 'Eve');
        // The truncated block is prefixed by '> ' and ends with '…'
        expect(msg).toContain('> ' + 'x'.repeat(360) + '…');
    });

    it('omits description block when description is absent', () => {
        const msg = generateTaskMessage('blocked', makeTask(), 'Carol');
        expect(msg).not.toContain('> ');
    });

    it('shows "未设置" when task priority is absent', () => {
        const msg = generateTaskMessage('created', makeTask(), 'Dave');
        expect(msg).toContain('**优先级**: 未设置');
    });

    it('shows the task priority when set', () => {
        const msg = generateTaskMessage('created', makeTask({ priority: 'high' }), 'Dave');
        expect(msg).toContain('**优先级**: high');
    });
});

describe('formatTaskReference', () => {
    it('returns #task-{id} format', () => {
        const task = { id: 'xyz', title: 'T', status: 'todo', createdAt: 0, updatedAt: 0 };
        expect(formatTaskReference(task)).toBe('#task-xyz');
    });
});

describe('insertTaskReference', () => {
    it('appends task reference at the end by default', () => {
        expect(insertTaskReference('Hello world', 'task-1')).toBe('Hello world #task-task-1');
    });

    it('prepends task reference at the start when position is "start"', () => {
        expect(insertTaskReference('Hello world', 'task-1', 'start')).toBe('#task-task-1 Hello world');
    });

    it('appends task reference when position is "end"', () => {
        expect(insertTaskReference('Msg', 'task-2', 'end')).toBe('Msg #task-task-2');
    });
});

describe('shouldCreateTaskFromMessage', () => {
    it('returns true when message contains "创建任务"', () => {
        expect(shouldCreateTaskFromMessage('请帮我创建任务：review PR')).toBe(true);
    });

    it('returns true when message contains "new task" (case-insensitive)', () => {
        expect(shouldCreateTaskFromMessage('NEW TASK: write tests')).toBe(true);
    });

    it('returns true when message contains "create task"', () => {
        expect(shouldCreateTaskFromMessage('create task: add feature')).toBe(true);
    });

    it('returns true when message contains "[todo]"', () => {
        expect(shouldCreateTaskFromMessage('[TODO] fix the bug')).toBe(true);
    });

    it('returns true when message contains "[task]"', () => {
        expect(shouldCreateTaskFromMessage('[Task] write docs')).toBe(true);
    });

    it('returns false for a normal chat message', () => {
        expect(shouldCreateTaskFromMessage('Hey, how are you?')).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(shouldCreateTaskFromMessage('')).toBe(false);
    });
});

describe('extractTaskFromMessage', () => {
    it('returns null for empty string', () => {
        expect(extractTaskFromMessage('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(extractTaskFromMessage('   \n  ')).toBeNull();
    });

    it('extracts title from a single-line message', () => {
        const result = extractTaskFromMessage('Fix the login bug');
        expect(result?.title).toBe('Fix the login bug');
        expect(result?.description).toBeUndefined();
    });

    it('strips [todo] prefix from the title', () => {
        const result = extractTaskFromMessage('[TODO] Write unit tests');
        expect(result?.title).toBe('Write unit tests');
    });

    it('strips [task] prefix from the title', () => {
        const result = extractTaskFromMessage('[task] Add CI/CD pipeline');
        expect(result?.title).toBe('Add CI/CD pipeline');
    });

    it('strips "todo:" keyword prefix from the title', () => {
        const result = extractTaskFromMessage('todo: Refactor auth module');
        expect(result?.title).toBe('Refactor auth module');
    });

    it('strips "new task:" keyword prefix from the title', () => {
        const result = extractTaskFromMessage('new task: Deploy to staging');
        expect(result?.title).toBe('Deploy to staging');
    });

    it('extracts multi-line message as title + description', () => {
        const result = extractTaskFromMessage('My task title\nFirst description line\nSecond line');
        expect(result?.title).toBe('My task title');
        expect(result?.description).toBe('First description line\nSecond line');
    });
});

describe('createTaskFromChatMessage', () => {
    it('returns null when message does not contain task keyword', () => {
        expect(createTaskFromChatMessage('Just a regular message', 'creator-1')).toBeNull();
    });

    it('returns a task object when message contains a task keyword', () => {
        const result = createTaskFromChatMessage('[task] Implement dark mode', 'creator-2');
        expect(result).not.toBeNull();
        expect(result?.title).toBe('Implement dark mode');
        expect(result?.reporterId).toBe('creator-2');
        expect(result?.createdAt).toBe(result?.updatedAt);
    });

    it('returns null when the extracted title is empty after stripping keywords', () => {
        // "[todo]" with nothing after it becomes empty title
        expect(createTaskFromChatMessage('[todo]', 'creator-3')).toBeNull();
    });

    it('includes description when message is multiline', () => {
        const result = createTaskFromChatMessage('new task: Fix pagination\nSee issue #42', 'creator-4');
        expect(result?.title).toBe('Fix pagination');
        expect(result?.description).toBe('See issue #42');
    });
});

describe('renderTaskCard', () => {
    it('includes task title, status and id in the rendered card', () => {
        const task = {
            id: 'task-99',
            title: 'Deploy feature',
            status: 'in-progress',
            createdAt: 0,
            updatedAt: 0,
        };
        const card = renderTaskCard(task);
        expect(card).toContain('Deploy feature');
        expect(card).toContain('in-progress');
        expect(card).toContain('task-99');
    });

    it('shows "未设置" for priority when absent', () => {
        const task = { id: 'x', title: 'T', status: 'todo', createdAt: 0, updatedAt: 0 };
        expect(renderTaskCard(task)).toContain('未设置');
    });

    it('shows priority when set', () => {
        const task = { id: 'x', title: 'T', status: 'todo', priority: 'high' as const, createdAt: 0, updatedAt: 0 };
        expect(renderTaskCard(task)).toContain('high');
    });
});

describe('createTaskUpdateMessage', () => {
    function makeTask(overrides: Record<string, any> = {}) {
        return {
            id: 'task-u1',
            title: 'Update Task',
            status: 'in-progress',
            createdAt: 0,
            updatedAt: 0,
            ...overrides,
        };
    }

    it('returns a TeamMessage with type "task-update"', () => {
        const msg = createTaskUpdateMessage(makeTask(), { status: 'done' }, 'Alice');
        expect(msg.type).toBe('task-update');
    });

    it('content contains task title and change details', () => {
        const msg = createTaskUpdateMessage(makeTask(), { status: 'done' }, 'Alice');
        expect(msg.content).toContain('Update Task');
        expect(msg.content).toContain('状态');
        expect(msg.content).toContain('done');
    });

    it('shortContent contains task title', () => {
        const msg = createTaskUpdateMessage(makeTask(), { priority: 'high' }, 'Bob');
        expect(msg.shortContent).toContain('Update Task');
    });

    it('metadata taskId matches the task id', () => {
        const msg = createTaskUpdateMessage(makeTask(), { status: 'todo' }, 'Eve');
        expect(msg.metadata?.taskId).toBe('task-u1');
    });

    it('has a non-empty string id and numeric timestamp', () => {
        const msg = createTaskUpdateMessage(makeTask(), { assigneeId: 'user-1' }, 'Carol');
        expect(typeof msg.id).toBe('string');
        expect(msg.id.length).toBeGreaterThan(0);
        expect(typeof msg.timestamp).toBe('number');
    });
});

describe('syncTaskStatusToChat', () => {
    function makeTask(overrides: Record<string, any> = {}) {
        return {
            id: 'task-s1',
            title: 'Sync Task',
            status: 'todo',
            createdAt: 0,
            updatedAt: 0,
            ...overrides,
        };
    }

    it('calls sendMessage once with a task-update message', async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        await syncTaskStatusToChat(makeTask(), 'todo', 'done', 'Alice', sendMessage);
        expect(sendMessage).toHaveBeenCalledTimes(1);
        const [msg] = sendMessage.mock.calls[0] as [{ type: string }];
        expect(msg.type).toBe('task-update');
    });

    it('message content contains old and new status', async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        await syncTaskStatusToChat(makeTask(), 'in-progress', 'done', 'Bob', sendMessage);
        const [msg] = sendMessage.mock.calls[0] as [{ content: string }];
        expect(msg.content).toContain('in-progress');
        expect(msg.content).toContain('done');
    });

    it('message content contains a task reference', async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        await syncTaskStatusToChat(makeTask(), 'todo', 'done', 'Carol', sendMessage);
        const [msg] = sendMessage.mock.calls[0] as [{ content: string }];
        expect(msg.content).toContain('#task-task-s1');
    });

    it('message fromDisplayName is the actorName', async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        await syncTaskStatusToChat(makeTask(), 'todo', 'done', 'Dave', sendMessage);
        const [msg] = sendMessage.mock.calls[0] as [{ fromDisplayName: string }];
        expect(msg.fromDisplayName).toBe('Dave');
    });

    it('shortContent contains both old and new status', async () => {
        const sendMessage = vi.fn().mockResolvedValue(undefined);
        await syncTaskStatusToChat(makeTask(), 'todo', 'review', 'Eve', sendMessage);
        const [msg] = sendMessage.mock.calls[0] as [{ shortContent: string }];
        expect(msg.shortContent).toContain('todo');
        expect(msg.shortContent).toContain('review');
    });
});
