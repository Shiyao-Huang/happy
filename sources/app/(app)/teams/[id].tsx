import React from 'react';
import {
    Platform,
    Pressable,
    StyleSheet,
    View,
    useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/ui/StyledText';
import {
    trackAgentDeployed,
    trackTaskApproval,
    trackTaskCompleted,
    trackTaskCreated,
    trackTaskMoved,
    trackTeamViewed,
} from '@/track';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { storage, useArtifact, useAllMachines, useProfile, useIsDataReady, useArtifacts, useSocketStatus } from '@/sync/storage';
import { useShallow } from 'zustand/react/shallow';
import { sync } from '@/sync/sync';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Modal } from '@/modal';
import {
    KanbanBoard,
    KanbanColumn,
    KanbanTask,
    TaskComment,
    HumanStatusLock,
    DEFAULT_TEAM_ROLES,
    DEFAULT_TEAM_AGREEMENTS,
    DEFAULT_KANBAN_BOARD
} from '@/sync/kanbanTypes';
import { useDesktopBridge } from '@/desktop/useDesktopBridge';
import { getDisplayName } from '@/sync/profile';
import TeamChatRoom from '@/components/team/TeamChatRoom';
import { TaskDetailModal } from '@/components/team/TaskDetailModal';
import { TaskApprovalModal } from '@/components/team/TaskApprovalModal';
import { NewTaskModal } from '@/components/team/NewTaskModal';
import { TeamStatusBar } from '@/components/team/TeamStatusBar';
import { TeamAgentsPopover } from '@/components/team/TeamAgentsPopover';
import { TeamAgentLibraryModal } from '@/components/team/TeamAgentLibraryModal';
import { useTaskExportAutoCache } from '@/hooks/useTaskExportAutoCache';
import { ImportTaskButton } from '@/components/team/ImportTaskButton';
import { ExportTaskButton } from '@/components/team/ExportTaskButton';
import { useTaskChatSync } from '@/hooks/useTaskChatSync';
import type { TeamMessage } from '@/sync/teamMessageTypes';
import { getSessionsForTask } from '@/-zen/model/taskSessionLink';
import { syncKanbanStatusToTodo } from '@/-zen/model/ops';
import { getCurrentAuth } from '@/auth/AuthContext';
import { useAuth } from '@/auth/AuthContext';
import { taskNeedsApproval } from '@/utils/taskHelpers';
import { EvolutionSection } from '@/components/settings/EvolutionSection';
import { getThreeColumnShellTokens } from '@/components/layout/ThreeColumnShell';
import { SidebarView } from '@/components/layout/SidebarView';
import { buildTeamReturnPath, getSingleRouteParam } from '@/utils/returnNavigation';
import { randomUUID } from '@/utils/uuid';
import { t } from '@/text';
import { getActiveTaskForSession } from '@/utils/teamActiveTask';
import { compareTeamRosterEntries } from '@/utils/teamRoster';
import { resolveStickyKanbanBoard } from '@/utils/teamBoardState';
import { getServerUrl } from '@/sync/serverConfig';
import { fetchBypassAgents, type BypassAgent } from '@/sync/apiEvolution';
import { stylesheet } from './teamStyles';
import {
    STANDARD_SHELL_TABS,
    SHELL_CONVERSATION_COLORS,
    formatShellTime,
    getMessagePreview,
    splitPromptLines,
} from '@/utils/teamUtils';
import { KanbanBoardPanel } from '@/components/team/KanbanBoardPanel';
import { useTeamReviews } from '@/hooks/useTeamReviews';
import { useTeamLifecyclePersist } from '@/hooks/useTeamLifecyclePersist';
import { useTaskChatBridge } from '@/hooks/useTaskChatBridge';
import { useArtifactAutoInit } from '@/hooks/useArtifactAutoInit';
import { TeamInfoSection } from '@/components/team/TeamInfoSection';
import { WorkspaceSidebar } from '@/components/team/WorkspaceSidebar';
import { BoardFallbackView } from '@/components/team/BoardFallbackView';
import { MobileTeamMenu } from '@/components/team/MobileTeamMenu';
import { getAgentPresenceVisual } from '@/utils/sessionUtils';

type TeamStandardTab = 'chat' | 'board' | 'info' | 'evolution';

function isTeamStandardTab(value: string | undefined | null): value is TeamStandardTab {
    return !!value && ['chat', 'board', 'info', 'evolution'].includes(value);
}

function buildTeamMemberSessionTag(teamId: string, memberId: string): string {
    return `team:${teamId}:member:${memberId}`;
}

