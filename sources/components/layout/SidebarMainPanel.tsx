import * as React from 'react';
import { useRouter } from 'expo-router';

import { getDisplayName } from '@/sync/profile';
import { useAllSessions, useArtifacts, useProfile } from '@/sync/storage';
import type { Session } from '@/sync/storageTypes';
import { getSessionName } from '@/utils/sessionUtils';
import {
    buildSessionActivityMetrics,
    type SessionActivitySnapshot,
    compareAgentSidebarEntries,
    formatTokenRateLabel,
    getStableSessionOrder,
    getTokenRateAccentColor,
} from '@/utils/sessionActivityRanking';
import { buildSidebarAgentRosterEntries, selectSidebarAgentSessions } from '@/utils/sidebarAgentSessions';
import { getTeamSessionIdsFromArtifact } from '@/utils/teamRoster';
import { useNavigateToSession } from '@/hooks/useNavigateToSession';
import { fetchGenomeByName, parseFeedback } from '@/utils/genomeHub';
import {
    normalizeRoleKey,
    resolveSidebarAgentIdentity,
} from '@/utils/sidebarAgentIdentity';

import { t } from '@/text';

import { FloatingIslandSidebar } from './FloatingIslandSidebar';
import { ThreeColumnShellVariant } from './ThreeColumnShell';

const AGENT_DOT_COLORS: Record<string, string> = {
    master: '#007AFF',
    implementer: '#FF9500',
    qa: '#5856D6',
    architect: '#34C759',
    builder: '#FF9500',
    reviewer: '#9CA3AF',
};

const CONVERSATION_COLORS = ['#7AA585', '#8F99C1', '#6B7280', '#B89A6F', '#6886A3'];

type RoleScore = {
    score: number;
    evaluationCount: number;
};

function buildRoleCandidates(value: string): string[] {
    const normalized = normalizeRoleKey(value);
    return Array.from(new Set([
        value.trim(),
        normalized,
        normalized.replace(/[\s_]+/g, '-'),
    ].filter(Boolean)));
}

