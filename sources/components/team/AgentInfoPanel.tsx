/**
 * AgentInfoPanel — compact bottom-sheet that shows Genome details for a
 * session-based agent in team context.
 *
 * Usage (minimal):
 *   <AgentInfoPanel
 *     visible={panelVisible}
 *     sessionId={sessionId}
 *     onClose={() => setPanelVisible(false)}
 *   />
 *
 * Usage (with pre-resolved specId to skip the kanban-board lookup):
 *   <AgentInfoPanel
 *     visible={panelVisible}
 *     sessionId={sessionId}
 *     specId={specId}
 *     onClose={() => setPanelVisible(false)}
 *   />
 */
import React from 'react';
import {
    Animated,
    Modal,
    Pressable,
    ScrollView,
    Text,
    View,
} from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession, useArtifact } from '@/sync/storage';
import { type KanbanBoard } from '@/sync/kanbanTypes';
import {
    fetchGenomeById,
    parseSpec,
    parseFeedback,
    parseTags,
    type GenomeRecord,
    type GenomeSpec,
} from '@/utils/genomeHub';
import { Avatar } from '@/components/avatar/Avatar';
import { getRoleLabel, resolveDisplayName } from '@/utils/roleVisualUtils';
import { getSessionAvatarId } from '@/utils/sessionUtils';

// ─── Warm-gold accent tokens (no Unistyles equivalent) ───────────────────────
const WG = {
    accent: '#b26a00',
    accentStrong: '#d48a08',
    accentBg: '#7b4e13',
    overlay: 'rgba(0,0,0,0.72)',
} as const;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AgentInfoPanelProps {
    /** Whether the panel is visible */
    visible: boolean;
    /**
     * Session ID — used to resolve roleId, displayName, and specId from the
     * kanban board if specId is not passed directly.
     */
    sessionId: string;
    /**
     * Genome UUID — if known, skips the kanban-board lookup.
     * Otherwise the panel auto-resolves it from the board member entry.
     */
    specId?: string | null;
    /** Called when the panel should be dismissed */
    onClose: () => void;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface MemberInfo {
    roleId: string;
    displayName: string | undefined;
    candidateId: string | undefined;
    specId: string | undefined;
    runtimeType: string | undefined;
    executionPlane: string | undefined;
}

/**
 * Resolves the team-member record for a given sessionId from the kanban board
 * stored in the team's artifact body.
 */
function useMemberInfo(sessionId: string): MemberInfo | null {
    const session = useSession(sessionId);
    const teamId = session?.metadata?.teamId ?? '';
    const artifact = useArtifact(teamId);

    return React.useMemo(() => {
        if (!artifact?.body) return null;
        try {
            const board = JSON.parse(artifact.body) as KanbanBoard;
            const member = board.team?.members?.find(m => m.sessionId === sessionId);
            if (!member) return null;
            return {
                roleId: member.roleId,
                displayName: member.displayName,
                candidateId: member.candidateId,
                specId: member.specId,
                runtimeType: member.runtimeType,
                executionPlane: member.executionPlane,
            };
        } catch {
            return null;
        }
    }, [artifact?.body, sessionId]);
}

/** Fetches genome data; returns {genome, spec, loading}. */
function useGenomeData(specId: string | null | undefined): {
    genome: GenomeRecord | null;
    spec: GenomeSpec | null;
    loading: boolean;
} {
    const [genome, setGenome] = React.useState<GenomeRecord | null>(null);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (!specId) {
            setGenome(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        fetchGenomeById(specId)
            .then(g => {
                if (!cancelled) {
                    setGenome(g);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setGenome(null);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [specId]);

    const spec = React.useMemo(
        () => (genome?.spec ? parseSpec(genome.spec) : null),
        [genome?.spec],
    );

    return { genome, spec, loading };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
    const { theme } = useUnistyles();
    const clampedScore = Math.min(100, Math.max(0, score));
    const fillColor =
        clampedScore >= 80 ? theme.colors.success :
        clampedScore >= 55 ? WG.accentStrong :
        theme.colors.warningCritical;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.colors.divider,
                overflow: 'hidden',
            }}>
                <View style={{
                    width: `${clampedScore}%`,
                    height: '100%',
                    borderRadius: 3,
                    backgroundColor: fillColor,
                }} />
            </View>
            <Text style={{ fontSize: 12, fontWeight: '700', color: fillColor, minWidth: 36, textAlign: 'right' }}>
                {clampedScore.toFixed(0)}/100
            </Text>
        </View>
    );
}

function FactPill({ label, value }: { label: string; value: string }) {
    const { theme } = useUnistyles();
    return (
        <View style={{
            minWidth: 110,
            maxWidth: '100%',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.colors.divider,
            paddingHorizontal: 10,
            paddingVertical: 8,
            backgroundColor: theme.colors.groupped.background,
        }}>
            <Text style={{
                fontSize: 10,
                color: theme.colors.textSecondary,
                fontWeight: '700',
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                marginBottom: 2,
            }}>
                {label}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.text, fontWeight: '600' }}>
                {value}
            </Text>
        </View>
    );
}

