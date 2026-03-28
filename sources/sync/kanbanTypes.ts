import {
    TEAM_ROLE_LIBRARY,
    DEFAULT_TEAM_AGREEMENTS as SHARED_TEAM_AGREEMENTS,
    DEFAULT_KANBAN_BOARD as SHARED_KANBAN_BOARD,
    DEFAULT_STATUS_PROPAGATION as SHARED_STATUS_PROPAGATION,
    DEFAULT_NESTED_TASK_SETTINGS as SHARED_NESTED_TASK_SETTINGS
} from '@happy/shared-team-config';
import type { SharedNestedTaskSettings, SharedStatusPropagation } from '@happy/shared-team-config';

export interface KanbanColumn {
    id: string;
    title: string;
}

// 任务执行链接 - 追踪哪个 Session 正在执行任务
export interface TaskExecutionLink {
    sessionId: string;
    linkedAt: number;
    role: 'primary' | 'supporting';  // primary = 主要执行者, supporting = 协助
    status: 'active' | 'completed' | 'abandoned';
}

// 任务阻塞记录
export interface TaskBlocker {
    id: string;
    type: 'dependency' | 'question' | 'resource' | 'technical';
    description: string;
    raisedAt: number;
    raisedBy?: string;  // Session ID
    resolvedAt?: number;
    resolvedBy?: string;
    resolution?: string;
}

export interface HumanStatusLock {
    mode: 'viewing' | 'editing' | 'manual-status';
    lockedAt: number;
    lockedBySessionId?: string;
    lockedByRole?: string;
    lockedByDisplayName?: string;
    reason?: string;
}

// 状态传播配置
export type StatusPropagation = SharedStatusPropagation;

export type NestedTaskSettings = SharedNestedTaskSettings;

export const DEFAULT_STATUS_PROPAGATION: StatusPropagation = {
    ...(SHARED_STATUS_PROPAGATION ?? {
        autoCompleteParent: true,
        blockParentOnBlocked: true,
        cascadeDeleteSubtasks: false
    })
};

const DEFAULT_EXECUTION_SETTINGS: NestedTaskSettings['execution'] = {
    ...(SHARED_NESTED_TASK_SETTINGS?.execution ?? {
        requirePlan: true,
        autoLinkSessions: true,
        broadcastStatus: true
    })
};

const DEFAULT_NESTED_TASK_SETTINGS: NestedTaskSettings = {
    maxDepth: SHARED_NESTED_TASK_SETTINGS?.maxDepth ?? 3,
    statusPropagation: { ...DEFAULT_STATUS_PROPAGATION },
    execution: { ...DEFAULT_EXECUTION_SETTINGS }
};

const cloneNestedTaskSettings = (settings?: NestedTaskSettings): NestedTaskSettings | undefined => {
    if (!settings) return undefined;
    return {
        ...settings,
        statusPropagation: { ...settings.statusPropagation },
        execution: { ...settings.execution }
    };
};

const cloneNestedTaskSettingsOrDefault = (settings?: NestedTaskSettings): NestedTaskSettings =>
    cloneNestedTaskSettings(settings) ?? cloneNestedTaskSettings(DEFAULT_NESTED_TASK_SETTINGS)!;

export interface KanbanTask {
    id: string;
    title: string;
    description?: string;
    status: string; // Should match a column id
    assigneeId?: string | null; // Session ID of the assigned agent
    reporterId?: string; // Session ID of the creator
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    createdAt: number;
    updatedAt: number;

    // 🆕 嵌套任务支持
    parentTaskId?: string | null;     // 父任务 ID (null/undefined = 顶级任务)
    subtaskIds?: string[];            // 子任务 ID 列表 (有序)
    depth?: number;                   // 嵌套深度 (0=顶级, 1=一级子任务...)

    // 🆕 状态传播配置
    statusPropagation?: StatusPropagation;
    hasBlockedChild?: boolean;        // 是否有子任务被阻塞

    // 🆕 执行链接 - Session 与任务的关联
    executionLinks?: TaskExecutionLink[];