function formatListTime(timestamp: number): string {
    const now = new Date();
    const value = new Date(timestamp);

    if (now.toDateString() === value.toDateString()) {
        return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return value.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

interface SidebarMainPanelProps {
    variant?: ThreeColumnShellVariant;
}

export const SidebarMainPanel = React.memo(({ variant = 'default' }: SidebarMainPanelProps) => {
    const router = useRouter();
    const profile = useProfile();
    const navigateToSession = useNavigateToSession();
    const allSessions = useAllSessions();
    const allArtifacts = useArtifacts();
    const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
    const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null);

    const selectedTeamArtifact = React.useMemo(() => {
        return selectedTeamId
            ? allArtifacts.find((artifact) => artifact.id === selectedTeamId) ?? null
            : null;
    }, [allArtifacts, selectedTeamId]);

    const teamSessionIds = React.useMemo(
        () => new Set(getTeamSessionIdsFromArtifact(selectedTeamArtifact)),
        [selectedTeamArtifact],
    );
    const sourceSessions = React.useMemo(
        () => selectSidebarAgentSessions(allSessions, {
            selectedTeamId,
            teamSessionIds,
        }),
        [allSessions, selectedTeamId, teamSessionIds],
    );
    const teamArtifacts = React.useMemo(
        () => allArtifacts.filter((artifact) => artifact.type === 'team'),
        [allArtifacts],
    );
    const rosterEntries = React.useMemo(
        () => buildSidebarAgentRosterEntries(allSessions, teamArtifacts, {
            selectedTeamId,
            teamSessionIds,
        }),
        [allSessions, teamArtifacts, selectedTeamId, teamSessionIds],
    );
    const activitySnapshotsRef = React.useRef<Map<string, SessionActivitySnapshot>>(new Map());
    const activityMetrics = React.useMemo(() => {
        const result = buildSessionActivityMetrics(sourceSessions, activitySnapshotsRef.current);
        activitySnapshotsRef.current = result.snapshots;
        return result.metrics;
    }, [sourceSessions]);

    const agents = React.useMemo(() => {
        const result: {
            id: string;
            name: string;
            dotColor: string;
            roleKey: string;
            description: string;
            inactive: boolean;
            dead: boolean;
            session: Session | null;
            teamId: string | null;
            tokenRateBucket: number;
            tokenRate: number;
            stableOrder: number;
            activityLabel?: string;
            activityColor: string;
        }[] = [];

        const DEAD_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour without activity = "ended"

        rosterEntries.forEach((entry) => {
            const session = entry.session;
            const member = entry.member;
            const identity = resolveSidebarAgentIdentity({
                memberRoleId: member?.roleId,
                sessionRole: session?.metadata?.role,
                sessionFlavor: session?.metadata?.flavor,
                runtimeType: member?.runtimeType,
            });
            const descriptionParts = [identity.displayRole];
            if (
                identity.runtimeLabel
                && normalizeRoleKey(identity.runtimeLabel) !== normalizeRoleKey(identity.displayRole)
            ) {
                descriptionParts.push(identity.runtimeLabel);
            }
            const inactive = session ? !session.active : true;
            const dead = !!session && inactive && session.activeAt > 0 && (Date.now() - session.activeAt > DEAD_THRESHOLD_MS);
            const activity = session ? activityMetrics.get(session.id) : undefined;
            const tokenRateBucket = activity?.tokenRateBucket ?? 0;
            const tokenRate = activity?.tokenRate ?? 0;
            result.push({
                id: entry.sessionId,
                name: member?.displayName || (session ? getSessionName(session) : entry.sessionId),
                dotColor: AGENT_DOT_COLORS[normalizeRoleKey(identity.displayRole)] ?? '#007AFF',
                roleKey: identity.roleKey,
                description: descriptionParts.filter(Boolean).join(' · '),
                inactive,
                dead,
                session,
                teamId: entry.teamId,
                tokenRateBucket,
                tokenRate,
                stableOrder: member?.lifecycle?.processStartedAt
                    ?? member?.lifecycle?.spawnRequestedAt
                    ?? (session ? getStableSessionOrder(session) : Number.MAX_SAFE_INTEGER),
                activityLabel: session ? formatTokenRateLabel(tokenRate) : undefined,
                activityColor: getTokenRateAccentColor(tokenRateBucket),
            });
        });

        // Keep sidebar ordering stable by activity bucket instead of volatile message timestamps.
        result.sort((left, right) => compareAgentSidebarEntries(left, right));

        return result;
    }, [activityMetrics, rosterEntries]);

    const teams = React.useMemo(() => {
        return allArtifacts
            .filter((artifact) => artifact.type === 'team')
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((team, index) => ({
                id: team.id,
                name: team.title || t('teams.untitledTeam'),
                lastMessage: t('sidebar.openTeamWorkspace'),
                time: formatListTime(team.updatedAt),
                avatarColor: CONVERSATION_COLORS[index % CONVERSATION_COLORS.length],
            }));
    }, [allArtifacts]);

    const [roleScores, setRoleScores] = React.useState<Record<string, RoleScore | null>>({});

    const roleKeys = React.useMemo(() => {
        return Array.from(new Set(
            agents
                .map((agent) => agent.roleKey?.trim())
                .filter((value): value is string => !!value)
                .map(normalizeRoleKey)
        ));
    }, [agents]);

    React.useEffect(() => {
        const missingRoleKeys = roleKeys.filter((roleKey) => !(roleKey in roleScores));
        if (missingRoleKeys.length === 0) {
            return;
        }

        let cancelled = false;

        (async () => {
            const resolvedEntries = await Promise.all(
                missingRoleKeys.map(async (roleKey) => {
                    for (const candidate of buildRoleCandidates(roleKey)) {
                        try {
                            const genome = await fetchGenomeByName('@official', candidate);
                            const feedback = parseFeedback(genome?.feedbackData ?? null);
                            if (feedback && feedback.evaluationCount > 0) {
                                return [roleKey, {
                                    score: feedback.avgScore,
                                    evaluationCount: feedback.evaluationCount,
                                }] as const;
                            }
                        } catch {
                            // Ignore missing or unreachable genome hub entries.
                        }
                    }

                    return [roleKey, null] as const;
                })
            );

            if (cancelled) {
                return;
            }

            setRoleScores((prev) => {
                const next = { ...prev };
                for (const [roleKey, score] of resolvedEntries) {
                    next[roleKey] = score;
                }
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [roleKeys, roleScores]);

    React.useEffect(() => {
        if (agents.length > 0 && (!selectedAgentId || !agents.some((agent) => agent.id === selectedAgentId))) {
            setSelectedAgentId(agents[0].id);
        }
    }, [agents, selectedAgentId]);

    React.useEffect(() => {
        if (selectedTeamId && !teams.some((team) => team.id === selectedTeamId)) {
            setSelectedTeamId(null);
        }
    }, [teams, selectedTeamId]);

    const displayName = getDisplayName(profile) || profile.github?.login || t('sidebar.workspace');
    const activeCount = agents.filter((agent) => !agent.inactive).length;
    const totalCount = agents.length;

    const statusCounts = React.useMemo(() => {
        return agents.reduce((acc, agent) => {
            if (agent.inactive) return acc;

            const hasPendingRequests = !!agent.session?.agentState?.requests && Object.keys(agent.session.agentState.requests).length > 0;

            if (hasPendingRequests) {
                acc.needsDecision += 1;
            } else if (agent.session?.thinking) {
                acc.working += 1;
            } else {
                acc.online += 1;
            }

            return acc;
        }, {
            needsDecision: 0,
            working: 0,
            online: 0,
        });
    }, [agents]);

    return (
        <FloatingIslandSidebar
            variant={variant}
            header={{
                title: displayName,
                subtitle: totalCount > 0 ? `${activeCount} active · ${totalCount} total` : t('sidebar.online'),
                icon: 'person',
                iconGradientColors: ['#314658', '#1E2D3C'],
                trailingIcon: 'chevron-down',
            }}
            agentItems={agents.map((agent) => ({
                id: agent.id,
                name: agent.name,
                dotColor: agent.dotColor,
                inactive: agent.inactive,
                dead: agent.dead,
                description: agent.description || undefined,
                score: roleScores[normalizeRoleKey(agent.roleKey || '')]?.score,
                scoreCount: roleScores[normalizeRoleKey(agent.roleKey || '')]?.evaluationCount,
                activityLabel: agent.activityLabel,
                activityColor: agent.activityColor,
                selected: selectedAgentId === agent.id,
                onPress: () => {
                    setSelectedAgentId(agent.id);
                    if (agent.session) {
                        navigateToSession(agent.id);
                        return;
                    }
                    if (agent.teamId) {
                        setSelectedTeamId(agent.teamId);
                        router.push(`/teams/${agent.teamId}` as never);
                    }
                },
                onDoublePress: () => {
                    setSelectedAgentId(agent.id);
                    if (agent.session) {
                        navigateToSession(agent.id);
                        return;
                    }
                    if (agent.teamId) {
                        setSelectedTeamId(agent.teamId);
                        router.push(`/teams/${agent.teamId}` as never);
                    }
                },
            }))}
            statusItems={[
                {
                    id: 'needs-decision',
                    icon: 'radio-button-on',
                    label: t('sidebar.needsDecision'),
                    color: '#FF3B30',
                    backgroundColor: '#FF3B300D',
                    count: statusCounts.needsDecision || undefined,
                },
                {
                    id: 'working',
                    icon: 'pulse',
                    label: t('sidebar.working'),
                    color: '#FF9500',
                    backgroundColor: '#FF950012',
                    count: statusCounts.working || undefined,
                },
                {
                    id: 'online',
                    icon: 'checkmark-circle',
                    label: t('sidebar.online'),
                    color: '#34C759',
                    backgroundColor: '#34C75912',
                    count: statusCounts.online || undefined,
                },
            ]}
            agentHeaderAction={() => router.push('/agents/new' as never)}
            agentHeaderActionLabel={t('agents.createAgent')}
            conversationSectionLabel={t('sidebar.workspace')}
            conversationItems={teams.map((team) => ({
                ...team,
                avatarIcon: 'grid-outline',
                selected: selectedTeamId === team.id,
                onPress: () => {
                    if (selectedTeamId === team.id) {
                        router.push(`/teams/${team.id}` as never);
                    } else {
                        setSelectedTeamId(team.id);
                    }
                },
            }))}
            conversationHeaderAction={() => router.push('/teams/new' as never)}
            conversationEmptyText={t('sidebar.noTeamsYet')}
        />
    );
});