function TagPill({
    tag,
    tone = 'default',
    monospace = false,
}: {
    tag: string;
    tone?: 'default' | 'authority' | 'code';
    monospace?: boolean;
}) {
    const { theme } = useUnistyles();
    const palette = tone === 'authority'
        ? {
            borderColor: '#AF52DE44',
            backgroundColor: '#AF52DE22',
            textColor: '#AF52DE',
            borderRadius: 999,
        }
        : tone === 'code'
            ? {
                borderColor: theme.colors.divider,
                backgroundColor: theme.colors.surface,
                textColor: theme.colors.textSecondary,
                borderRadius: 6,
            }
            : {
                borderColor: theme.colors.divider,
                backgroundColor: theme.colors.groupped.background,
                textColor: theme.colors.textSecondary,
                borderRadius: 999,
            };
    return (
        <View style={{
            borderRadius: palette.borderRadius,
            borderWidth: 1,
            borderColor: palette.borderColor,
            paddingHorizontal: 10,
            paddingVertical: 3,
            backgroundColor: palette.backgroundColor,
        }}>
            <Text style={{
                fontSize: 11,
                color: palette.textColor,
                fontWeight: '600',
                ...(monospace ? { fontFamily: 'monospace' } : {}),
            }}>
                {tag}
            </Text>
        </View>
    );
}

function SectionLabel({ label }: { label: string }) {
    const { theme } = useUnistyles();
    return (
        <Text style={{
            fontSize: 11,
            color: theme.colors.textSecondary,
            fontWeight: '700',
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            marginBottom: 6,
        }}>
            {label}
        </Text>
    );
}

function Divider() {
    const { theme } = useUnistyles();
    return <View style={{ height: 1, backgroundColor: theme.colors.divider, marginVertical: 14 }} />;
}

