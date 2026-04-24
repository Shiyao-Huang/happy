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
import { fetchGenomeById, fetchGenomeByName, parseAgentVerdict } from '@/utils/genomeHub';
import {
    normalizeRoleKey,
    resolveSidebarAgentImageRef,
    resolveSidebarAgentIdentity,
    resolveSidebarGenomeRoleCandidates,
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

type RoleScoreState = {
    signature: string;
    score: RoleScore | null;
};

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
            imageId?: string;
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
            const imageRef = resolveSidebarAgentImageRef({ member, session });
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
                imageId: imageRef?.id,
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

    const [roleScores, setRoleScores] = React.useState<Record<string, RoleScoreState>>({});

    const roleLookupInputs = React.useMemo(() => {
        const lookupMap = new Map<string, { imageIds: Set<string>; roleCandidates: string[] }>();

        agents.forEach((agent) => {
            const roleKey = normalizeRoleKey(agent.roleKey || '');
            if (!roleKey) {
                return;
            }

            const current = lookupMap.get(roleKey) ?? {
                imageIds: new Set<string>(),
                roleCandidates: resolveSidebarGenomeRoleCandidates(roleKey),
            };
            if (agent.imageId) {
                current.imageIds.add(agent.imageId);
            }
            lookupMap.set(roleKey, current);
        });

        return Array.from(lookupMap.entries()).map(([roleKey, input]) => ({
            roleKey,
            imageIds: Array.from(input.imageIds),
            roleCandidates: input.roleCandidates,
            signature: JSON.stringify({
                imageIds: Array.from(input.imageIds).sort(),
                roleCandidates: [...input.roleCandidates].sort(),
            }),
        }));
    }, [agents]);

    React.useEffect(() => {
        const pendingLookups = roleLookupInputs.filter(
            (input) => roleScores[input.roleKey]?.signature !== input.signature,
        );
        if (pendingLookups.length === 0) {
            return;
        }

        let cancelled = false;

        (async () => {
            const resolvedEntries = await Promise.all(
                pendingLookups.map(async ({ roleKey, imageIds, roleCandidates, signature }) => {
                    // Prefer canonical official role lookups before stale image ids.
                    // This avoids guaranteed 404s when old team records still carry
                    // retired or deleted genome refs for otherwise-known roles.
                    for (const candidate of roleCandidates) {
                        try {
                            const genome = await fetchGenomeByName('@official', candidate);
                            const feedback = parseAgentVerdict(genome?.feedbackData ?? null);
                            if (feedback && feedback.evaluationCount > 0) {
                                return [roleKey, {
                                    signature,
                                    score: {
                                        score: feedback.avgScore,
                                        evaluationCount: feedback.evaluationCount,
                                    },
                                }] as const;
                            }
                        } catch {
                            // Ignore missing or unreachable genome hub entries.
                        }
                    }

                    // Sidebar role candidates are official-only. Once we've checked the
                    // canonical official lineage, do not fall back to stale opaque image
                    // ids from historical team records just to chase score metadata.
                    if (roleCandidates.length > 0) {
                        return [roleKey, { signature, score: null }] as const;
                    }

                    for (const imageId of imageIds) {
                        try {
                            const genome = await fetchGenomeById(imageId);
                            const feedback = parseAgentVerdict(genome?.feedbackData ?? null);
                            if (feedback && feedback.evaluationCount > 0) {
                                return [roleKey, {
                                    signature,
                                    score: {
                                        score: feedback.avgScore,
                                        evaluationCount: feedback.evaluationCount,
                                    },
                                }] as const;
                            }
                        } catch {
                            // Ignore missing or unreachable genome hub entries.
                        }
                    }

                    return [roleKey, { signature, score: null }] as const;
                })
            );

            if (cancelled) {
                return;
            }

            setRoleScores((prev) => {
                const next = { ...prev };
                for (const [roleKey, state] of resolvedEntries) {
                    next[roleKey] = state;
                }
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [roleLookupInputs, roleScores]);

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
                score: roleScores[normalizeRoleKey(agent.roleKey || '')]?.score?.score,
                scoreCount: roleScores[normalizeRoleKey(agent.roleKey || '')]?.score?.evaluationCount,
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
            agentHeaderAction={() => router.push('/agents/new' as never)}
            agentHeaderActionLabel="+新建Agent"
            conversationSectionLabel={t('sidebar.workspace')}
            conversationHeaderAction={() => router.push('/teams/new' as never)}
            conversationHeaderActionLabel={t('teams.newTeamButton')}
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
            conversationEmptyText={t('sidebar.noTeamsYet')}
        />
    );
});
