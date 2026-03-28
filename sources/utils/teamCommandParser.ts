/**
 * Team Command Parser
 * 解析和处理团队聊天中的命令
 * 支持从聊天创建和管理任务
 */

import { linkTaskToSession } from '@/-zen/model/taskSessionLink';
import type { TodoItem, TodoState } from '@/-zen/model/ops';
import { storage } from '@/sync/storage';

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type CommandTaskStatus = 'todo' | 'in-progress' | 'review' | 'done';
type CommandTodoItem = TodoItem & {
  status?: CommandTaskStatus;
  assignee?: string | null;
};

const EMPTY_TODO_STATE: TodoState = {
  todos: {},
  undoneOrder: [],
  doneOrder: [],
  versions: {}
};

export interface ParsedCommand {
  type: 'createTask' | 'updateTask' | 'assignTask' | 'completeTask' | 'unknown';
  params: Record<string, any>;
  rawText: string;
}

export interface TaskCommandResult {
  success: boolean;
  message: string;
  taskId?: string;
  data?: any;
}

function getCurrentTodoState(): TodoState {
  return storage.getState().todoState || EMPTY_TODO_STATE;
}

function buildTodoOrders(
  todoState: TodoState,
  taskId: string,
  previousDone: boolean,
  nextDone: boolean
): Pick<TodoState, 'undoneOrder' | 'doneOrder'> {
  const hasInUndone = todoState.undoneOrder.includes(taskId);
  const hasInDone = todoState.doneOrder.includes(taskId);

  if (previousDone === nextDone) {
    if (nextDone) {
      return {
        undoneOrder: todoState.undoneOrder.filter((id) => id !== taskId),
        doneOrder: hasInDone ? todoState.doneOrder : [taskId, ...todoState.doneOrder],
      };
    }

    return {
      undoneOrder: hasInUndone ? todoState.undoneOrder : [...todoState.undoneOrder, taskId],
      doneOrder: todoState.doneOrder.filter((id) => id !== taskId),
    };
  }

  if (nextDone) {
    return {
      undoneOrder: todoState.undoneOrder.filter((id) => id !== taskId),
      doneOrder: [taskId, ...todoState.doneOrder.filter((id) => id !== taskId)],
    };
  }

  return {
    undoneOrder: [...todoState.undoneOrder.filter((id) => id !== taskId), taskId],
    doneOrder: todoState.doneOrder.filter((id) => id !== taskId),
  };
}

function applyTodoUpdate(taskId: string, updater: (todo: CommandTodoItem, now: number) => CommandTodoItem): CommandTodoItem | null {
  const todoState = getCurrentTodoState();
  const todo = todoState.todos[taskId] as CommandTodoItem | undefined;

  if (!todo) {
    return null;
  }

  const now = Date.now();
  const updatedTask = updater(todo, now);
  const orders = buildTodoOrders(todoState, taskId, Boolean(todo.done), Boolean(updatedTask.done));

  storage.getState().applyTodos({
    ...todoState,
    todos: {
      ...todoState.todos,
      [taskId]: updatedTask,
    },
    ...orders,
  });

  return updatedTask;
}

/**
 * 解析用户输入的命令
 */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();

  // 任务创建命令
  // /create task Implement i18n priority:high
  const createTaskRegex = /^\/create\s+task\s+(.+)/i;
  const createMatch = trimmed.match(createTaskRegex);
  if (createMatch) {
    const params = parseTaskParams(createMatch[1]);
    return {
      type: 'createTask',
      params,
      rawText: trimmed
    };
  }

  // 任务更新命令
  // /update task <taskId> status:in-progress
  const updateTaskRegex = /^\/update\s+task\s+(.+)/i;
  const updateMatch = trimmed.match(updateTaskRegex);
  if (updateMatch) {
    return {
      type: 'updateTask',
      params: parseUpdateParams(updateMatch[1]),
      rawText: trimmed
    };
  }

  // 任务分配命令
  // /assign task <taskId> to @member
  const assignTaskRegex = /^\/assign\s+task\s+(.+)/i;
  const assignMatch = trimmed.match(assignTaskRegex);
  if (assignMatch) {
    return {
      type: 'assignTask',
      params: parseAssignParams(assignMatch[1]),
      rawText: trimmed
    };
  }

  // 任务完成命令
  // /complete task <taskId>
  const completeTaskRegex = /^\/complete\s+task\s+(\S+)/i;
  const completeMatch = trimmed.match(completeTaskRegex);
  if (completeMatch) {
    return {
      type: 'completeTask',
      params: { taskId: completeMatch[1] },
      rawText: trimmed
    };
  }

  return null;
}