/** The genome details section — loaded state. */
function GenomeDetails({
    genome,
    spec,
    onViewMarketplace,
}: {
    genome: GenomeRecord;
    spec: GenomeSpec | null;
    onViewMarketplace: () => void;
}) {
    const { theme } = useUnistyles();
    const displayName = spec?.displayName ?? genome.name;
    const namespace = genome.namespace ?? '@public';
    const version = genome.version ?? 1;
    const description = spec?.description ?? genome.description;
    const feedback = parseFeedback(genome.feedbackData ?? null);
    const tags = parseTags(genome.tags ?? null);
    const responsibilities = spec?.responsibilities ?? [];
    const facts = [
        spec?.runtimeType ? { label: 'Runtime', value: spec.runtimeType } : null,
        spec?.modelId || spec?.preferredModel ? { label: 'Model', value: spec?.modelId ?? spec?.preferredModel ?? '—' } : null,
        spec?.modelProvider ? { label: 'Provider', value: spec.modelProvider } : null,
        spec?.fallbackModelId ? { label: 'Fallback', value: spec.fallbackModelId } : null,
        spec?.executionPlane ? { label: 'Plane', value: spec.executionPlane } : null,
        namespace ? { label: 'Source', value: namespace } : null,
        spec?.permissionMode ? { label: 'Permission', value: spec.permissionMode } : null,
        spec?.maxTurns != null ? { label: 'Max Turns', value: String(spec.maxTurns) } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
    const authorities = spec?.authorities ?? [];
    const protocol = spec?.protocol ?? [];
    const skills = spec?.skills ?? [];
    const mcpServers = spec?.mcpServers ?? [];
    const messagingFacts = [
        spec?.messaging?.listenFrom
            ? {
                label: 'Listen From',
                value: Array.isArray(spec.messaging.listenFrom) ? spec.messaging.listenFrom.join(', ') : 'All',
            }
            : null,
        spec?.messaging?.receiveUserMessages != null
            ? { label: 'User Messages', value: spec.messaging.receiveUserMessages ? 'Allowed' : 'Blocked' }
            : null,
        spec?.messaging?.replyMode ? { label: 'Reply Mode', value: spec.messaging.replyMode } : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
    const behaviorFacts = [
        spec?.behavior?.onIdle ? { label: 'On Idle', value: spec.behavior.onIdle } : null,
        spec?.behavior?.onBlocked ? { label: 'On Blocked', value: spec.behavior.onBlocked } : null,
        spec?.behavior?.canSpawnAgents != null
            ? { label: 'Can Spawn', value: spec.behavior.canSpawnAgents ? 'Yes' : 'No' }
            : null,
        spec?.behavior?.requireExplicitAssignment != null
            ? { label: 'Assignment', value: spec.behavior.requireExplicitAssignment ? 'Required' : 'Auto' }
            : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
    const hookEntries = [
        ...(spec?.hooks?.preToolUse ?? []).map(h => `⬆ ${h.matcher} → ${h.description ?? h.command}`),
        ...(spec?.hooks?.postToolUse ?? []).map(h => `⬇ ${h.matcher} → ${h.description ?? h.command}`),
        ...(spec?.hooks?.stop ?? []).map(h => `■ stop → ${h.description ?? h.command}`),
    ];

    return (
        <>
            {/* Identity row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Ionicons name="person-circle-outline" size={18} color="#AF52DE" />
                <Text style={{ fontSize: 15, fontWeight: '700', color: theme.colors.text, flex: 1 }} numberOfLines={1}>
                    {displayName}
                </Text>
                {genome.status === 'official' && (
                    <View style={{ backgroundColor: '#AF52DE22', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#AF52DE', fontWeight: '700' }}>OFFICIAL</Text>
                    </View>
                )}
                {genome.status === 'verified' && (
                    <Ionicons name="checkmark-circle" size={15} color={theme.colors.success} />
                )}
            </View>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginBottom: 12, marginLeft: 26 }}>
                {namespace}  ·  v{version}
            </Text>

            {/* Description */}
            {description ? (
                <>
                    <SectionLabel label="Description" />
                    <Text style={{ fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18, marginBottom: 12 }} numberOfLines={4}>
                        {description}
                    </Text>
                </>
            ) : null}

            {/* Configuration facts */}
            {facts.length > 0 && (
                <>
                    <Divider />
                    <SectionLabel label="Configuration" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {facts.map((fact, i) => (
                            <FactPill key={`${fact.label}-${i}`} label={fact.label} value={fact.value} />
                        ))}
                    </View>
                </>
            )}

            {/* Score */}
            {feedback?.avgScore != null && (
                <>
                    <Divider />
                    <SectionLabel label="Supervisor Score" />
                    <ScoreBar score={feedback.avgScore} />
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        {Object.entries({
                            delivery: feedback.dimensions?.delivery,
                            integrity: feedback.dimensions?.integrity,
                            efficiency: feedback.dimensions?.efficiency,
                        }).filter(([, v]) => v != null).map(([k, v]) => (
                            <View key={k} style={{ flex: 1, backgroundColor: theme.colors.groupped.background, borderRadius: 8, padding: 6, alignItems: 'center' }}>
                                <Text style={{ fontSize: 10, color: theme.colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{k}</Text>
                                <Text style={{ fontSize: 13, color: theme.colors.text, fontWeight: '700' }}>{(v as number).toFixed(0)}</Text>
                            </View>
                        ))}
                    </View>
                </>
            )}

            {/* Tags */}
            {tags.length > 0 && (
                <>
                    <Divider />
                    <SectionLabel label="Tags" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {tags.slice(0, 8).map((tag, i) => (
                            <TagPill key={i} tag={tag} />
                        ))}
                        {tags.length > 8 && (
                            <TagPill tag={`+${tags.length - 8}`} />
                        )}
                    </View>
                </>
            )}

            {/* Responsibilities */}
            {responsibilities.length > 0 && (
                <>
                    <Divider />
                    <SectionLabel label="Responsibilities" />
                    {responsibilities.slice(0, 4).map((r, i) => (
                        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                            <Text style={{ color: WG.accent, fontSize: 13, marginRight: 6, lineHeight: 18 }}>•</Text>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>{r}</Text>
                        </View>
                    ))}
                    {responsibilities.length > 4 && (
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                            +{responsibilities.length - 4} more…
                        </Text>
                    )}
                </>
            )}

            {/* Messaging & behavior */}
            {(messagingFacts.length > 0 || behaviorFacts.length > 0) && (
                <>
                    <Divider />
                    {messagingFacts.length > 0 && (
                        <>
                            <SectionLabel label="Messaging" />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {messagingFacts.map((fact, i) => (
                                    <FactPill key={`messaging-${fact.label}-${i}`} label={fact.label} value={fact.value} />
                                ))}
                            </View>
                        </>
                    )}
                    {behaviorFacts.length > 0 && (
                        <>
                            <View style={{ height: messagingFacts.length > 0 ? 12 : 0 }} />
                            <SectionLabel label="Behavior" />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {behaviorFacts.map((fact, i) => (
                                    <FactPill key={`behavior-${fact.label}-${i}`} label={fact.label} value={fact.value} />
                                ))}
                            </View>
                        </>
                    )}
                </>
            )}

            {/* Authorities */}
            {authorities.length > 0 && (
                <>
                    <Divider />
                    <SectionLabel label="Authorities" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {authorities.map((authority, i) => (
                            <TagPill key={i} tag={authority} tone="authority" />
                        ))}
                    </View>
                </>
            )}

            {/* Protocol */}
            {protocol.length > 0 && (
                <>
                    <Divider />
                    <SectionLabel label={`Protocol (${protocol.length} steps)`} />
                    {protocol.slice(0, 6).map((step, i) => (
                        <View key={i} style={{ flexDirection: 'row', marginBottom: 4 }}>
                            <Text style={{ color: WG.accent, fontSize: 12, marginRight: 6, minWidth: 18 }}>
                                {i + 1}.
                            </Text>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>
                                {step}
                            </Text>
                        </View>
                    ))}
                    {protocol.length > 6 && (
                        <Text style={{ color: theme.colors.textSecondary, fontSize: 11, marginTop: 2 }}>
                            +{protocol.length - 6} more steps…
                        </Text>
                    )}
                </>
            )}

            {/* Skills / MCP */}
            {(skills.length > 0 || mcpServers.length > 0) && (
                <>
                    <Divider />
                    {skills.length > 0 && (
                        <>
                            <SectionLabel label={`Skills (${skills.length})`} />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {skills.map((skill, i) => (
                                    <TagPill key={i} tag={skill} tone="code" monospace />
                                ))}
                            </View>
                        </>
                    )}
                    {mcpServers.length > 0 && (
                        <>
                            <View style={{ height: skills.length > 0 ? 12 : 0 }} />
                            <SectionLabel label={`MCP Servers (${mcpServers.length})`} />
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {mcpServers.map((server, i) => (
                                    <TagPill key={i} tag={server} tone="code" monospace />
                                ))}
                            </View>
                        </>
                    )}
                </>
            )}

            {/* Hooks */}
            {hookEntries.length > 0 && (
                <>
                    <Divider />
                    <SectionLabel label="Hooks" />
                    {hookEntries.map((entry, i) => (
                        <Text key={i} style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 3, lineHeight: 16 }}>
                            {entry}
                        </Text>
                    ))}
                </>
            )}

            {/* Spawn/download stats */}
            {(genome.spawnCount > 0 || genome.starCount > 0) && (
                <>
                    <Divider />
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                        {genome.spawnCount > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="flash-outline" size={13} color={theme.colors.textSecondary} />
                                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{genome.spawnCount} spawns</Text>
                            </View>
                        )}
                        {genome.starCount > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Ionicons name="star-outline" size={13} color={theme.colors.textSecondary} />
                                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{genome.starCount} stars</Text>
                            </View>
                        )}
                    </View>
                </>
            )}

            {/* View in Marketplace CTA */}
            <View style={{ marginTop: 20 }}>
                <Pressable
                    onPress={onViewMarketplace}
                    style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        paddingVertical: 11,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: WG.accentBg,
                        backgroundColor: pressed ? WG.accentBg : 'transparent',
                        // @ts-ignore — web transition
                        transition: 'background-color 0.15s ease',
                    })}
                    accessibilityRole="button"
                    accessibilityLabel="View genome in Marketplace"
                >
                    <Ionicons name="open-outline" size={16} color={WG.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: WG.accent }}>View in Marketplace</Text>
                </Pressable>
            </View>
        </>
    );
}

