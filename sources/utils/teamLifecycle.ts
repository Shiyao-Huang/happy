import type { KanbanBoard, KanbanTeamMember } from '@/sync/kanbanTypes';
import type { TeamMessage } from '@/sync/teamMessageTypes';

type MemberLifecycle = NonNullable<KanbanTeamMember['lifecycle']>;

function logLifecycleInvariantAnomaly(sessionId: string, lifecycle: MemberLifecycle) {
    const checkpoints: Array<[keyof MemberLifecycle, number | undefined]> = [
        ['spawnRequestedAt', lifecycle.spawnRequestedAt],
        ['processStartedAt', lifecycle.processStartedAt],
        ['handshakeReadyAt', lifecycle.handshakeReadyAt],
        ['taskAckedAt', lifecycle.taskAckedAt],
    ];

    let previousName: keyof MemberLifecycle | null = null;
    let previousValue: number | undefined;

    for (const [name, value] of checkpoints) {
        if (typeof value !== 'number') {
            continue;
        }

        if (typeof previousValue === 'number' && value < previousValue) {
            console.warn(
                `[teamLifecycle] Non-monotone lifecycle timestamps for ${sessionId}: ${String(previousName)}=${previousValue} > ${String(name)}=${value}`,
                lifecycle,
            );
            return;
        }

        previousName = name;
        previousValue = value;
    }
}

function isHandshakeMessage(message: TeamMessage): boolean {
    return message.metadata?.type === 'handshake' || message.metadata?.handshake?.type === 'handshake';
}

function isTaskAckMessage(message: TeamMessage): boolean {
    return message.type === 'task-update' && message.metadata?.changeType === 'execution-started';
}

export function applyDerivedLifecycleTimestamps(
    members: KanbanTeamMember[],
    messages: TeamMessage[],
    processStartedBySessionId: ReadonlyMap<string, number> = new Map(),
): { members: KanbanTeamMember[]; changed: boolean } {
    if (members.length === 0) {
        return { members, changed: false };
    }

    const sortedMessages = [...messages].sort((a, b) => a.timestamp - b.timestamp);
    const derivedBySession = new Map<string, Partial<MemberLifecycle>>();

    for (const message of sortedMessages) {
        const sessionId = message.fromSessionId;
        if (!sessionId) {
            continue;
        }

        const derived = derivedBySession.get(sessionId) ?? {};

        if (isHandshakeMessage(message) && !derived.handshakeReadyAt) {
            derived.handshakeReadyAt = message.timestamp;
        }

        if (isTaskAckMessage(message) && !derived.taskAckedAt) {
            derived.taskAckedAt = message.timestamp;
            if (typeof message.metadata?.taskId === 'string') {
                derived.taskAckedTaskId = message.metadata.taskId;
            }
        }

        if (derived.handshakeReadyAt || derived.taskAckedAt) {
            derivedBySession.set(sessionId, derived);
        }
    }

    let changed = false;
    const nextMembers = members.map((member) => {
        const derived = derivedBySession.get(member.sessionId);
        const processStartedAt = processStartedBySessionId.get(member.sessionId);

        if (!derived && !processStartedAt) {
            return member;
        }

        const currentLifecycle = member.lifecycle ?? {};
        const nextLifecycle: MemberLifecycle = { ...currentLifecycle };
        let memberChanged = false;

        if (processStartedAt && currentLifecycle.processStartedAt !== processStartedAt) {
            nextLifecycle.processStartedAt = processStartedAt;
            memberChanged = true;
        }

        if (derived?.handshakeReadyAt && currentLifecycle.handshakeReadyAt !== derived.handshakeReadyAt) {
            nextLifecycle.handshakeReadyAt = derived.handshakeReadyAt;
            memberChanged = true;
        }

        if (derived?.taskAckedAt && currentLifecycle.taskAckedAt !== derived.taskAckedAt) {
            nextLifecycle.taskAckedAt = derived.taskAckedAt;
            memberChanged = true;
        }

        if (derived?.taskAckedTaskId && currentLifecycle.taskAckedTaskId !== derived.taskAckedTaskId) {
            nextLifecycle.taskAckedTaskId = derived.taskAckedTaskId;
            memberChanged = true;
        }

        if (!memberChanged) {
            return member;
        }

        changed = true;
        const nextMember = {
            ...member,
            lifecycle: nextLifecycle,
        };
        logLifecycleInvariantAnomaly(member.sessionId, nextLifecycle);
        return nextMember;
    });

    return {
        members: nextMembers,
        changed,
    };
}

export interface DerivedLifecyclePersistPlanInput {
    board: KanbanBoard;
    currentBody?: string | null;
    messages: TeamMessage[];
    processStartedBySessionId?: ReadonlyMap<string, number>;
    lastScheduledBody?: string | null;
}

export interface DerivedLifecyclePersistPlan {
    changed: boolean;
    nextBoard: KanbanBoard | null;
    nextBody: string | null;
    shouldPersist: boolean;
    reason:
        | 'no-team-members'
        | 'no-derived-change'
        | 'body-already-current'
        | 'duplicate-pending-body'
        | 'persist';
}

export function buildDerivedLifecyclePersistPlan({
    board,
    currentBody,
    messages,
    processStartedBySessionId = new Map(),
    lastScheduledBody,
}: DerivedLifecyclePersistPlanInput): DerivedLifecyclePersistPlan {
    const currentTeam = board.team;
    const members = currentTeam?.members ?? [];
    if (!currentTeam || members.length === 0) {
        return {
            changed: false,
            nextBoard: null,
            nextBody: null,
            shouldPersist: false,
            reason: 'no-team-members',
        };
    }

    const { members: nextMembers, changed } = applyDerivedLifecycleTimestamps(
        members,
        messages,
        processStartedBySessionId,
    );

    if (!changed) {
        return {
            changed: false,
            nextBoard: null,
            nextBody: null,
            shouldPersist: false,
            reason: 'no-derived-change',
        };
    }

    const nextBoard: KanbanBoard = {
        ...board,
        team: {
            ...currentTeam,
            members: nextMembers,
        },
    };
    const nextBody = JSON.stringify(nextBoard, null, 2);

    if (currentBody === nextBody) {
        return {
            changed: true,
            nextBoard,
            nextBody,
            shouldPersist: false,
            reason: 'body-already-current',
        };
    }

    if (lastScheduledBody === nextBody) {
        return {
            changed: true,
            nextBoard,
            nextBody,
            shouldPersist: false,
            reason: 'duplicate-pending-body',
        };
    }

    return {
        changed: true,
        nextBoard,
        nextBody,
        shouldPersist: true,
        reason: 'persist',
    };
}