/**
 * 解析任务参数
 * 输入: "Implement i18n priority:high assignee:@builder"
 */
function parseTaskParams(input: string): Record<string, any> {
  const params: Record<string, any> = {
    title: '',
    description: '',
    priority: 'medium',
    assignee: null
  };

  // 提取 priority
  const priorityRegex = /priority:\s*(low|medium|high|urgent)/i;
  const priorityMatch = input.match(priorityRegex);
  if (priorityMatch) {
    params.priority = priorityMatch[1].toLowerCase();
    input = input.replace(priorityRegex, '').trim();
  }

  // 提取 assignee
  const assigneeRegex = /assignee:\s*@(\w+)/i;
  const assigneeMatch = input.match(assigneeRegex);
  if (assigneeMatch) {
    params.assignee = assigneeMatch[1];
    input = input.replace(assigneeRegex, '').trim();
  }

  // 剩余部分作为标题
  params.title = input;

  return params;
}

/**
 * 解析更新参数
 * 输入: "<taskId> status:in-progress priority:high"
 */
function parseUpdateParams(input: string): Record<string, any> {
  const params: Record<string, any> = {};

  // 第一个词是taskId
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (parts[0]) {
    params.taskId = parts[0];
  }

  // 提取status
  const statusRegex = /status:\s*(todo|in-progress|review|done)/i;
  const statusMatch = input.match(statusRegex);
  if (statusMatch) {
    params.status = statusMatch[1];
  }

  // 提取priority
  const priorityRegex = /priority:\s*(low|medium|high|urgent)/i;
  const priorityMatch = input.match(priorityRegex);
  if (priorityMatch) {
    params.priority = priorityMatch[1].toLowerCase();
  }

  return params;
}

/**
 * 解析分配参数
 * 输入: "<taskId> to @member"
 */
function parseAssignParams(input: string): Record<string, any> {
  const params: Record<string, any> = {};

  const parts = input.trim().split(/\s+/);
  if (parts.length >= 2) {
    params.taskId = parts[0];
    // 提取@mentions
    const mentionRegex = /@(\w+)/;
    const mentionMatch = input.match(mentionRegex);
    if (mentionMatch) {
      params.assignee = mentionMatch[1];
    }
  }

  return params;
}

/**
 * 执行任务创建命令
 */