/** Placeholder when no specId is available or genome couldn't be loaded. */
function GenomePlaceholder({ reason }: { reason: 'no-spec' | 'not-found' }) {
    const { theme } = useUnistyles();
    return (
        <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons
                name={reason === 'no-spec' ? 'help-circle-outline' : 'alert-circle-outline'}
                size={36}
                color={theme.colors.textSecondary}
            />
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 10 }}>
                {reason === 'no-spec' ? 'No genome assigned' : 'Genome not found'}
            </Text>
            <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 }}>
                {reason === 'no-spec'
                    ? 'This agent was spawned without a genome spec in the marketplace.'
                    : 'The genome may have been removed or is private.'}
            </Text>
        </View>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

function useResolvedAgentInfo(sessionId: string, specIdProp?: string | null) {
    const session = useSession(sessionId);
    const memberInfo = useMemberInfo(sessionId);

    const resolvedSpecId = specIdProp ?? memberInfo?.specId ?? null;
    const { genome, spec, loading } = useGenomeData(resolvedSpecId);
    const roleId = memberInfo?.roleId ?? (session?.metadata as any)?.roleId;
    const candidateId = memberInfo?.candidateId ?? (session?.metadata as any)?.candidateId ?? undefined;
    const rawDisplayName = memberInfo?.displayName;
    const agentDisplayName = resolveDisplayName(rawDisplayName, roleId, sessionId);
    const roleLabel = getRoleLabel(roleId);
    const isOnline = !!session?.active;
    const runtimeLabel = spec?.runtimeType ?? memberInfo?.runtimeType ?? session?.metadata?.flavor ?? undefined;
    const modelLabel = spec?.preferredModel ?? spec?.modelId ?? session?.metadata?.resolvedModel ?? undefined;
    const fallbackModel = spec?.fallbackModelId ?? session?.metadata?.fallbackModel ?? undefined;
    const providerLabel = spec?.modelProvider ?? undefined;
    const executionPlane = spec?.executionPlane ?? memberInfo?.executionPlane ?? session?.metadata?.executionPlane ?? undefined;
    const sourceLabel = genome?.namespace ?? spec?.namespace ?? undefined;
    const avatarId = resolvedSpecId ?? (session ? getSessionAvatarId(session) : sessionId);

    return {
        session,
        genome,
        spec,
        loading,
        candidateId,
        resolvedSpecId,
        roleId,
        agentDisplayName,
        roleLabel,
        isOnline,
        runtimeLabel,
        modelLabel,
        fallbackModel,
        providerLabel,
        executionPlane,
        sourceLabel,
        avatarId,
    };
}