export default function TeamDashboardScreen() {
    const { id, roomId: roomIdParam, tab } = useLocalSearchParams();
    const teamId = id as string;
    const router = useRouter();
    const { theme } = useUnistyles();
    const { width, height } = useWindowDimensions();
    const styles = stylesheet;
    const artifact = useArtifact(teamId);
    const allTeams = useArtifacts().filter(a => a.type === 'team');
    // Stable subscription: only re-renders when session roster changes (add/remove),
    // NOT on every agent message. Root cause fix for UI-wide flicker with 10+ agents.
    const _sessionIds = storage(useShallow((s) =>
        s.isDataReady
            ? Object.values(s.sessions).sort((a, b) => a.createdAt - b.createdAt).map(s => s.id)
            : []
    ));
    const allSessions = React.useMemo(() => {
        const sessions = storage.getState().sessions;
        return _sessionIds.map(id => sessions[id]).filter((s): s is NonNullable<typeof s> => s != null);
    }, [_sessionIds]);
    const hasLocalTeamSessions = React.useMemo(() => {
        return allSessions.some((session) =>
            session.metadata?.teamId === teamId
            || session.metadata?.sessionTag?.startsWith(`team:${teamId}:`)
        );
    }, [allSessions, teamId]);
    const allMachines = useAllMachines();
    const profile = useProfile();
    const { isAuthenticated } = useAuth();
    const isDataReady = useIsDataReady();
    const isDesktopShell = Platform.OS === 'web' && width >= 1180;
    const shellVariant = 'default' as const;
    const shellTheme = getThreeColumnShellTokens(shellVariant, theme);
    const tabParam = getSingleRouteParam(tab);
    const initialTab: TeamStandardTab = isTeamStandardTab(tabParam) ? tabParam : 'chat';
    const [activeTab, setActiveTab] = React.useState<TeamStandardTab>(initialTab);
    const [isLoading, setIsLoading] = React.useState(false);
    const [selectedTaskId, setSelectedTaskId] = React.useState<string | null>(null);
    const [showTaskDetail, setShowTaskDetail] = React.useState(false);
    const [showNewTaskModal, setShowNewTaskModal] = React.useState(false);
    const [newTaskStatus, setNewTaskStatus] = React.useState('todo');
    const [showApprovalModal, setShowApprovalModal] = React.useState(false); // 🆕
    const [teamMessages, setTeamMessages] = React.useState<TeamMessage[]>([]);
    const [showMenu, setShowMenu] = React.useState(false);
    const [showAgentsPopover, setShowAgentsPopover] = React.useState(false);
    const [showAgentLibrary, setShowAgentLibrary] = React.useState(false);
    const [showWorkspaceDrawer, setShowWorkspaceDrawer] = React.useState(false);
    const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
    const [selectedConversationId, setSelectedConversationId] = React.useState<string | null>(null);
    const [isRecoveringTeam, setIsRecoveringTeam] = React.useState(false);
    const socketStatus = useSocketStatus();
    const [bypassAgents, setBypassAgents] = React.useState<BypassAgent[]>([]);
    const lastKnownKanbanBoardRef = React.useRef<KanbanBoard | null>(null);
    const unavailableTeamMissesRef = React.useRef(0);
    const unavailableTeamRedirectedRef = React.useRef(false);

    const { bridge: desktopBridge, collaborationState } = useDesktopBridge();
    const parsedArtifactBoard = React.useMemo<{
        board: KanbanBoard | null;
        parseError: Error | null;
    }>(() => {
        if (!artifact?.body) {
            return { board: null, parseError: null };
        }

        try {
            return {
                board: JSON.parse(artifact.body) as KanbanBoard,
                parseError: null,
            };
        } catch (error) {
            return {
                board: null,
                parseError: error instanceof Error ? error : new Error('Failed to parse team artifact body'),
            };
        }
    }, [artifact?.body]);

    const { teamScorecard, teamPublicReviews, teamReviewLoading } = useTeamReviews(teamId, isAuthenticated);
    useTeamLifecyclePersist(artifact, parsedArtifactBoard.board, teamMessages, allSessions);

    React.useEffect(() => {
        let cancelled = false;

        const loadBypassAgents = async () => {
            const auth = getCurrentAuth();
            if (!auth?.credentials || !teamId) {
                if (!cancelled) {
                    setBypassAgents([]);
                }
                return;
            }

            try {
                const result = await fetchBypassAgents(auth.credentials, teamId);
                if (!cancelled) {
                    setBypassAgents(result.agents || []);
                }
            } catch {
                if (!cancelled) {
                    setBypassAgents([]);
                }
            }
        };

        void loadBypassAgents();
        return () => {
            cancelled = true;
        };
    }, [teamId, isAuthenticated]);

    const artifactRoomId = React.useMemo(() => {
        return parsedArtifactBoard.board?.roomId;
    }, [parsedArtifactBoard.board]);
    const roomId = (roomIdParam as string) || artifactRoomId || undefined;
    const teamReturnTo = React.useMemo(() => {
        return buildTeamReturnPath({
            teamId,
            mode: 'standard',
            tab: activeTab,
            roomId,
        });
    }, [activeTab, roomId, teamId]);
    const desktopRoom = React.useMemo(() => {
        if (!roomId || !collaborationState) return null;
        return collaborationState.rooms.find((room: any) => room.id === roomId) ?? null;
    }, [collaborationState, roomId]);
    const desktopBoard = React.useMemo<KanbanBoard | null>(() => {
        if (!roomId || !collaborationState) return null;
        return collaborationState.boards.find((entry: any) => entry.roomId === roomId)?.board ?? null;
    }, [collaborationState, roomId]);

    // Get user's display name for chat
    const myDisplayName = React.useMemo(() => {
        const displayName = getDisplayName(profile);
        return displayName || sync.anonID || 'Workspace'; // Fallback for unauthenticated/empty profile states
    }, [profile]);
    const humanActorSessionId = React.useMemo(() => sync.anonID || `user:${teamId}`, [teamId]);
    const humanActor = React.useMemo(() => ({
        sessionId: humanActorSessionId,
        role: 'user' as const,
        displayName: myDisplayName || '用户',
    }), [humanActorSessionId, myDisplayName]);
    const buildHumanStatusLock = React.useCallback((mode: HumanStatusLock['mode'], reason?: string): HumanStatusLock => ({
        mode,
        lockedAt: Date.now(),
        lockedBySessionId: humanActor.sessionId,
        lockedByRole: humanActor.role,
        lockedByDisplayName: humanActor.displayName,
        ...(reason ? { reason } : {}),
    }), [humanActor]);
    const buildManualStatusLockComment = React.useCallback((task: KanbanTask, nextStatus: string, reason?: string): TaskComment => ({
        id: randomUUID(),
        authorSessionId: humanActor.sessionId,
        authorRole: humanActor.role,
        authorDisplayName: humanActor.displayName,
        type: 'human-override',
        content: reason || `${humanActor.displayName} manually changed status from ${task.status} to ${nextStatus}. Agent status changes are now locked until the human clears the lock.`,
        createdAt: Date.now(),
        fromStatus: task.status,
        toStatus: nextStatus,
    }), [humanActor]);
    const callTaskHumanStatusLockApi = React.useCallback(async (
        taskId: string,
        pathSuffix: '' | '/clear',
        body: Record<string, unknown>,
    ) => {
        if (desktopBridge || !teamId) {
            return;
        }
        const credentials = sync.getCredentials();
        if (!credentials?.token) {
            return;
        }

        const response = await fetch(
            `${getServerUrl()}/v1/teams/${encodeURIComponent(teamId)}/tasks/${encodeURIComponent(taskId)}/human-lock${pathSuffix}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${credentials.token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            },
        );

        if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const message = typeof payload?.error === 'string'
                ? payload.error
                : `HTTP ${response.status}`;
            throw new Error(message);
        }
    }, [desktopBridge, teamId]);
    const setRemoteHumanTaskLock = React.useCallback(async (
        taskId: string,
        mode: HumanStatusLock['mode'],
        reason?: string,
        comment?: string,
    ) => {
        await callTaskHumanStatusLockApi(taskId, '', {
            ...humanActor,
            kind: 'human',
            mode,
            ...(reason ? { reason } : {}),
            ...(comment ? { comment } : {}),
        });
    }, [callTaskHumanStatusLockApi, humanActor]);
    const clearRemoteHumanTaskLock = React.useCallback(async (
        taskId: string,
        mode?: HumanStatusLock['mode'],
        comment?: string,
    ) => {
        await callTaskHumanStatusLockApi(taskId, '/clear', {
            ...humanActor,
            kind: 'human',
            ...(mode ? { mode } : {}),
            ...(comment ? { comment } : {}),
        });
    }, [callTaskHumanStatusLockApi, humanActor]);

    React.useEffect(() => {
        if (teamId) {
            trackTeamViewed(teamId);
        }
    }, [teamId]);

    const selectTab = React.useCallback((nextTab: TeamStandardTab) => {
        setActiveTab(nextTab);
        router.replace({
            pathname: '/teams/[id]',
            params: {
                id: teamId,
                ...(roomId ? { roomId } : {}),
                tab: nextTab,
            },
        } as any);
    }, [roomId, router, teamId]);

    const { autoInitAttempted, redirectUnavailableTeam } = useArtifactAutoInit({
        teamId,
        artifact,
        isAuthenticated,
        desktopBridge,
        hasLocalTeamSessions,
        isDataReady,
        isLoading,
        setIsLoading,
        router: router as any,
    });

    // Helper to get session IDs from artifact body
    const getSessionIds = React.useCallback((): string[] => {
        if (!artifact?.body) return [];
        if (parsedArtifactBoard.parseError || !parsedArtifactBoard.board) {
            throw parsedArtifactBoard.parseError || new Error('Team artifact body is unavailable');
        }

        const members = parsedArtifactBoard.board.team?.members || [];
        return members.map((m: any) => m.sessionId).filter(Boolean);
    }, [artifact?.body, parsedArtifactBoard.board, parsedArtifactBoard.parseError]);

    // Archive Team handler
    const handleArchiveTeam = React.useCallback(async () => {
        setShowMenu(false);
        const confirmed = await Modal.confirm(
            t('teams.archiveTeam'),
            t('teams.archiveTeamConfirm'),
            {
                confirmText: t('teams.archiveAction'),
                cancelText: t('common.cancel'),
                destructive: false
            }
        );

        if (!confirmed) return;

        try {
            const sessionIds = getSessionIds();
            const result = await sync.archiveTeam(teamId, sessionIds);
            if (result.success) {
                Modal.alert(t('common.success'), t('teams.archiveTeamSuccess', { archivedSessions: result.archivedSessions }));
                router.replace('/teams');
            }
        } catch (error) {
            console.error('Failed to archive team:', error);
            Modal.alert(t('common.error'), t('teams.archiveTeamFailed'));
        }
    }, [teamId, router, getSessionIds]);

    // Delete Team handler
    const handleDeleteTeam = React.useCallback(async () => {
        setShowMenu(false);
        const confirmed = await Modal.confirm(
            'Delete Team',
            'This will permanently delete the team and all its associated sessions. This action cannot be undone. Are you sure?',
            {
                confirmText: 'Delete',
                cancelText: 'Cancel',
                destructive: true
            }
        );

        if (!confirmed) return;

        try {
            const sessionIds = getSessionIds();
            const result = await sync.deleteTeam(teamId, sessionIds);
            if (result.success) {
                Modal.alert(t('common.success'), t('teams.deleteTeamSuccess', { deletedSessions: result.deletedSessions }));
                router.replace('/teams');
            }
        } catch (error) {
            console.error('Failed to delete team:', error);
            Modal.alert(t('common.error'), t('teams.deleteTeamFailed'));
        }
    }, [teamId, router, getSessionIds]);

    // Rename Team handler
    const handleRenameTeam = React.useCallback(async () => {
        setShowMenu(false);
        const newName = await Modal.prompt(
            t('teams.renameTeam'),
            t('teams.renameTeamPrompt'),
            {
                defaultValue: artifact?.title || '',
                placeholder: 'Team name',
                confirmText: t('teams.renameAction'),
                cancelText: t('common.cancel')
            }
        );

        if (!newName || newName.trim() === artifact?.title) return;

        try {
            // Call server API to update body.name
            const result = await sync.renameTeam(teamId, newName.trim());
            if (result.success && artifact) {
                // Also update the artifact header title for list display
                // Server only updates body.name, we need to update header.title
                await sync.updateArtifact(
                    teamId,
                    newName.trim(),
                    artifact.body || null,
                    artifact.sessions,
                    artifact.draft,
                    artifact.type
                );
            }
        } catch (error) {
            console.error('Failed to rename team:', error);
            Modal.alert(t('common.error'), t('teams.renameTeamFailed'));
        }
    }, [teamId, artifact]);

    // Initialize missing Team Artifact (P0 fix for teams created without artifact)
    const handleInitializeArtifact = React.useCallback(async () => {
        const confirmed = await Modal.confirm(
            'Initialize Team Board',
            'This team is missing its Kanban board data. Would you like to initialize it now?',
            {
                confirmText: 'Initialize',
                cancelText: 'Cancel',
                destructive: false
            }
        );

        if (!confirmed) return;

        setIsLoading(true);
        try {
            // Create initial board data
            const initialBoard: KanbanBoard = {
                ...DEFAULT_KANBAN_BOARD,
                tasks: [],
                team: {
                    roles: DEFAULT_TEAM_ROLES,
                    agreements: DEFAULT_TEAM_AGREEMENTS,
                    members: []
                }
            };

            // Create artifact with the existing teamId
            await sync.createArtifact(
                'Team',  // Default title
                JSON.stringify(initialBoard, null, 2),
                [],  // No sessions initially
                false,  // Not a draft
                'team',  // Type
                teamId  // Use existing teamId as artifact ID
            );

            Modal.alert('Success', 'Team board initialized successfully!');

            // Refresh the artifact
            await sync.fetchArtifactWithBody(teamId);
        } catch (error) {
            console.error('Failed to initialize team artifact:', error);
            const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
            if (message.includes('already exists') || message.includes('failed to create artifact: 409')) {
                redirectUnavailableTeam();
                return;
            }
            Modal.alert('Error', 'Failed to initialize team board. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [redirectUnavailableTeam, teamId]);

    const kanbanData: KanbanBoard = React.useMemo(() => {
        const board = resolveStickyKanbanBoard({
            desktopBridge: !!desktopBridge,
            desktopBoard,
            artifactBody: artifact?.body,
            parsedBoard: parsedArtifactBoard.board,
            parseError: parsedArtifactBoard.parseError,
            lastKnownBoard: lastKnownKanbanBoardRef.current,
            defaultBoard: DEFAULT_KANBAN_BOARD,
        });

        lastKnownKanbanBoardRef.current = board;
        return board;
    }, [artifact?.body, desktopBoard, desktopBridge, parsedArtifactBoard.board, parsedArtifactBoard.parseError]);

    const selectedTask = React.useMemo(() => {
        if (!selectedTaskId) {
            return null;
        }

        return kanbanData.tasks.find((task) => task.id === selectedTaskId) || null;
    }, [kanbanData.tasks, selectedTaskId]);

    React.useEffect(() => {
        if (!selectedTaskId) {
            return;
        }

        if (!selectedTask) {
            setSelectedTaskId(null);
            setShowTaskDetail(false);
        }
    }, [selectedTask, selectedTaskId]);

    const sessionLookup = React.useMemo(() => {
        const map = new Map<string, (typeof allSessions)[number]>();
        for (const session of allSessions) {
            map.set(session.id, session);
        }
        return map;
    }, [allSessions]);

    const handleRecoverTeam = React.useCallback(async () => {
        setShowMenu(false);

        const teamMembers = kanbanData.team?.members ?? [];
        const recoverCandidates = teamMembers.filter((member) => {
            if (member.executionPlane === 'bypass') {
                return false;
            }
            return member.roleId !== 'supervisor' && member.roleId !== 'help-agent';
        });

        if (recoverCandidates.length === 0) {
            Modal.alert(t('teams.nothingToRecover'), t('teams.nothingToRecoverBody'));
            return;
        }

        const confirmed = await Modal.confirm(
            t('teams.recoverTeam'),
            t('teams.recoverTeamConfirm'),
            {
                confirmText: t('teams.recoverAction'),
                cancelText: t('common.cancel'),
                destructive: false,
            }
        );

        if (!confirmed) return;

        setIsRecoveringTeam(true);
        try {
            let recovered = 0;
            let skipped = 0;
            const issues: string[] = [];

            for (const member of recoverCandidates) {
                const label = member.displayName || member.roleId || member.sessionId.slice(0, 8);
                const session = sessionLookup.get(member.sessionId);
                const memberId = member.memberId || randomUUID();
                const sessionTag = member.sessionTag || buildTeamMemberSessionTag(teamId, memberId);
                const runtimeType = member.runtimeType === 'codex' ? 'codex' : 'claude';
                const sessionName = member.displayName || session?.metadata?.name || label;

                if (session?.active) {
                    if (!member.memberId || !member.sessionTag) {
                        await sync.addTeamMember(teamId, member.sessionId, member.roleId, sessionName, {
                            memberId,
                            sessionTag,
                            candidateId: member.candidateId,
                            specId: member.specId,
                            customPrompt: member.customPrompt,
                            parentSessionId: member.parentSessionId,
                            executionPlane: member.executionPlane,
                            runtimeType,
                        });
                    }
                    skipped += 1;
                    continue;
                }

                const machineId = session?.metadata?.machineId;
                const directory = session?.metadata?.path;
                if (!machineId) {
                    issues.push(`${label}: missing machine binding`);
                    continue;
                }
                if (!directory) {
                    issues.push(`${label}: missing working directory`);
                    continue;
                }

                const machine = allMachines.find((entry) => entry.id === machineId);
                if (!machine?.active) {
                    issues.push(`${label}: machine offline`);
                    continue;
                }

                try {
                    const recoveredSessionId = await sync.spawnSessionOnMachine(machineId, {
                        sessionId: member.sessionId,
                        sessionTag,
                        directory,
                        agent: runtimeType,
                        teamId,
                        role: member.roleId,
                        sessionName,
                        sessionPath: directory,
                        ...(member.specId ? { specId: member.specId } : {}),
                        ...(member.parentSessionId ? { parentSessionId: member.parentSessionId } : {}),
                        ...(member.executionPlane ? { executionPlane: member.executionPlane as 'mainline' | 'bypass' } : {}),
                        env: {
                            AHA_TEAM_MEMBER_ID: memberId,
                            ...(member.customPrompt ? { AHA_AGENT_PROMPT: member.customPrompt } : {}),
                        },
                    });

                    if (!recoveredSessionId) {
                        issues.push(`${label}: spawn failed`);
                        continue;
                    }

                    await sync.addTeamMember(teamId, recoveredSessionId, member.roleId, sessionName, {
                        memberId,
                        sessionTag,
                        candidateId: member.candidateId,
                        specId: member.specId,
                        customPrompt: member.customPrompt,
                        parentSessionId: member.parentSessionId,
                        executionPlane: member.executionPlane,
                        runtimeType,
                    });
                    trackAgentDeployed(recoveredSessionId, {
                        source: 'team_recovery',
                        team_id: teamId,
                        role_id: member.roleId,
                        runtime_type: runtimeType,
                        execution_plane: member.executionPlane ?? null,
                    });
                    recovered += 1;
                } catch (error) {
                    console.error(`Failed to recover team member ${label}:`, error);
                    issues.push(`${label}: ${error instanceof Error ? error.message : 'recover failed'}`);
                }
            }

            const lines = [
                recovered > 0
                    ? t('teams.recoveryResult', { count: recovered })
                    : t('teams.recoveryNoAgents'),
                skipped > 0
                    ? t('teams.recoverySkipped', { count: skipped })
                    : null,
                issues.length > 0
                    ? t('teams.recoveryIssues', {
                        issues: `${issues.slice(0, 4).join(' | ')}${issues.length > 4 ? ` | +${issues.length - 4} more` : ''}`,
                    })
                    : null,
            ].filter(Boolean);

            Modal.alert(recovered > 0 ? t('teams.recoveryStarted') : t('teams.recoveryIncomplete'), lines.join('\n'));
        } catch (error) {
            console.error('Failed to recover team:', error);
            Modal.alert(t('common.error'), t('teams.recoveryFailed'));
        } finally {
            setIsRecoveringTeam(false);
        }
    }, [allMachines, kanbanData.team?.members, sessionLookup, teamId]);

    const handleRenameSessionMember = React.useCallback(async (sessionId: string, currentName: string) => {
        const newName = await Modal.prompt(
            t('teams.renameAgent'),
            t('teams.renameAgentPrompt'),
            {
                defaultValue: currentName,
                placeholder: currentName,
                confirmText: t('common.rename'),
                cancelText: t('common.cancel'),
            }
        );
        if (!newName || newName.trim() === currentName) return;
        try {
            await sync.renameSession(sessionId, newName.trim());
        } catch (error) {
            console.error('Failed to rename session:', error);
            Modal.alert(t('common.error'), t('teams.renameAgentError'));
        }
    }, []);

    const handleRemoveTeamMember = React.useCallback(async (sessionId: string, displayName: string) => {
        const confirmed = await Modal.confirm(
            t('teams.removeMember'),
            t('teams.removeMemberConfirm', { name: displayName }),
            {
                confirmText: t('teams.removeMember'),
                cancelText: t('common.cancel'),
                destructive: true,
            }
        );
        if (!confirmed) return;
        try {
            await sync.removeTeamMember(teamId, sessionId);
        } catch (error) {
            console.error('Failed to remove team member:', error);
            Modal.alert(t('common.error'), t('teams.removeMemberError'));
        }
    }, [teamId]);

    const handleDeleteSessionMember = React.useCallback(async (sessionId: string, displayName: string) => {
        const session = sessionLookup.get(sessionId);
        const confirmed = await Modal.confirm(
            'Delete session',
            session?.active
                ? `Archive and permanently delete ${displayName}'s session? This also removes the agent from the team.`
                : `Permanently delete ${displayName}'s session and remove the agent from the team?`,
            {
                confirmText: 'Delete session',
                cancelText: t('common.cancel'),
                destructive: true,
            }
        );
        if (!confirmed) return;

        try {
            if (session?.active) {
                const archiveResult = await sync.batchArchiveSessions([sessionId]);
                const archivedSession = archiveResult.results.find((result) => result.sessionId === sessionId);
                if (archivedSession && !archivedSession.success) {
                    throw new Error(archivedSession.error || 'Failed to archive session before delete');
                }
            }

            const deleteResult = await sync.batchDeleteSessions([sessionId]);
            const deletedSession = deleteResult.results.find((result) => result.sessionId === sessionId);
            if (deletedSession && !deletedSession.success) {
                throw new Error(deletedSession.error || 'Failed to delete session');
            }

            try {
                await sync.removeTeamMember(teamId, sessionId);
            } catch (removeError) {
                console.error('Session deleted, but failed to remove team member:', removeError);
                Modal.alert(
                    t('common.error'),
                    'Session was deleted, but removing the stale team member entry failed. Refresh the team and try again.'
                );
            }
        } catch (error) {
            console.error('Failed to delete session member:', error);
            Modal.alert(t('common.error'), error instanceof Error ? error.message : 'Failed to delete session');
        }
    }, [sessionLookup, teamId]);

    const handleAgentLongPress = React.useCallback((sessionId: string, displayName: string) => {
        Modal.alert(
            displayName,
            undefined,
            [
                {
                    text: t('teams.renameAgent'),
                    onPress: () => handleRenameSessionMember(sessionId, displayName),
                },
                {
                    text: t('teams.removeMember'),
                    style: 'destructive',
                    onPress: () => handleRemoveTeamMember(sessionId, displayName),
                },
                {
                    text: 'Delete session',
                    style: 'destructive',
                    onPress: () => handleDeleteSessionMember(sessionId, displayName),
                },
                { text: t('common.cancel'), style: 'cancel' },
            ]
        );
    }, [handleDeleteSessionMember, handleRenameSessionMember, handleRemoveTeamMember]);

    const teamDisplayName = artifact?.title || desktopRoom?.name || 'Team';

    const handleOpenAgentLibrary = React.useCallback(() => {
        setShowAgentLibrary(true);
    }, []);

    const handleOpenAgentRosterSession = React.useCallback((sessionId: string) => {
        router.push(`/session/${sessionId}` as any);
    }, [router]);

    const handleTaskUpdate = React.useCallback(async (taskId: string, updates: Partial<KanbanTask>) => {
        if (desktopBridge && roomId) {
            await desktopBridge.updateTask(taskId, updates);
            return;
        }
        if (!artifact) {
            return;
        }

        const updatedTasks = kanbanData.tasks.map((task) =>
            task.id === taskId ? { ...task, ...updates, updatedAt: Date.now() } : task
        );

        const newData: KanbanBoard = {
            ...kanbanData,
            tasks: updatedTasks,
        };

        await sync.updateArtifact(
            artifact.id,
            artifact.title,
            JSON.stringify(newData, null, 2),
            artifact.sessions,
            artifact.draft,
            artifact.type
        );
    }, [artifact, desktopBridge, kanbanData, roomId]);

    React.useEffect(() => {
        if (!showTaskDetail || !selectedTask?.id || selectedTask.humanStatusLock?.mode === 'manual-status') {
            return;
        }

        let cancelled = false;
        setRemoteHumanTaskLock(selectedTask.id, 'viewing', `${humanActor.displayName} is viewing this task in Kanban`).catch((error) => {
            if (!cancelled) {
                console.warn('Failed to set remote human viewing lock:', error);
            }
        });

        return () => {
            cancelled = true;
            clearRemoteHumanTaskLock(selectedTask.id, 'viewing').catch((error) => {
                console.warn('Failed to clear remote human viewing lock:', error);
            });
        };
    }, [clearRemoteHumanTaskLock, humanActor.displayName, selectedTask?.humanStatusLock?.mode, selectedTask?.id, setRemoteHumanTaskLock, showTaskDetail]);

    const handleTeamMessageSend = React.useCallback(async (message: TeamMessage) => {
        await sync.sendTeamMessage({
            teamId,
            id: message.id,
            content: message.content,
            type: message.type,
            mentions: message.mentions,
            metadata: message.metadata,
            fromSessionId: message.fromSessionId,
            fromRole: message.fromRole,
            fromDisplayName: message.fromDisplayName,
        });

        setTeamMessages((previous) => {
            if (previous.some((entry) => entry.id === message.id)) {
                return previous;
            }
            return [...previous, message];
        });
    }, [teamId]);

    const handleTaskCreate = React.useCallback(async (taskData: Partial<KanbanTask>) => {
        if (desktopBridge && roomId) {
            const createdTask = await desktopBridge.createTask({
                roomId,
                title: taskData.title || 'Untitled Task',
                description: taskData.description,
                status: taskData.status || 'todo',
                assigneeId: taskData.assigneeId,
                metadata: {
                    priority: taskData.priority,
                    dueDate: taskData.dueDate,
                    tags: taskData.tags,
                    source: taskData.source || 'user',
                    approvalStatus: taskData.approvalStatus || 'approved',
                }
            });

            const nextTask = {
                id: createdTask.id,
                title: createdTask.title,
                description: createdTask.description,
                status: createdTask.status,
                assigneeId: createdTask.assigneeId,
                createdAt: createdTask.createdAt,
                updatedAt: createdTask.updatedAt,
                priority: (createdTask.metadata?.priority as KanbanTask['priority']) || taskData.priority,
                dueDate: (createdTask.metadata?.dueDate as number | undefined) || taskData.dueDate,
                tags: (createdTask.metadata?.tags as string[] | undefined) || taskData.tags,
                source: (createdTask.metadata?.source as KanbanTask['source']) || (taskData.source as KanbanTask['source']) || 'user',
                approvalStatus: (createdTask.metadata?.approvalStatus as KanbanTask['approvalStatus']) || taskData.approvalStatus || 'approved',
            } as KanbanTask;

            trackTaskCreated(teamId, {
                task_id: nextTask.id,
                source: nextTask.source ?? null,
                status: nextTask.status,
                priority: nextTask.priority ?? null,
                assignee_id: nextTask.assigneeId ?? null,
                approval_status: nextTask.approvalStatus ?? null,
                created_via: 'desktop_bridge',
            });

            return nextTask;
        }

        if (!artifact) {
            throw new Error('No artifact available for task creation.');
        }

        const newTask: KanbanTask = {
            id: Math.random().toString(36).substring(2, 11),
            ...taskData,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        } as KanbanTask;

        const newData: KanbanBoard = {
            ...kanbanData,
            tasks: [...kanbanData.tasks, newTask],
        };

        await sync.updateArtifact(
            artifact.id,
            artifact.title,
            JSON.stringify(newData, null, 2),
            artifact.sessions,
            artifact.draft,
            artifact.type
        );

        trackTaskCreated(teamId, {
            task_id: newTask.id,
            source: newTask.source ?? null,
            status: newTask.status,
            priority: newTask.priority ?? null,
            assignee_id: newTask.assigneeId ?? null,
            approval_status: newTask.approvalStatus ?? null,
            created_via: 'artifact_update',
        });

        return newTask;
    }, [artifact, desktopBridge, kanbanData, roomId, teamId]);

    // 🆕 Chat-Board 双向同步 Hook
    const taskChatSync = useTaskChatSync({
        teamId,
        tasks: kanbanData.tasks,
        messages: teamMessages,
        onTaskUpdate: handleTaskUpdate,
        onMessageSend: handleTeamMessageSend,
        onTaskCreate: handleTaskCreate,
    });
    const {
        updateTaskWithSync,
        createTaskWithSync,
    } = taskChatSync;

    // 🆕 自动缓存任务快照 — 团队解散后可从缓存恢复未完成任务
    useTaskExportAutoCache({
        teamId,
        teamName: artifact?.title || desktopRoom?.name || 'Team',
        tasks: kanbanData.tasks,
        columns: kanbanData.columns,
    });

    const normalizeStatus = React.useCallback((status: string): string => {
        const statusMap: Record<string, string> = {
            'in_progress': 'in-progress',
            'inprogress': 'in-progress',
            'InProgress': 'in-progress',
            'IN_PROGRESS': 'in-progress',
            'todo': 'todo',
            'review': 'review',
            'blocked': 'blocked',
            'done': 'done'
        };
        return statusMap[status] || (status ? status.toLowerCase() : 'todo');
    }, []);

    const handleAddTask = React.useCallback((status: string) => {
        setNewTaskStatus(status);
        setShowNewTaskModal(true);
    }, []);

    const handleTaskDetailClose = React.useCallback(() => {
        setShowTaskDetail(false);
        setSelectedTaskId(null);
    }, []);

    const handleDeleteTask = React.useCallback(async (taskId: string) => {
        const task = kanbanData.tasks.find((entry) => entry.id === taskId);
        if (!task) {
            return;
        }

        const confirmed = await Modal.confirm(
            'Delete Task',
            `Delete "${task.title}"?`,
            { confirmText: 'Delete', destructive: true }
        );

        if (!confirmed) {
            return;
        }

        if (desktopBridge) {
            await desktopBridge.removeTask(taskId);
        } else if (artifact) {
            const newData: KanbanBoard = {
                ...kanbanData,
                tasks: kanbanData.tasks.filter((entry) => entry.id !== taskId)
            };

            await sync.updateArtifact(
                artifact.id,
                artifact.title,
                JSON.stringify(newData, null, 2),
                artifact.sessions,
                artifact.draft,
                artifact.type
            );
        }

        const message = {
            id: randomUUID(),
            teamId,
            fromDisplayName: myDisplayName || '用户',
            content: `${myDisplayName || '用户'} 删除了任务：**${task.title}**`,
            type: 'notification' as const,
            timestamp: Date.now(),
            metadata: {
                taskId,
                _action: 'deleted',
            },
            shortContent: `任务已删除: ${task.title}`,
        };

        await sync.sendTeamMessage(message);
        setTeamMessages((previous) => [...previous, message]);
        handleTaskDetailClose();
    }, [artifact, desktopBridge, handleTaskDetailClose, kanbanData, myDisplayName, teamId]);

    const handleMoveTask = React.useCallback(async (task: KanbanTask) => {
        const normalized = normalizeStatus(task.status);
        const nextStatus = {
            'todo': 'in-progress',
            'in-progress': 'review',
            'review': 'done',
            'blocked': 'in-progress',
            'done': 'todo'
        }[normalized] || 'todo';

        // 🆕 使用 Chat-Board 同步功能：自动发送通知到聊天
        try {
            const humanLockReason = `${myDisplayName || '用户'} manually changed status to ${nextStatus}.`;
            await updateTaskWithSync(
                task.id,
                {
                    status: nextStatus,
                    humanStatusLock: buildHumanStatusLock('manual-status', humanLockReason),
                    comments: [
                        ...(task.comments || []),
                        buildManualStatusLockComment(task, nextStatus, humanLockReason),
                    ],
                },
                myDisplayName || '用户'
            );

            trackTaskMoved(task.id, teamId, normalized, nextStatus, {
                source: 'board_quick_move',
            });
            if (nextStatus === 'done') {
                trackTaskCompleted(task.id, teamId, {
                    source: 'board_quick_move',
                });
            }

            // 🆕 Phase 2: 同步状态到 Todo（如果有链接）
            if (task.todoId) {
                const auth = getCurrentAuth();
                if (auth?.credentials) {
                    syncKanbanStatusToTodo(auth.credentials, task.id, nextStatus).catch(err => {
                        console.error('Failed to sync Kanban status to Todo:', err);
                    });
                }
            }
        } catch (error) {
            console.error('Failed to sync task update:', error);
            // 即使同步失败，任务状态更新仍然会进行（在 updateTaskWithSync 中）
        }
    }, [buildHumanStatusLock, buildManualStatusLockComment, myDisplayName, normalizeStatus, teamId, updateTaskWithSync]);

    const roleDefinitions = kanbanData.team?.roles?.length ? kanbanData.team.roles : DEFAULT_TEAM_ROLES;
    const agreements = kanbanData.team?.agreements ?? DEFAULT_TEAM_AGREEMENTS;
    const teamBootDescription = kanbanData.team?.bootContext?.teamDescription?.trim() ?? '';
    const teamBootObjective = kanbanData.team?.bootContext?.initialObjective?.trim() ?? '';
    const teamPromptLines = React.useMemo(() => splitPromptLines(teamBootDescription), [teamBootDescription]);
    const teamPromptTitle = teamPromptLines[0] ?? '';
    const teamPromptBody = teamPromptLines.slice(teamPromptTitle ? 1 : 0);

    const roster = React.useMemo(() => {
        const members = kanbanData.team?.members ?? [];
        const assignedIds = new Set(members.map(m => m.sessionId));

        const memberMap = new Map(members.map(m => [m.sessionId, m]));
        // Only show actual team members from artifact.sessions and team.members
        // Don't auto-add the viewing user - they should be added explicitly via the API
        const allSessionIds = Array.from(new Set([
            ...(artifact?.sessions ?? []),
            ...assignedIds
        ]));

        const entries = allSessionIds.map((sessionId, index) => {
            const session = sessionLookup.get(sessionId);
            const existingMember = memberMap.get(sessionId);

            // Create member with proper displayName for mentions functionality
            const member = existingMember || {
                sessionId,
                roleId: '',
                displayName: session?.metadata?.name || session?.metadata?.host || sessionId,
                focusAreas: []
            };

            // Ensure displayName is set for mentions functionality
            if (!member.displayName) {
                member.displayName = session?.metadata?.name || session?.metadata?.host || sessionId;
            }
            const effectiveRoleId = member.roleId || session?.metadata?.role;

            const role = roleDefinitions.find((entry) =>
                entry.id === effectiveRoleId ||
                entry.title.toLowerCase() === effectiveRoleId?.toLowerCase()
            );

            // Find tasks assigned to this member
            const tasks = kanbanData.tasks.filter(t => t.assigneeId === sessionId);
            const activeTask = getActiveTaskForSession(kanbanData.tasks, sessionId);

            return { member, session, role, index, tasks, activeTask };
        });

        return entries.sort((a, b) => compareTeamRosterEntries(
            { member: a.member, session: a.session, fallbackIndex: a.index },
            { member: b.member, session: b.session, fallbackIndex: b.index }
        ));
    }, [kanbanData.team?.members, artifact?.sessions, sessionLookup, roleDefinitions, kanbanData.tasks]);

    const systemRoster = React.useMemo(() => {
        const rosterSystemEntries = roster.filter((entry) => {
            const roleId = entry.member.roleId || entry.session?.metadata?.role || '';
            return roleId === 'supervisor' || roleId === 'help-agent';
        });
        const existingIds = new Set(rosterSystemEntries.map((entry) => entry.member.sessionId));
        const bypassEntries = bypassAgents
            .filter((agent) => (agent.roleId === 'supervisor' || agent.roleId === 'help-agent') && !existingIds.has(agent.agentId))
            .map((agent) => ({
                member: {
                    sessionId: agent.agentId,
                    roleId: agent.roleId,
                    displayName: agent.roleId === 'supervisor' ? 'Supervisor' : 'Help Agent',
                    executionPlane: 'bypass',
                    runtimeType: 'claude',
                },
                session: undefined,
                role: undefined,
            }));

        return [...rosterSystemEntries, ...bypassEntries];
    }, [roster, bypassAgents]);

    /** Sessions map for AgentRoster — maps sessionId → { active, activeAt } */
    const agentRosterSessions = React.useMemo(() => {
        const map = new Map<string, { active: boolean; activeAt: number }>();
        for (const entry of roster) {
            if (entry.session) {
                map.set(entry.member.sessionId, entry.session);
            }
        }
        return map;
    }, [roster]);

    const { handleDiscussTask, chatComposerPrefill } = useTaskChatBridge(
        roster,
        handleTaskDetailClose,
        selectTab,
    );

    const timelineEvents = React.useMemo(() => {
        return [...kanbanData.tasks]
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(task => {
                const assignee = roster.find(r => r.member.sessionId === task.assigneeId);
                return { task, assignee };
            });
    }, [kanbanData.tasks, roster]);

    // 🆕 Filter out pending tasks (only show approved tasks on board)
    const approvedTasks = React.useMemo(() => {
        return kanbanData.tasks.filter(task => !taskNeedsApproval(task));
    }, [kanbanData.tasks]);

    // 🆕 Pending tasks for approval UI
    const pendingTasks = React.useMemo(() => {
        return kanbanData.tasks.filter(task => taskNeedsApproval(task));
    }, [kanbanData.tasks]);

    const onlineCount = React.useMemo(() => {
        return roster.filter((entry) => entry.session?.active).length;
    }, [roster]);

    const statusSummary = React.useMemo(() => {
        const reviewCount = approvedTasks.filter((task) => normalizeStatus(task.status) === 'review').length;
        const workingCount = approvedTasks.filter((task) => {
            const status = normalizeStatus(task.status);
            return status === 'todo' || status === 'in-progress' || status === 'blocked';
        }).length;

        return {
            decision: pendingTasks.length || 0,
            working: workingCount || 0,
            review: reviewCount || 0,
        };
    }, [approvedTasks, normalizeStatus, pendingTasks.length]);

    const recentConversations = React.useMemo(() => {
        const deduped = new Set<string>();
        const rows: {
            id: string;
            name: string;
            lastMessage: string;
            time: string;
            avatarColor: string;
            avatarLabel: string;
            unreadCount?: number;
        }[] = [];

        [...teamMessages]
            .sort((a, b) => b.timestamp - a.timestamp)
            .forEach((message) => {
                if (message.type === 'system') {
                    return;
                }

                const key = message.fromSessionId || message.fromDisplayName || message.id;
                if (deduped.has(key) || rows.length >= 4) {
                    return;
                }

                deduped.add(key);

                const name = message.fromDisplayName || message.fromRole || 'Teammate';
                rows.push({
                    id: key,
                    name,
                    lastMessage: getMessagePreview(message),
                    time: formatShellTime(message.timestamp),
                    avatarColor: SHELL_CONVERSATION_COLORS[rows.length % SHELL_CONVERSATION_COLORS.length],
                    avatarLabel: name.slice(0, 1).toUpperCase(),
                    unreadCount: message.type === 'notification' ? 1 : undefined,
                });
            });

        if (rows.length === 0) {
            rows.push({
                id: `team-${teamId}`,
                name: artifact?.title || desktopRoom?.name || 'Team',
                lastMessage: 'Open the team room and start coordinating work.',
                time: '',
                avatarColor: SHELL_CONVERSATION_COLORS[0],
                avatarLabel: (artifact?.title || desktopRoom?.name || 'T').slice(0, 1).toUpperCase(),
            });
        }

        return rows;
    }, [artifact?.title, desktopRoom?.name, teamId, teamMessages]);

    React.useEffect(() => {
        if (!selectedAgentId && roster.length > 0) {
            setSelectedAgentId(roster[0].member.sessionId);
        }
    }, [roster, selectedAgentId]);

    React.useEffect(() => {
        if (!selectedConversationId && recentConversations.length > 0) {
            setSelectedConversationId(recentConversations[0].id);
        }
    }, [recentConversations, selectedConversationId]);

    // Derive the current user's role title from the roster for the sidebar header
    const myRoleTitle = React.useMemo(() => {
        const myEntry = roster.find(r => {
            const role = r.session?.metadata?.role;
            return !role || role === 'user';
        });
        return myEntry?.role?.title || 'Team Member';
    }, [roster]);

    const matchesColumn = React.useCallback((task: KanbanTask, columnId: string) => {
        return normalizeStatus(task.status) === columnId;
    }, [normalizeStatus]);

    const handleOpenTaskDetail = React.useCallback((task: KanbanTask) => {
        setSelectedTaskId(task.id);
        setShowTaskDetail(true);
    }, []);

    const handleBoardSignalPress = React.useCallback((signal: 'running' | 'deciding' | 'blocked') => {
        if (signal === 'deciding') {
            setShowApprovalModal(true);
        }
    }, []);

    // 🆕 计算每个任务的linked sessions
    const taskSessionLinks = React.useMemo(() => {
        const links = new Map<string, { sessionId: string; title: string; linkedAt: number }[]>();

        kanbanData.tasks.forEach(task => {
            const sessions = getSessionsForTask(task.id);
            links.set(task.id, sessions);
        });

        return links;
    }, [kanbanData.tasks]);

    const isMissingDesktopRoom = !!desktopBridge && !desktopRoom;
    const isMissingDesktopBoard = !!desktopBridge && !!desktopRoom && !desktopBoard;
    const isMissingArtifact = !desktopBridge && !artifact;
    const isArtifactParseError = !desktopBridge && !!artifact?.body && !!parsedArtifactBoard.parseError;
    const isAuthMissing = !desktopBridge && !isAuthenticated;
    const shouldShowBoardFallback = isAuthMissing || isMissingDesktopRoom || isMissingDesktopBoard || isMissingArtifact || isArtifactParseError;
    const isOrgManagerInitializing = !desktopBridge
        && isLoading
        && autoInitAttempted
        && !hasLocalTeamSessions
        && !artifact?.body;
    const boardFallbackTitle = isAuthMissing
        ? 'Authentication Required'
        : isArtifactParseError
        ? 'Team Board Failed to Load'
        : isMissingDesktopRoom
            ? 'Team Room Not Found'
            : 'Team Board Not Found';
    const boardFallbackDescription = isAuthMissing
        ? 'This browser session does not currently have valid credentials. Sign in or restore your account before opening team boards.'
        : isArtifactParseError
        ? 'This team exists, but its board data could not be parsed. Fix the stored board payload before continuing.'
        : isMissingDesktopRoom
            ? 'This team route opened without a valid collaboration room. Re-open the team from the teams list or recreate its desktop room binding.'
            : isMissingDesktopBoard
                ? 'This team room exists, but no board is attached to it yet.'
                : 'This team doesn\'t have a Kanban board yet. Initialize one to start tracking tasks.';

    // 🆕 批量导入来自缓存快照的任务 (由 ImportTaskButton 触发)
    const handleTasksImported = React.useCallback(async (tasks: KanbanTask[]) => {
        if (!artifact) return;
        const newData: KanbanBoard = {
            ...kanbanData,
            tasks: [...kanbanData.tasks, ...tasks],
        };
        await sync.updateArtifact(
            artifact.id,
            artifact.title,
            JSON.stringify(newData, null, 2),
            artifact.sessions,
            artifact.draft,
            artifact.type
        );
    }, [artifact, kanbanData]);

    const kanbanPanel = React.useMemo(() => (
        <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 }}>
                <ExportTaskButton
                    teamId={teamId}
                    teamName={artifact?.title || desktopRoom?.name || 'Team'}
                    tasks={kanbanData.tasks}
                    columns={kanbanData.columns}
                />
                <ImportTaskButton
                    teamId={teamId}
                    existingTasks={kanbanData.tasks}
                    targetColumns={kanbanData.columns}
                    onTasksImported={handleTasksImported}
                />
            </View>
            <KanbanBoardPanel
                styles={styles}
                theme={theme}
                tasks={kanbanData.tasks}
                approvedTasks={approvedTasks}
                columns={kanbanData.columns}
                taskSessionLinks={taskSessionLinks}
                sessionLookup={sessionLookup}
                matchesColumn={matchesColumn}
                onBoardSignalPress={handleBoardSignalPress}
                onOpenTask={handleOpenTaskDetail}
                onMoveTask={handleMoveTask}
                onAddTask={handleAddTask}
            />
        </View>
    ), [
        teamId,
        artifact?.title,
        desktopRoom?.name,
        styles,
        theme,
        kanbanData.tasks,
        approvedTasks,
        kanbanData.columns,
        taskSessionLinks,
        sessionLookup,
        matchesColumn,
        handleBoardSignalPress,
        handleOpenTaskDetail,
        handleMoveTask,
        handleAddTask,
        handleTasksImported,
    ]);

    const handleTaskDetailSave = React.useCallback(async (taskId: string, updates: Partial<KanbanTask>) => {
        const existingTask = kanbanData.tasks.find((entry) => entry.id === taskId);
        const nextUpdates: Partial<KanbanTask> = { ...updates };
        if (existingTask && typeof nextUpdates.status === 'string') {
            const previousStatus = normalizeStatus(existingTask.status);
            const nextStatus = normalizeStatus(nextUpdates.status);
            if (previousStatus !== nextStatus) {
                const humanLockReason = `${myDisplayName || '用户'} manually changed status to ${nextStatus}.`;
                nextUpdates.humanStatusLock = buildHumanStatusLock('manual-status', humanLockReason);
                nextUpdates.comments = [
                    ...((updates.comments as TaskComment[] | undefined) || existingTask.comments || []),
                    buildManualStatusLockComment(existingTask, nextStatus, humanLockReason),
                ];
            }
        }

        await updateTaskWithSync(taskId, nextUpdates, myDisplayName || '用户');

        if (existingTask && typeof nextUpdates.status === 'string') {
            const previousStatus = normalizeStatus(existingTask.status);
            const nextStatus = normalizeStatus(nextUpdates.status);
            if (previousStatus !== nextStatus) {
                trackTaskMoved(taskId, teamId, previousStatus, nextStatus, {
                    source: 'task_detail_modal',
                });
                if (nextStatus === 'done' && previousStatus !== 'done') {
                    trackTaskCompleted(taskId, teamId, {
                        source: 'task_detail_modal',
                    });
                }
            }
        }

        if (existingTask && typeof updates.approvalStatus === 'string' && updates.approvalStatus !== existingTask.approvalStatus) {
            if (updates.approvalStatus === 'approved' || updates.approvalStatus === 'rejected') {
                trackTaskApproval(taskId, updates.approvalStatus === 'approved', {
                    team_id: teamId,
                    source: 'task_detail_modal',
                    task_source: existingTask.source ?? null,
                });
            }
        }

        handleTaskDetailClose();
    }, [buildHumanStatusLock, buildManualStatusLockComment, handleTaskDetailClose, kanbanData.tasks, myDisplayName, normalizeStatus, teamId, updateTaskWithSync]);

    const handleTaskCommentAdd = React.useCallback(async (taskId: string, comment: TaskComment) => {
        const existingTask = kanbanData.tasks.find((entry) => entry.id === taskId);
        if (!existingTask) return;

        await handleTaskUpdate(taskId, {
            comments: [...(existingTask.comments || []), comment],
        });
    }, [handleTaskUpdate, kanbanData.tasks]);

    const handleNewTaskCreate = React.useCallback(async (taskInput: Partial<KanbanTask>) => {
        await createTaskWithSync(taskInput, myDisplayName || '用户');
    }, [createTaskWithSync, myDisplayName]);

    const renderChat = () => {
        // Try to find current user's session in roster
        // Look for a session that doesn't have an agent role (agents have roles like 'master', 'builder', etc.)
        const myMember = roster.find(r => {
            const session = r.session;
            if (!session) return false;
            const role = session.metadata?.role;
            // Sessions without a role or with 'user' role are likely user sessions
            return !role || role === 'user';
        });

        // CRITICAL: Use sync.anonID as fallback if not found in roster
        // This ensures the user can participate in chat even before they're formally added as a member
        const mySessionId = myMember?.member.sessionId || sync.anonID;

        return (
            <View style={{ flex: 1 }}>
                <TeamChatRoom
                    teamId={teamId}
                    teamName={artifact?.title || desktopRoom?.name || 'Team'}
                    mySessionId={mySessionId}
                    myRole="user"
                    myDisplayName={myDisplayName}
                    members={roster}
                    returnTo={teamReturnTo}
                    messages={teamMessages}
                    onMessagesChange={setTeamMessages}
                    taskChatSync={taskChatSync}
                    composerPrefill={chatComposerPrefill}
                    variant={isDesktopShell ? 'edzlf' : 'default'}
                    fallbackMachineId={allMachines.find(m => m.active)?.id}
                />
            </View>
        );
    };

    const workspaceSidebar = (
        <WorkspaceSidebar
            myDisplayName={myDisplayName}
            myRoleTitle={myRoleTitle}
            roster={roster}
            selectedAgentId={selectedAgentId}
            setSelectedAgentId={setSelectedAgentId}
            setShowWorkspaceDrawer={setShowWorkspaceDrawer}
            artifact={artifact}
            desktopRoom={desktopRoom}
            teamReturnTo={teamReturnTo}
            teamId={teamId}
            handleAgentLongPress={handleAgentLongPress}
            statusSummary={statusSummary}
            allTeams={allTeams}
        />
    );

    const boardFallbackPanel = (
        <BoardFallbackView
            isMissingDesktopRoom={isMissingDesktopRoom}
            desktopRoom={desktopRoom}
            collaborationState={collaborationState}
            isLoading={isLoading}
            boardFallbackTitle={boardFallbackTitle}
            boardFallbackDescription={boardFallbackDescription}
            desktopBridge={desktopBridge}
            isArtifactParseError={isArtifactParseError}
            isAuthMissing={isAuthMissing}
            onInitialize={handleInitializeArtifact}
            isOrgManagerInitializing={isOrgManagerInitializing}
        />
    );

    const renderAgentsButton = (compact: boolean = false) => (
        <Pressable
            onPress={() => {
                setShowWorkspaceDrawer(false);
                setShowMenu(false);
                setShowAgentsPopover((previous) => !previous);
            }}
            style={[
                styles.agentsButton,
                {
                    backgroundColor: theme.colors.groupped.background,
                    borderColor: theme.colors.divider,
                },
            ]}
        >
            <Ionicons name="sparkles-outline" size={compact ? 16 : 15} color={theme.colors.text} />
            <Text style={[styles.agentsButtonText, { color: theme.colors.text }]}>Agents</Text>
            <Text style={[styles.agentsButtonText, { color: theme.colors.textSecondary }]}>
                {roster.length}
            </Text>
        </Pressable>
    );

    const floatingAgentsPanel = showAgentsPopover ? (
        <>
            <Pressable
                style={styles.floatingPanelBackdrop}
                onPress={() => setShowAgentsPopover(false)}
            />
            <View
                style={[
                    styles.floatingPanelAnchor,
                    { top: isDesktopShell ? 58 : 96 },
                ]}
            >
                <TeamAgentsPopover
                    connectionStatus={(() => {
                        switch (socketStatus.status) {
                            case 'connected':
                                return { text: t('status.connected'), color: theme.colors.status.connected, isPulsing: false };
                            case 'connecting':
                                return { text: t('status.connecting'), color: theme.colors.status.connecting, isPulsing: true };
                            case 'disconnected':
                                return { text: t('status.disconnected'), color: theme.colors.status.disconnected, isPulsing: false };
                            case 'error':
                                return { text: t('status.error'), color: theme.colors.status.error, isPulsing: false };
                            default:
                                return null;
                        }
                    })()}
                    items={roster.map((entry) => ({
                        presenceLabel: (() => {
                            if (!entry.session) return 'Offline';
                            const visual = getAgentPresenceVisual({ active: entry.session.active ?? false, activeAt: entry.session.activeAt ?? 0 });
                            switch (visual.state) {
                                case 'online':
                                    return 'Online';
                                case 'stale':
                                    return 'Stale';
                                case 'dead':
                                    return 'Ended';
                                default:
                                    return 'Offline';
                            }
                        })(),
                        sessionId: entry.member.sessionId,
                        specId: entry.member.specId ?? null,
                        displayName: entry.member.displayName || entry.session?.metadata?.name || entry.role?.title || entry.member.sessionId,
                        roleLabel: entry.role?.title || entry.member.roleId || entry.session?.metadata?.role || undefined,
                        runtimeType: entry.member.runtimeType || entry.session?.metadata?.flavor || null,
                        modelLabel: entry.session?.metadata?.resolvedModel || null,
                        sessionPath: entry.session?.metadata?.path || null,
                        activeTaskTitle: entry.activeTask?.title || null,
                        isOnline: !!entry.session?.active,
                    }))}
                    onAddAgent={handleOpenAgentLibrary}
                    onOpenSession={handleOpenAgentRosterSession}
                    onRenameSession={(sessionId, displayName) => {
                        setShowAgentsPopover(false);
                        handleRenameSessionMember(sessionId, displayName);
                    }}
                    onRemoveAgent={(sessionId, displayName) => {
                        setShowAgentsPopover(false);
                        handleRemoveTeamMember(sessionId, displayName);
                    }}
                    onDeleteSession={(sessionId, displayName) => {
                        setShowAgentsPopover(false);
                        handleDeleteSessionMember(sessionId, displayName);
                    }}
                />
            </View>
        </>
    ) : null;

    const desktopMainPanel = (
        <View style={{ flex: 1 }}>
            <View
                style={[
                    styles.desktopPanelHeader,
                    { backgroundColor: 'rgba(242,246,248,0.82)' },
                ]}
            >
                <View style={styles.desktopHeaderTopRow}>
                    <View style={styles.desktopTabsRow}>
                        {STANDARD_SHELL_TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <Pressable
                                    key={tab.id}
                                    onPress={() => {
                                        selectTab(tab.id);
                                        setShowMenu(false);
                                    }}
                                    style={[
                                        styles.desktopTab,
                                        isActive && styles.desktopTabActive,
                                    ]}
                                >
                                    {isActive ? (
                                        <LinearGradient
                                            colors={['#FFFFFF', '#EDF3F7']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 0, y: 1 }}
                                            style={{
                                                ...StyleSheet.absoluteFillObject as object,
                                                borderRadius: 999,
                                            }}
                                        />
                                    ) : null}
                                    <Text
                                        style={[
                                            styles.desktopTabText,
                                            {
                                                color: isActive ? '#233648' : '#92A1AF',
                                                fontWeight: isActive ? '600' : 'normal',
                                            },
                                        ]}
                                    >
                                        {tab.label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                    <View style={{ flex: 1 }} />
                    <View style={styles.headerActionRow}>
                        {renderAgentsButton()}
                        <Pressable
                            onPress={() => {
                                setShowAgentsPopover(false);
                                setShowMenu((previous) => !previous);
                            }}
                        >
                            <Ionicons name="ellipsis-horizontal" size={20} color="#98A8B5" />
                        </Pressable>
                    </View>
                </View>
            </View>
            {floatingAgentsPanel}
            {showMenu ? (
                <>
                    <Pressable
                        onPress={() => setShowMenu(false)}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                    />
                    <View
                        style={[
                            styles.desktopMenu,
                            {
                                backgroundColor: '#F8FBFDEB',
                                borderColor: shellTheme.panelBorder,
                            },
                        ]}
                    >
                        <Pressable onPress={handleRenameTeam} style={styles.desktopMenuItem}>
                            <Ionicons name="pencil-outline" size={17} color={shellTheme.panelTitle} />
                            <Text style={{ color: shellTheme.panelTitle, fontSize: 14 }}>Rename</Text>
                        </Pressable>
                        <View style={[styles.desktopMenuDivider, { backgroundColor: shellTheme.panelDivider }]} />
                        <Pressable onPress={handleRecoverTeam} style={styles.desktopMenuItem} disabled={isRecoveringTeam}>
                            <Ionicons name="refresh-outline" size={17} color={shellTheme.panelTitle} />
                            <Text style={{ color: shellTheme.panelTitle, fontSize: 14 }}>
                                {isRecoveringTeam ? 'Recovering…' : 'Recover'}
                            </Text>
                        </Pressable>
                        <View style={[styles.desktopMenuDivider, { backgroundColor: shellTheme.panelDivider }]} />
                        <Pressable onPress={handleArchiveTeam} style={styles.desktopMenuItem}>
                            <Ionicons name="archive-outline" size={17} color={shellTheme.panelTitle} />
                            <Text style={{ color: shellTheme.panelTitle, fontSize: 14 }}>Archive</Text>
                        </Pressable>
                        <View style={[styles.desktopMenuDivider, { backgroundColor: shellTheme.panelDivider }]} />
                        <Pressable onPress={handleDeleteTeam} style={styles.desktopMenuItem}>
                            <Ionicons name="trash-outline" size={17} color={theme.colors.textDestructive} />
                            <Text style={{ color: theme.colors.textDestructive, fontSize: 14 }}>Delete</Text>
                        </Pressable>
                    </View>
                </>
            ) : null}
            <View style={styles.desktopPanelBody}>
                {shouldShowBoardFallback ? (
                    boardFallbackPanel
                ) : (
                    <>
                        {activeTab === 'chat' && renderChat()}
                        {activeTab === 'board' && kanbanPanel}
                        {activeTab === 'info' && (
                            <TeamInfoSection
                                roster={roster}
                                agentRosterSessions={agentRosterSessions}
                                setSelectedAgentId={setSelectedAgentId}
                                teamPromptLines={teamPromptLines}
                                teamPromptTitle={teamPromptTitle}
                                teamPromptBody={teamPromptBody}
                                teamBootObjective={teamBootObjective}
                                kanbanData={kanbanData}
                                teamReviewLoading={teamReviewLoading}
                                teamScorecard={teamScorecard}
                                teamPublicReviews={teamPublicReviews}
                                systemRoster={systemRoster}
                                agreements={agreements}
                            />
                        )}
                        {activeTab === 'evolution' && <EvolutionSection teamId={teamId} />}
                    </>
                )}
                <TaskDetailModal
                    visible={showTaskDetail}
                    contained={true}
                    task={selectedTask}
                    columns={kanbanData.columns}
                    onClose={handleTaskDetailClose}
                    onDiscuss={handleDiscussTask}
                    onDelete={handleDeleteTask}
                    onSave={handleTaskDetailSave}
                    onAddComment={handleTaskCommentAdd}
                    allSessions={allSessions}
                    actorSessionId={humanActor.sessionId}
                    actorRole={humanActor.role}
                    actorDisplayName={humanActor.displayName}
                />
                <NewTaskModal
                    visible={showNewTaskModal}
                    contained={true}
                    columns={kanbanData.columns}
                    initialStatus={newTaskStatus}
                    onClose={() => setShowNewTaskModal(false)}
                    onCreate={handleNewTaskCreate}
                />
            </View>
        </View>
    );

    const desktopShell = (
        <SidebarView
            secondaryPanel={workspaceSidebar}
            mainPanel={desktopMainPanel}
        />
    );

    const mobileWorkspaceDrawer = (
        <>
            <Pressable
                style={styles.mobileWorkspaceBackdrop}
                onPress={() => setShowWorkspaceDrawer(false)}
            />
            <View
                style={[
                    styles.mobileWorkspacePanel,
                    { width: Math.min(360, width - 24) }
                ]}
            >
                {workspaceSidebar}
            </View>
        </>
    );

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: !isDesktopShell,
                    headerTitle: (desktopBridge ? desktopRoom?.name : artifact?.title) || 'Team Dashboard',
                    headerRight: () => (
                        <Pressable
                            onPress={() => {
                                setShowAgentsPopover(false);
                                setShowMenu(!showMenu);
                            }}
                            hitSlop={10}
                            style={{ padding: 8 }}
                        >
                            <Ionicons name="ellipsis-horizontal" size={24} color={theme.colors.text} />
                        </Pressable>
                    ),
                }}
            />
            {!isDesktopShell && showMenu && (
                <MobileTeamMenu
                    onClose={() => setShowMenu(false)}
                    onRename={handleRenameTeam}
                    onRecover={handleRecoverTeam}
                    isRecovering={isRecoveringTeam}
                    onArchive={handleArchiveTeam}
                    onDelete={handleDeleteTeam}
                />
            )}
            {isDesktopShell ? (
                desktopShell
            ) : (
                <View style={styles.container}>
                    {floatingAgentsPanel}
                    <View style={styles.header}>
                        <View style={styles.mobileHeaderTopRow}>
                            <Pressable
                                style={styles.mobileWorkspaceButton}
                                onPress={() => {
                                    setShowWorkspaceDrawer((previous) => !previous);
                                    setShowMenu(false);
                                    setShowAgentsPopover(false);
                                }}
                            >
                                <Ionicons name="layers-outline" size={18} color={theme.colors.text} />
                                <View style={styles.mobileWorkspaceCopy}>
                                    <Text style={styles.mobileWorkspaceTitle} numberOfLines={1}>
                                        {artifact?.title || desktopRoom?.name || 'Workspace'}
                                    </Text>
                                    <Text style={styles.mobileWorkspaceSubtitle} numberOfLines={1}>
                                        {onlineCount} online · {roster.length} agents · {allTeams.length} teams
                                    </Text>
                                </View>
                                <Ionicons
                                    name={showWorkspaceDrawer ? 'chevron-up' : 'chevron-down'}
                                    size={16}
                                    color={theme.colors.textSecondary}
                                />
                            </Pressable>
                            <View style={styles.headerActionRow}>
                                {renderAgentsButton(true)}
                                <Pressable
                                    style={styles.mobileHeaderIconButton}
                                    onPress={() => {
                                        setShowMenu(!showMenu);
                                        setShowWorkspaceDrawer(false);
                                        setShowAgentsPopover(false);
                                    }}
                                >
                                    <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.text} />
                                </Pressable>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', backgroundColor: theme.colors.groupped.background, borderRadius: 12, padding: 4 }}>
                            {STANDARD_SHELL_TABS.map((tab) => (
                                <Pressable
                                    key={tab.id}
                                    onPress={() => selectTab(tab.id)}
                                    style={{
                                        flex: 1,
                                        paddingVertical: 8,
                                        alignItems: 'center',
                                        borderRadius: 8,
                                        backgroundColor: activeTab === tab.id ? theme.colors.surface : 'transparent',
                                        shadowColor: activeTab === tab.id ? '#000' : 'transparent',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: activeTab === tab.id ? 0.1 : 0,
                                        shadowRadius: 2,
                                    }}
                                >
                                    <Text style={{
                                        fontSize: 14,
                                        fontWeight: '600',
                                        color: activeTab === tab.id ? theme.colors.text : theme.colors.textSecondary,
                                    }}>
                                        {tab.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {shouldShowBoardFallback ? (
                        boardFallbackPanel
                    ) : (
                        <>
                            {activeTab === 'chat' && renderChat()}
                            {activeTab === 'board' && kanbanPanel}
                            {activeTab === 'info' && (
                                <TeamInfoSection
                                    roster={roster}
                                    agentRosterSessions={agentRosterSessions}
                                    setSelectedAgentId={setSelectedAgentId}
                                    teamPromptLines={teamPromptLines}
                                    teamPromptTitle={teamPromptTitle}
                                    teamPromptBody={teamPromptBody}
                                    teamBootObjective={teamBootObjective}
                                    kanbanData={kanbanData}
                                    teamReviewLoading={teamReviewLoading}
                                    teamScorecard={teamScorecard}
                                    teamPublicReviews={teamPublicReviews}
                                    systemRoster={systemRoster}
                                    agreements={agreements}
                                />
                            )}
                            {activeTab === 'evolution' && <EvolutionSection teamId={teamId} />}
                        </>
                    )}
                </View>
            )}

            {!isDesktopShell && showWorkspaceDrawer && mobileWorkspaceDrawer}
            <TeamAgentLibraryModal
                visible={showAgentLibrary}
                teamId={teamId}
                teamName={teamDisplayName}
                onClose={() => setShowAgentLibrary(false)}
            />

            {/* 🆕 任务详情弹窗 (mobile only — desktop uses contained modal inside main panel) */}
            {!isDesktopShell && (
                <>
                    <TaskDetailModal
                        visible={showTaskDetail}
                        task={selectedTask}
                        columns={kanbanData.columns}
                        onClose={handleTaskDetailClose}
                        onDiscuss={handleDiscussTask}
                        onDelete={handleDeleteTask}
                        onSave={handleTaskDetailSave}
                        onAddComment={handleTaskCommentAdd}
                        allSessions={allSessions}
                        actorSessionId={humanActor.sessionId}
                        actorRole={humanActor.role}
                        actorDisplayName={humanActor.displayName}
                    />
                    <NewTaskModal
                        visible={showNewTaskModal}
                        columns={kanbanData.columns}
                        initialStatus={newTaskStatus}
                        onClose={() => setShowNewTaskModal(false)}
                        onCreate={handleNewTaskCreate}
                    />
                </>
            )}

            {/* 🆕 任务审批弹窗 */}
            <TaskApprovalModal
                visible={showApprovalModal}
                onClose={() => setShowApprovalModal(false)}
                pendingTasks={pendingTasks}
                teamId={teamId}
                onTaskApproved={(task) => {
                    trackTaskApproval(task.id, true, {
                        team_id: teamId,
                        source: 'task_approval_modal',
                        task_source: task.source ?? null,
                    });
                }}
                onTaskRejected={(task, reason) => {
                    trackTaskApproval(task.id, false, {
                        team_id: teamId,
                        source: 'task_approval_modal',
                        task_source: task.source ?? null,
                        reason_provided: Boolean(reason.trim()),
                    });
                }}
            />
        </>
    );
}