    // 🆕 阻塞追踪
    blockers?: TaskBlocker[];

    // 🆕 人工锁 - 人类用户正在查看/编辑或刚手动改状态时，阻止 agent 覆盖
    humanStatusLock?: HumanStatusLock | null;

    // 🆕 Chat-Board 集成
    relatedMessageIds?: string[];     // 关联的聊天消息ID列表
    dueDate?: number;                 // 截止日期
    tags?: string[];                  // 任务标签

    // 🆕 Todo 集成
    todoId?: string;                  // 关联的 Todo 项 ID
    linkedSessionIds?: string[];      // 相关的会话 IDs (从 Todo 继承)

    // 🆕 任务来源和审批
    source?: 'ai' | 'user' | 'todo';  // 任务来源
    sourceMessageId?: string;         // 来源消息 ID（如果从聊天创建）
    approvalStatus?: 'pending' | 'approved' | 'rejected'; // 审批状态
    rejectionReason?: string;         // 拒绝原因
    approvedBy?: string[];            // 审批者 IDs
    rejectedBy?: string[];            // 拒绝者 IDs
    reassignedBy?: string[];          // 重新分配执行者 IDs
    reassignedAt?: number | null;     // 重新分配时间
    isDeleted?: boolean;              // 删除标记
    deletedAt?: number | null;        // 删除时间
    deletionReason?: string;          // 删除原因

    // 🆕 依赖关系
    dependencies?: string[];          // 依赖的任务 IDs
    blocks?: string[];                // 阻塞的任务 IDs

    // 🆕 附件和检查清单
    attachments?: TaskAttachment[];   // 附件（文件、截图等）
    checklists?: TaskChecklist[];     // 任务检查清单
    comments?: TaskComment[];         // 任务评论
}

// 🆕 任务附件
export interface TaskAttachment {
    id: string;
    type: 'file' | 'image' | 'link' | 'code';
    name: string;
    url?: string;
    content?: string;
    createdAt: number;
    createdBy?: string;
}

// 🆕 任务检查清单
export interface TaskChecklist {
    id: string;
    title: string;
    items: TaskChecklistItem[];
}

export interface TaskChecklistItem {
    id: string;
    text: string;
    completed: boolean;
    completedAt?: number;
    completedBy?: string;
}

// 🆕 任务评论
export type TaskCommentType =
    | 'note'
    | 'status-change'
    | 'review-feedback'
    | 'handoff'
    | 'blocker'
    | 'decision'
    | 'human-override'
    | 'plan'
    | 'plan-review'
    | 'execution-check'
    | 'rework-request';

export interface TaskComment {
    id: string;
    authorSessionId: string;
    authorRole?: string;
    authorDisplayName?: string;
    type: TaskCommentType;
    content: string;
    createdAt: number;
    updatedAt?: number;
    fromStatus?: string;
    toStatus?: string;
    mentions?: string[];
}

export interface KanbanBoard {
    name?: string;
    description?: string;
    columns: KanbanColumn[];
    tasks: KanbanTask[];
    roomId?: string;
    taskSettings?: NestedTaskSettings;
    team?: KanbanTeam;
}

export type TeamAuthority =
    | 'user.reply'
    | 'message.route'
    | 'task.create'
    | 'task.assign'
    | 'task.update.any'
    | 'task.approve'
    | 'task.start.self'
    | 'task.complete.self'
    | 'agent.spawn';

export interface KanbanTeamMemberOverlay {
    promptSuffix?: string;
    messaging?: {
        listenFrom?: string[] | '*';
        receiveUserMessages?: boolean;
        replyMode?: 'proactive' | 'responsive' | 'passive';
    };
    behavior?: {
        onIdle?: 'wait' | 'self-assign' | 'ask';
        onBlocked?: 'report' | 'escalate' | 'retry';
        canSpawnAgents?: boolean;
        requireExplicitAssignment?: boolean;
    };
    authorities?: TeamAuthority[];
}