function AgentInfoCardContent({
    sessionId,
    specId,
    onClose,
}: {
    sessionId: string;
    specId?: string | null;
    onClose: () => void;
}) {
    const router = useRouter();
    const { theme } = useUnistyles();
    const {
        genome,
        spec,
        loading,
        candidateId,
        resolvedSpecId,
        roleId,
        agentDisplayName,
        roleLabel,
        isOnline,
        runtimeLabel,
        modelLabel,
        fallbackModel,
        providerLabel,
        executionPlane,
        sourceLabel,
        avatarId,
    } = useResolvedAgentInfo(sessionId, specId);

    const handleViewMarketplace = React.useCallback(() => {
        if (genome?.id) {
            onClose();
            router.push(`/agents/${genome.id}` as any);
        }
    }, [genome?.id, onClose, router]);

    const facts = [
        runtimeLabel ? { label: 'Runtime', value: runtimeLabel.toUpperCase() } : null,
        modelLabel ? { label: 'Model', value: modelLabel } : null,
        providerLabel ? { label: 'Provider', value: providerLabel } : null,
        fallbackModel ? { label: 'Fallback', value: fallbackModel } : null,
        executionPlane ? { label: 'Plane', value: executionPlane } : null,
        sourceLabel ? { label: 'Source', value: sourceLabel } : null,
    ].filter((item): item is { label: string; value: string } => !!item);

    return (
        <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <View>
                    <Avatar id={avatarId} size={56} flavor={runtimeLabel ?? undefined} />
                    <View style={{
                        position: 'absolute',
                        bottom: -1,
                        right: -1,
                        width: 14,
                        height: 14,
                        borderRadius: 7,
                        backgroundColor: isOnline ? theme.colors.success : theme.colors.surfaceHighest,
                        borderWidth: 2,
                        borderColor: theme.colors.surface,
                    }} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.text }} numberOfLines={1}>
                        {agentDisplayName}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginTop: 3 }} numberOfLines={1}>
                        {isOnline ? 'Online' : 'Offline'}{roleLabel ? `  ·  ${roleLabel}` : ''}
                    </Text>
                    <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2, fontFamily: 'monospace' }} numberOfLines={1}>
                        {sessionId.slice(0, 8)}…{sessionId.slice(-8)}
                    </Text>
                </View>
            </View>

            {roleId || facts.length > 0 ? (
                <>
                    <SectionLabel label="Model Card" />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {facts.map((fact) => (
                            <FactPill key={`${fact.label}:${fact.value}`} label={fact.label} value={fact.value} />
                        ))}
                    </View>
                    <Divider />
                </>
            ) : null}

            {candidateId || resolvedSpecId ? (
                <>
                    <SectionLabel label="Internal Identity" />
                    <View style={{ gap: 8, marginBottom: 14 }}>
                        {candidateId ? (
                            <FactPill label="Candidate" value={candidateId} />
                        ) : null}
                        {resolvedSpecId ? (
                            <FactPill label="Spec ID" value={resolvedSpecId} />
                        ) : null}
                    </View>
                    <Divider />
                </>
            ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: WG.accent, letterSpacing: 0.8, textTransform: 'uppercase' }}>
                    Agent Genome
                </Text>
                {loading && (
                    <Ionicons name="hourglass-outline" size={12} color={theme.colors.textSecondary} />
                )}
            </View>

            {loading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>Loading genome…</Text>
                </View>
            ) : !resolvedSpecId ? (
                <GenomePlaceholder reason="no-spec" />
            ) : !genome ? (
                <GenomePlaceholder reason="not-found" />
            ) : (
                <GenomeDetails
                    genome={genome}
                    spec={spec}
                    onViewMarketplace={handleViewMarketplace}
                />
            )}
        </>
    );
}

