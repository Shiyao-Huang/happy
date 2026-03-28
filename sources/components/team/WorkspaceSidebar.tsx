import React from 'react';
import { useRouter } from 'expo-router';
import { FloatingIslandSidebar } from '@/components/layout/FloatingIslandSidebar';
import { getAgentPresenceVisual } from '@/utils/sessionUtils';
import { pushSessionRoute } from '@/utils/returnNavigation';
import { SHELL_CONVERSATION_COLORS } from '@/utils/teamUtils';
import type { DecryptedArtifact } from '@/sync/artifactTypes';

type DesktopRoom = { name?: string; id?: string } | null;

type RosterEntry = {
    member: {
        sessionId: string;
        roleId?: string;
        displayName?: string;
        runtimeType?: string;
    };
    session?: {
        active?: boolean;
        activeAt?: number;
        metadata?: {
            role?: string;
            name?: string;
        } | null;
    } | null;
    role?: { id?: string; title?: string };
    tasks: Array<unknown>;
    activeTask?: { title?: string; startedAt?: number } | null;
};

type StatusSummary = {
    decision: number;
    working: number;
    review: number;
};

type ArtifactLike = { id: string; title?: string | null; type?: string };

interface WorkspaceSidebarProps {
    myDisplayName: string;
    myRoleTitle: string;
    roster: RosterEntry[];
    selectedAgentId: string | null;
    setSelectedAgentId: (id: string | null) => void;
    setShowWorkspaceDrawer: (show: boolean) => void;
    artifact: DecryptedArtifact | null | undefined;
    desktopRoom: DesktopRoom;
    teamReturnTo: string;
    teamId: string;
    handleAgentLongPress: (sessionId: string, displayName: string) => void;
    statusSummary: StatusSummary;
    allTeams: ArtifactLike[];
}

export function WorkspaceSidebar({
    myDisplayName,
    myRoleTitle,
    roster,
    selectedAgentId,
    setSelectedAgentId,
    setShowWorkspaceDrawer,
    artifact,
    desktopRoom,
    teamReturnTo,
    teamId,
    handleAgentLongPress,
    statusSummary,
    allTeams,
}: WorkspaceSidebarProps) {
    const router = useRouter();

    return (
        <FloatingIslandSidebar
            variant="default"
            header={{
                title: myDisplayName,
                subtitle: `${myRoleTitle} · Online`,
                iconLabel: myDisplayName.slice(0, 1).toUpperCase(),
                iconGradientColors: ['#314658', '#1E2D3C'],
                trailingIcon: 'chevron-down',
            }}
            agentItems={roster.map((entry) => {
                const presence = entry.session
                    ? getAgentPresenceVisual({ active: entry.session.active ?? false, activeAt: entry.session.activeAt ?? 0 })
                    : { dotColor: '#8A7F74', inactive: true, dead: false };
                const runtimeLabel = entry.member.runtimeType ? entry.member.runtimeType : undefined;
                const roleLabel = entry.role?.title || entry.member.roleId || entry.session?.metadata?.role || '';
                return {
                    id: entry.member.sessionId,
                    name: entry.role?.title || entry.member.displayName || entry.session?.metadata?.name || entry.member.sessionId,
                    dotColor: presence.dotColor,
                    inactive: presence.inactive,
                    dead: presence.dead,
                    description: [roleLabel, runtimeLabel].filter(Boolean).join(' · '),
                    selected: selectedAgentId === entry.member.sessionId,
                    activeTaskTitle: entry.activeTask?.title,
                    activeTaskStartedAt: entry.activeTask?.startedAt,
                    count: selectedAgentId === entry.member.sessionId
                        ? entry.tasks.length
                        : entry.tasks.length > 0 ? entry.tasks.length : undefined,
                    onPress: () => {
                        setShowWorkspaceDrawer(false);
                        setSelectedAgentId(entry.member.sessionId);
                        pushSessionRoute(router, {
                            id: entry.member.sessionId,
                            teamId,
                            teamName: artifact?.title || desktopRoom?.name || 'Team',
                            roleName: entry.session?.metadata?.role || entry.role?.id || '',
                            returnTo: teamReturnTo,
                        });
                    },
                    onLongPress: () => {
                        const displayName = entry.role?.title || entry.member.displayName || entry.session?.metadata?.name || entry.member.sessionId;
                        handleAgentLongPress(entry.member.sessionId, displayName);
                    },
                };
            })}
            statusItems={[
                {
                    id: 'decision',
                    icon: 'radio-button-on',
                    label: 'Needs Decision',
                    color: '#FF3B30',
                    backgroundColor: '#FF3B300D',
                    count: statusSummary.decision,
                },
                {
                    id: 'working',
                    icon: 'pulse',
                    label: 'Working',
                    color: '#FF9500',
                    backgroundColor: '#FF950012',
                    count: statusSummary.working,
                },
                {
                    id: 'review',
                    icon: 'people',
                    label: 'Team Review',
                    color: '#8A7F74',
                    backgroundColor: '#00000000',
                    count: statusSummary.review,
                },
            ]}
            conversationItems={allTeams.map((team, index) => ({
                id: team.id,
                name: team.title || 'Team',
                lastMessage: '',
                time: '',
                avatarColor: SHELL_CONVERSATION_COLORS[index % SHELL_CONVERSATION_COLORS.length],
                avatarLabel: (team.title || 'T').slice(0, 1).toUpperCase(),
                selected: team.id === teamId,
                onPress: () => {
                    setShowWorkspaceDrawer(false);
                    router.push({
                        pathname: '/teams/[id]',
                        params: { id: team.id },
                    } as any);
                },
            }))}
            conversationSectionLabel="Teams"
            conversationEmptyText="No teams yet"
        />
    );
}
