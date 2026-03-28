import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMock = vi.hoisted(() => ({
  current: {
    todoState: null as any,
    applyTodos: vi.fn(),
  },
}));

const linkTaskToSessionMock = vi.hoisted(() => vi.fn());

vi.mock('@/sync/storage', () => ({
  storage: {
    getState: () => storageMock.current,
  },
}));

vi.mock('@/-zen/model/taskSessionLink', () => ({
  linkTaskToSession: linkTaskToSessionMock,
}));

import {
  executeCreateTask,
  executeAssignTask,
  executeCompleteTask,
  executeUpdateTask,
  getCommandHelp,
  parseCommand,
} from './teamCommandParser';

function createTodoState() {
  return {
    todos: {
      'task-1': {
        id: 'task-1',
        title: 'Implement parser',
        done: false,
        status: 'todo',
        priority: 'medium',
        createdAt: 10,
        updatedAt: 10,
      },
      'task-2': {
        id: 'task-2',
        title: 'Ship done task',
        done: true,
        status: 'done',
        priority: 'high',
        createdAt: 20,
        updatedAt: 20,
        completedAt: 20,
      },
    },
    undoneOrder: ['task-1'],
    doneOrder: ['task-2'],
    versions: {},
  };
}

describe('teamCommandParser', () => {
  beforeEach(() => {
    storageMock.current.todoState = createTodoState();
    storageMock.current.applyTodos = vi.fn((todoState) => {
      storageMock.current.todoState = todoState;
    });
    linkTaskToSessionMock.mockReset();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  describe('parseCommand', () => {
    it('parses create task commands', () => {
      expect(parseCommand('/create task Implement i18n priority:high assignee:@builder')).toEqual({
        type: 'createTask',
        params: {
          title: 'Implement i18n',
          description: '',
          priority: 'high',
          assignee: 'builder',
        },
        rawText: '/create task Implement i18n priority:high assignee:@builder',
      });
    });

    it('parses update task commands', () => {
      expect(parseCommand('/update task task-1 status:in-progress priority:high')).toEqual({
        type: 'updateTask',
        params: {
          taskId: 'task-1',
          status: 'in-progress',
          priority: 'high',
        },
        rawText: '/update task task-1 status:in-progress priority:high',
      });
    });

    it('parses assign and complete commands', () => {
      expect(parseCommand('/assign task task-1 to @reviewer')).toEqual({
        type: 'assignTask',
        params: {
          taskId: 'task-1',
          assignee: 'reviewer',
        },
        rawText: '/assign task task-1 to @reviewer',
      });

      expect(parseCommand('/complete task task-1')).toEqual({
        type: 'completeTask',
        params: {
          taskId: 'task-1',
        },
        rawText: '/complete task task-1',
      });
    });

    it('returns null for unknown commands', () => {
      expect(parseCommand('/noop task task-1')).toBeNull();
    });
  });

  describe('executeCreateTask', () => {
    it('creates a new task, stores it, and links it to the current session', async () => {
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

      const result = await executeCreateTask(
        {
          title: 'Document the rollout',
          priority: 'high',
          assignee: 'builder',
        },
        'session-1',
        'team-1',
        'Alice',
      );

      expect(result.success).toBe(true);
      expect(result.taskId).toMatch(/^task_1700000000000_/);
      expect(storageMock.current.applyTodos).toHaveBeenCalledOnce();
      expect(storageMock.current.todoState.undoneOrder[0]).toBe(result.taskId);
      expect(storageMock.current.todoState.todos[result.taskId!]).toMatchObject({
        title: 'Document the rollout',
        priority: 'high',
        assignee: 'builder',
        teamId: 'team-1',
        done: false,
        status: 'todo',
      });
      expect(linkTaskToSessionMock).toHaveBeenCalledWith(
        result.taskId,
        'session-1',
        'Document the rollout',
        'Alice',
      );

      randomSpy.mockRestore();
    });

    it('returns a failure result when linking the task throws', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      linkTaskToSessionMock.mockRejectedValueOnce(new Error('link failed'));

      const result = await executeCreateTask(
        { title: 'Broken task' },
        'session-1',
        'team-1',
        'Alice',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('link failed');
    });
  });

  describe('executeUpdateTask', () => {
    it('updates task status and priority through storage', async () => {
      const result = await executeUpdateTask({
        taskId: 'task-1',
        status: 'in-progress',
        priority: 'urgent',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Status: in-progress');
      expect(result.message).toContain('Priority: urgent');
      expect(storageMock.current.applyTodos).toHaveBeenCalledOnce();
      expect(storageMock.current.todoState.todos['task-1']).toMatchObject({
        id: 'task-1',
        status: 'in-progress',
        priority: 'urgent',
        done: false,
        updatedAt: 1_700_000_000_000,
      });
      expect(storageMock.current.todoState.undoneOrder).toEqual(['task-1']);
      expect(storageMock.current.todoState.doneOrder).toEqual(['task-2']);
    });

    it('moves a task to the done list when status becomes done', async () => {
      const result = await executeUpdateTask({
        taskId: 'task-1',
        status: 'done',
      });

      expect(result.success).toBe(true);
      expect(storageMock.current.todoState.todos['task-1']).toMatchObject({
        done: true,
        status: 'done',
        completedAt: 1_700_000_000_000,
      });
      expect(storageMock.current.todoState.undoneOrder).toEqual([]);
      expect(storageMock.current.todoState.doneOrder).toEqual(['task-1', 'task-2']);
    });

    it('moves a done task back to undone when status leaves done', async () => {
      const result = await executeUpdateTask({
        taskId: 'task-2',
        status: 'review',
      });

      expect(result.success).toBe(true);
      expect(storageMock.current.todoState.todos['task-2']).toMatchObject({
        done: false,
        status: 'review',
        completedAt: undefined,
      });
      expect(storageMock.current.todoState.undoneOrder).toEqual(['task-1', 'task-2']);
      expect(storageMock.current.todoState.doneOrder).toEqual([]);
    });

    it('keeps a completed task in doneOrder when only metadata changes', async () => {
      const result = await executeUpdateTask({
        taskId: 'task-2',
        priority: 'urgent',
      });

      expect(result.success).toBe(true);
      expect(storageMock.current.todoState.todos['task-2']).toMatchObject({
        done: true,
        priority: 'urgent',
        completedAt: 20,
      });
      expect(storageMock.current.todoState.doneOrder).toEqual(['task-2']);
    });

    it('returns an error for missing task ids without mutating state', async () => {
      const before = storageMock.current.todoState;

      const result = await executeUpdateTask({
        taskId: 'missing-task',
        status: 'done',
      });

      expect(result).toEqual({
        success: false,
        message: '❌ Task not found: missing-task',
      });
      expect(storageMock.current.applyTodos).not.toHaveBeenCalled();
      expect(storageMock.current.todoState).toBe(before);
    });
  });

  describe('executeCompleteTask', () => {
    it('marks the task as done and moves it to the front of doneOrder', async () => {
      const result = await executeCompleteTask('task-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('✅ Task completed: "Implement parser"');
      expect(storageMock.current.todoState.todos['task-1']).toMatchObject({
        done: true,
        status: 'done',
        completedAt: 1_700_000_000_000,
      });
      expect(storageMock.current.todoState.undoneOrder).toEqual([]);
      expect(storageMock.current.todoState.doneOrder).toEqual(['task-1', 'task-2']);
    });

    it('returns an error when completing an unknown task', async () => {
      const result = await executeCompleteTask('missing-task');

      expect(result).toEqual({
        success: false,
        message: '❌ Task not found: missing-task',
      });
    });
  });

  describe('executeAssignTask', () => {
    it('assigns the task to the requested member through storage', async () => {
      const result = await executeAssignTask({
        taskId: 'task-1',
        assignee: 'builder',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Assigned to: @builder');
      expect(storageMock.current.todoState.todos['task-1']).toMatchObject({
        assignee: 'builder',
        updatedAt: 1_700_000_000_000,
      });
      expect(storageMock.current.todoState.undoneOrder).toEqual(['task-1']);
    });

    it('returns an error for unknown tasks', async () => {
      const result = await executeAssignTask({
        taskId: 'missing-task',
        assignee: 'builder',
      });

      expect(result).toEqual({
        success: false,
        message: '❌ Task not found: missing-task',
      });
      expect(storageMock.current.applyTodos).not.toHaveBeenCalled();
    });
  });

  describe('getCommandHelp', () => {
    it('lists the supported task commands', () => {
      const help = getCommandHelp();

      expect(help).toContain('/create task <title>');
      expect(help).toContain('/update task <taskId>');
      expect(help).toContain('/assign task <taskId> to @role');
      expect(help).toContain('/complete task <taskId>');
    });
  });
});