function AgentInfoPopover({
    visible,
    sessionId,
    specId,
    onClose,
}: AgentInfoPanelProps) {
    const { theme } = useUnistyles();

    if (!visible) return null;

    return (
        <>
            <Pressable
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 119 }}
                onPress={onClose}
                accessibilityLabel="Close model card"
            />
            <View
                style={{
                    position: 'absolute',
                    top: 52,
                    right: 8,
                    width: 392,
                    maxWidth: 'calc(100% - 16px)' as any,
                    maxHeight: '78%',
                    zIndex: 120,
                }}
            >
                <View
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: theme.colors.divider,
                        shadowColor: '#000000',
                        shadowOffset: { width: 0, height: 14 },
                        shadowOpacity: 0.18,
                        shadowRadius: 28,
                        elevation: 14,
                        overflow: 'hidden',
                    }}
                >
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 12 }}>
                        <Pressable
                            onPress={onClose}
                            hitSlop={10}
                            style={({ pressed }) => ({
                                padding: 4,
                                borderRadius: 8,
                                backgroundColor: pressed ? theme.colors.surfaceHigh : 'transparent',
                            })}
                        >
                            <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                    <ScrollView
                        style={{ paddingHorizontal: 18 }}
                        contentContainerStyle={{ paddingBottom: 22 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <AgentInfoCardContent sessionId={sessionId} specId={specId} onClose={onClose} />
                    </ScrollView>
                </View>
            </View>
        </>
    );
}