export interface KanbanTeamMember {
    /**
     * Stable team-member identity used for recovery.
     * Unlike sessionId, this survives runtime restarts and session recreation.
     */
    memberId?: string;
    sessionId: string;
    /**
     * Stable Aha session tag used with getOrCreateSession(tag, ...).
     * Recover flows should reuse this instead of generating a fresh random tag.
     */
    sessionTag?: string;
    candidateId?: string;
    roleId: string;
    displayName?: string;
    focusAreas?: string[];
    specId?: string;
    authorities?: TeamAuthority[];
    teamOverlay?: KanbanTeamMemberOverlay;
    customPrompt?: string;
    parentSessionId?: string;
    executionPlane?: string;
    runtimeType?: string;
    /**
     * Truth-layer lifecycle timestamps for spawned agents.
     *
     * - spawnRequestedAt: when the system asked for this agent/session to be created
     * - processStartedAt: when the agent process itself started running
     * - handshakeReadyAt: first authoritative "online and ready" handshake observed in team messages
     * - taskAckedAt: first execution-started/task-ack observed for this session
     */
    lifecycle?: {
        spawnRequestedAt?: number;
        processStartedAt?: number;
        handshakeReadyAt?: number;
        taskAckedAt?: number;
        taskAckedTaskId?: string;
    };
}

export interface KanbanTeamRole {
    id: string;
    title: string;
    summary: string;
    responsibilities: string[];
    abilityBoundaries: string[];
    handoffProtocol: string[];
    protocol: string[];
    policy?: {
        autoStartMaster?: boolean;
        permissionMode?: string;
        watchers?: string[];
        accessLevel?: 'read-only' | 'full-access';
        disallowedTools?: string[];
        coordinationMode?: 'strong' | 'weak';
        taskSettings?: NestedTaskSettings;
    };
}

export interface KanbanTeamAgreement {
    statusUpdates: string;
    handoffs: string;
    escalation: string;
    definitionOfDone: string;
}

export interface KanbanTeam {
    name?: string;
    members: KanbanTeamMember[];
    roles: KanbanTeamRole[];
    agreements: KanbanTeamAgreement;
    bootContext?: {
        teamDescription?: string;
        initialObjective?: string;
        sharedContext?: string[];
        commandChain?: string[];
        taskPolicy?: {
            boardIsSourceOfTruth?: boolean;
            requireTaskForExecution?: boolean;
            forbidChatOnlyExecution?: boolean;
            forbidPeerToPeerRouting?: boolean;
        };
    };
}

const cloneRole = (role: (typeof TEAM_ROLE_LIBRARY)[number]): KanbanTeamRole => ({
    id: role.id,
    title: role.title,
    summary: role.summary,
    responsibilities: [...role.responsibilities],
    abilityBoundaries: [...role.abilityBoundaries],
    handoffProtocol: [...role.handoffProtocol],
    protocol: [...role.protocol],
    policy: role.policy ? {
        ...role.policy,
        watchers: role.policy.watchers ? [...role.policy.watchers] : undefined,
        disallowedTools: role.policy.disallowedTools ? [...role.policy.disallowedTools] : undefined,
        taskSettings: cloneNestedTaskSettings(role.policy.taskSettings)
    } : undefined
});

export const DEFAULT_TEAM_ROLES: KanbanTeamRole[] = TEAM_ROLE_LIBRARY.map(cloneRole);

export const DEFAULT_TEAM_AGREEMENTS: KanbanTeamAgreement = {
    ...SHARED_TEAM_AGREEMENTS
};

export const DEFAULT_KANBAN_BOARD: KanbanBoard = {
    columns: SHARED_KANBAN_BOARD.columns.map((column): KanbanColumn => ({ ...column })),
    tasks: [],
    taskSettings: cloneNestedTaskSettingsOrDefault(
        ('taskSettings' in SHARED_KANBAN_BOARD ? SHARED_KANBAN_BOARD.taskSettings : undefined)
    ),
    team: {
        members: [],
        roles: DEFAULT_TEAM_ROLES.map(cloneRole),
        agreements: { ...DEFAULT_TEAM_AGREEMENTS }
    }
};