export async function executeCreateTask(
  params: Record<string, any>,
  sessionId: string,
  teamId: string,
  displayName: string
): Promise<TaskCommandResult> {
  try {
    // 生成新的taskId
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 创建新任务
    const newTask = {
      id: taskId,
      title: params.title || 'Untitled Task',
      description: params.description || '',
      done: false,
      status: 'todo',
      priority: (params.priority || 'medium') as TaskPriority,
      assignee: params.assignee || null,
      teamId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      linkedSessions: {}
    };

    // 添加到storage
    const currentState = storage.getState();
    const todoState = currentState.todoState || { todos: {}, undoneOrder: [], doneOrder: [], versions: {} };
    const updatedTodoState = {
      ...todoState,
      todos: { ...todoState.todos, [taskId]: newTask },
      undoneOrder: todoState.undoneOrder?.includes(taskId)
        ? todoState.undoneOrder
        : [taskId, ...(todoState.undoneOrder || [])],
    };

    storage.getState().applyTodos(updatedTodoState);

    // 关联当前session
    await linkTaskToSession(
      taskId,
      sessionId,
      newTask.title,
      displayName
    );

    return {
      success: true,
      message: `✅ Task created: "${newTask.title}"\nPriority: ${newTask.priority}${params.assignee ? `\nAssigned to: @${params.assignee}` : ''}`,
      taskId,
      data: newTask
    };
  } catch (error) {
    console.error('Failed to create task:', error);
    return {
      success: false,
      message: `❌ Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 执行任务更新命令
 */
export async function executeUpdateTask(
  params: Record<string, any>
): Promise<TaskCommandResult> {
  try {
    const todoState = getCurrentTodoState();
    const todo = todoState.todos[params.taskId] as CommandTodoItem | undefined;

    if (!todo) {
      return {
        success: false,
        message: `❌ Task not found: ${params.taskId}`
      };
    }

    const updatedTask = applyTodoUpdate(params.taskId, (currentTodo, now) => {
      const nextStatus = (params.status || currentTodo.status || (currentTodo.done ? 'done' : 'todo')) as CommandTaskStatus;
      const nextDone = nextStatus === 'done' ? true : currentTodo.done && !params.status;

      return {
        ...currentTodo,
        ...(params.status && { status: nextStatus }),
        ...(params.priority && { priority: params.priority as TaskPriority }),
        done: nextDone,
        updatedAt: now,
        completedAt: nextDone
          ? (currentTodo.completedAt ?? now)
          : undefined,
      };
    });

    if (!updatedTask) {
      return {
        success: false,
        message: `❌ Task not found: ${params.taskId}`
      };
    }

    const messageLines = [`✅ Task updated: "${updatedTask.title}"`];
    if (params.status) {
      messageLines.push(`Status: ${params.status}`);
    }
    if (params.priority) {
      messageLines.push(`Priority: ${params.priority}`);
    }

    return {
      success: true,
      message: messageLines.join('\n'),
      taskId: params.taskId,
      data: updatedTask
    };
  } catch (error) {
    console.error('Failed to update task:', error);
    return {
      success: false,
      message: `❌ Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 执行任务完成命令
 */
export async function executeCompleteTask(
  taskId: string
): Promise<TaskCommandResult> {
  try {
    const todoState = getCurrentTodoState();
    const todo = todoState.todos[taskId] as CommandTodoItem | undefined;

    if (!todo) {
      return {
        success: false,
        message: `❌ Task not found: ${taskId}`
      };
    }

    const updatedTask = applyTodoUpdate(taskId, (currentTodo, now) => ({
      ...currentTodo,
      status: 'done',
      done: true,
      updatedAt: now,
      completedAt: currentTodo.completedAt ?? now,
    }));

    if (!updatedTask) {
      return {
        success: false,
        message: `❌ Task not found: ${taskId}`
      };
    }

    return {
      success: true,
      message: `✅ Task completed: "${updatedTask.title}"`,
      taskId,
      data: updatedTask
    };
  } catch (error) {
    console.error('Failed to complete task:', error);
    return {
      success: false,
      message: `❌ Failed to complete task: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 执行任务分配命令
 */
export async function executeAssignTask(
  params: Record<string, any>
): Promise<TaskCommandResult> {
  try {
    const todoState = getCurrentTodoState();
    const todo = todoState.todos[params.taskId] as CommandTodoItem | undefined;

    if (!todo) {
      return {
        success: false,
        message: `❌ Task not found: ${params.taskId}`
      };
    }

    const updatedTask = applyTodoUpdate(params.taskId, (currentTodo, now) => ({
      ...currentTodo,
      assignee: params.assignee || null,
      updatedAt: now,
    }));

    if (!updatedTask) {
      return {
        success: false,
        message: `❌ Task not found: ${params.taskId}`
      };
    }

    return {
      success: true,
      message: `✅ Task assigned: "${updatedTask.title}"${params.assignee ? `\nAssigned to: @${params.assignee}` : ''}`,
      taskId: params.taskId,
      data: updatedTask
    };
  } catch (error) {
    console.error('Failed to assign task:', error);
    return {
      success: false,
      message: `❌ Failed to assign task: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * 获取命令帮助信息
 */
export function getCommandHelp(): string {
  return `
📝 可用命令:

/create task <title> [priority:low|medium|high|urgent] [assignee:@role]
  创建新任务
  示例: /create task Implement i18n priority:high assignee:@builder

/update task <taskId> [status:todo|in-progress|review|done] [priority:low|medium|high|urgent]
  更新任务
  示例: /update task task_123 status:in-progress

/assign task <taskId> to @role
  分配任务
  示例: /assign task task_123 to @builder

/complete task <taskId>
  完成任务
  示例: /complete task task_123
  `.trim();
}