export function AgentInfoPanel({ visible, sessionId, specId: specIdProp, onClose }: AgentInfoPanelProps) {
    const { theme } = useUnistyles();

    const slideAnim = React.useRef(new Animated.Value(500)).current;
    const fadeAnim = React.useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 65,
                    friction: 11,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 500,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [visible, slideAnim, fadeAnim]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            {/* Scrim */}
            <Animated.View
                style={{ flex: 1, backgroundColor: WG.overlay, opacity: fadeAnim }}
                // @ts-ignore — web pointer events
                pointerEvents={visible ? 'auto' : 'none'}
            >
                <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close panel" />
            </Animated.View>

            {/* Sheet */}
            <Animated.View
                style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: theme.colors.surface,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    borderTopWidth: 1,
                    borderTopColor: theme.colors.divider,
                    maxHeight: '85%',
                    transform: [{ translateY: slideAnim }],
                }}
            >
                {/* Drag handle */}
                <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
                    <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.colors.divider }} />
                </View>

                {/* Header row: close button */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 4 }}>
                    <Pressable
                        onPress={onClose}
                        hitSlop={12}
                        style={({ pressed }) => ({
                            padding: 4,
                            borderRadius: 8,
                            backgroundColor: pressed ? theme.colors.surfaceHigh : 'transparent',
                        })}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                    >
                        <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>

                <ScrollView
                    style={{ paddingHorizontal: 20 }}
                    contentContainerStyle={{ paddingBottom: 32 }}
                    showsVerticalScrollIndicator={false}
                >
                    <AgentInfoCardContent sessionId={sessionId} specId={specIdProp} onClose={onClose} />
                </ScrollView>
            </Animated.View>
        </Modal>
    );
}

/**
 * Convenience hook + button for adding an ℹ️ info button to any component
 * that needs to trigger an AgentInfoPanel.
 *
 * Usage:
 *   const { InfoButton, InfoPanelElement } = useAgentInfoButton({ sessionId });
 *   return (
 *     <View style={{ flexDirection: 'row' }}>
 *       {InfoButton}
 *       {InfoPanelElement}
 *     </View>
 *   );
 */
export function useAgentInfoButton({
    sessionId,
    specId,
    variant = 'sheet',
}: {
    sessionId: string;
    specId?: string | null;
    variant?: 'sheet' | 'popover';
}) {
    const [visible, setVisible] = React.useState(false);
    const { theme } = useUnistyles();

    const InfoButton = (
        <Pressable
            onPress={() => setVisible((previous) => !previous)}
            hitSlop={10}
            style={({ pressed }) => ({
                padding: 5,
                borderRadius: 8,
                backgroundColor: pressed ? `${WG.accent}22` : 'transparent',
                // @ts-ignore — web transition
                transition: 'background-color 0.15s ease',
            })}
            accessibilityRole="button"
            accessibilityLabel="View agent genome info"
        >
            <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
        </Pressable>
    );

    const InfoPanelElement = variant === 'popover'
        ? (
            <AgentInfoPopover
                visible={visible}
                sessionId={sessionId}
                specId={specId}
                onClose={() => setVisible(false)}
            />
        ) : (
            <AgentInfoPanel
                visible={visible}
                sessionId={sessionId}
                specId={specId}
                onClose={() => setVisible(false)}
            />
        );

    return { InfoButton, InfoPanelElement, setVisible };
}
