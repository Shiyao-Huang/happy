import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_TEAM_AGREEMENTS,
    DEFAULT_TEAM_ROLES,
    type KanbanBoard,
    type KanbanTeamMember,
} from '@/sync/kanbanTypes';
import type { TeamMessage } from '@/sync/teamMessageTypes';

import { applyDerivedLifecycleTimestamps, buildDerivedLifecyclePersistPlan } from './teamLifecycle';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('applyDerivedLifecycleTimestamps', () => {
    it('derives handshake and first task ack timestamps from team messages', () => {
        const members: KanbanTeamMember[] = [
            {
                sessionId: 'session-1',
                roleId: 'implementer',
                displayName: 'Implementer 1',
                lifecycle: {
                    spawnRequestedAt: 100,
                },
            },
        ];

        const messages: TeamMessage[] = [
            {
                id: 'm1',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                fromRole: 'implementer',
                content: 'online and ready',
                type: 'chat',
                timestamp: 200,
                metadata: {
                    type: 'handshake',
                },
            },
            {
                id: 'm2',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                fromRole: 'implementer',
                content: '[implementer] Started working on "Task A"',
                type: 'task-update',
                timestamp: 300,
                metadata: {
                    taskId: 'task-a',
                    changeType: 'execution-started',
                },
            },
            {
                id: 'm3',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                fromRole: 'implementer',
                content: '[implementer] Started working on "Task B"',
                type: 'task-update',
                timestamp: 400,
                metadata: {
                    taskId: 'task-b',
                    changeType: 'execution-started',
                },
            },
        ];

        const result = applyDerivedLifecycleTimestamps(members, messages);

        expect(result.changed).toBe(true);
        expect(result.members[0].lifecycle).toEqual({
            spawnRequestedAt: 100,
            handshakeReadyAt: 200,
            taskAckedAt: 300,
            taskAckedTaskId: 'task-a',
        });
    });

    it('does not rewrite members when derived timestamps are already present', () => {
        const members: KanbanTeamMember[] = [
            {
                sessionId: 'session-1',
                roleId: 'implementer',
                lifecycle: {
                    spawnRequestedAt: 100,
                    handshakeReadyAt: 200,
                    taskAckedAt: 300,
                    taskAckedTaskId: 'task-a',
                },
            },
        ];

        const messages: TeamMessage[] = [
            {
                id: 'm1',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                content: 'online and ready',
                type: 'chat',
                timestamp: 200,
                metadata: {
                    type: 'handshake',
                },
            },
            {
                id: 'm2',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                content: '[implementer] Started working on "Task A"',
                type: 'task-update',
                timestamp: 300,
                metadata: {
                    taskId: 'task-a',
                    changeType: 'execution-started',
                },
            },
        ];

        const result = applyDerivedLifecycleTimestamps(members, messages);

        expect(result.changed).toBe(false);
        expect(result.members[0]).toBe(members[0]);
    });

    it('persists processStartedAt from authoritative session metadata before handshake', () => {
        const members: KanbanTeamMember[] = [
            {
                sessionId: 'session-1',
                roleId: 'implementer',
                lifecycle: {
                    spawnRequestedAt: 100,
                },
            },
        ];

        const messages: TeamMessage[] = [
            {
                id: 'm1',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                content: 'online and ready',
                type: 'chat',
                timestamp: 300,
                metadata: {
                    type: 'handshake',
                },
            },
        ];

        const result = applyDerivedLifecycleTimestamps(
            members,
            messages,
            new Map([['session-1', 200]]),
        );

        expect(result.changed).toBe(true);
        expect(result.members[0].lifecycle).toEqual({
            spawnRequestedAt: 100,
            processStartedAt: 200,
            handshakeReadyAt: 300,
        });
    });

    it('persists processStartedAt even before any handshake messages arrive', () => {
        const members: KanbanTeamMember[] = [
            {
                sessionId: 'session-1',
                roleId: 'implementer',
                lifecycle: {
                    spawnRequestedAt: 100,
                },
            },
        ];

        const result = applyDerivedLifecycleTimestamps(
            members,
            [],
            new Map([['session-1', 180]]),
        );

        expect(result.changed).toBe(true);
        expect(result.members[0].lifecycle).toEqual({
            spawnRequestedAt: 100,
            processStartedAt: 180,
        });
    });

    it('logs an anomaly when lifecycle timestamps violate monotone order', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const members: KanbanTeamMember[] = [
            {
                sessionId: 'session-1',
                roleId: 'implementer',
                lifecycle: {
                    spawnRequestedAt: 300,
                },
            },
        ];

        const messages: TeamMessage[] = [
            {
                id: 'm1',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                content: 'online and ready',
                type: 'chat',
                timestamp: 200,
                metadata: {
                    type: 'handshake',
                },
            },
        ];

        const result = applyDerivedLifecycleTimestamps(members, messages);

        expect(result.changed).toBe(true);
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0]?.[0]).toContain('Non-monotone lifecycle timestamps');
    });

    it('dedupes repeated lifecycle persistence plans while the same artifact body is already pending', () => {
        const board: KanbanBoard = {
            columns: [],
            tasks: [],
            team: {
                name: 'Team 1',
                roles: DEFAULT_TEAM_ROLES,
                agreements: DEFAULT_TEAM_AGREEMENTS,
                members: [
                    {
                        sessionId: 'session-1',
                        roleId: 'implementer',
                        displayName: 'Implementer 1',
                        lifecycle: {
                            spawnRequestedAt: 100,
                        },
                    },
                ],
            },
        };

        const messages: TeamMessage[] = [
            {
                id: 'm1',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                fromRole: 'implementer',
                content: 'online and ready',
                type: 'chat',
                timestamp: 200,
                metadata: {
                    type: 'handshake',
                },
            },
            {
                id: 'm2',
                teamId: 'team-1',
                fromSessionId: 'session-1',
                fromRole: 'implementer',
                content: '[implementer] Started working on "Task A"',
                type: 'task-update',
                timestamp: 300,
                metadata: {
                    taskId: 'task-a',
                    changeType: 'execution-started',
                },
            },
        ];

        const currentBody = JSON.stringify(board, null, 2);

        const firstPlan = buildDerivedLifecyclePersistPlan({
            board,
            currentBody,
            messages,
        });

        expect(firstPlan.shouldPersist).toBe(true);
        expect(firstPlan.nextBody).not.toBeNull();

        const secondPlan = buildDerivedLifecyclePersistPlan({
            board,
            currentBody,
            messages,
            lastScheduledBody: firstPlan.nextBody,
        });

        expect(secondPlan.changed).toBe(true);
        expect(secondPlan.nextBody).toBe(firstPlan.nextBody);
        expect(secondPlan.shouldPersist).toBe(false);
        expect(secondPlan.reason).toBe('duplicate-pending-body');
    });
});
