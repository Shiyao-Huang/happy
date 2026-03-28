import React, { useCallback } from 'react';
import { View, Text, Animated, Platform, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { Item } from '@/components/ui/Item';
import { ItemGroup } from '@/components/ui/ItemGroup';
import { ItemList } from '@/components/ui/ItemList';
import { Avatar } from '@/components/avatar/Avatar';
import { useSession, useIsDataReady, useArtifact } from '@/sync/storage';
import { getSessionName, useSessionStatus, formatOSPlatform, formatPathRelativeToHome, getSessionAvatarId } from '@/utils/sessionUtils';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';
import { sessionKill, sessionDelete } from '@/sync/ops';
import { useUnistyles } from 'react-native-unistyles';
import { layout } from '@/utils/layout';
import { t } from '@/text';
import { isVersionSupported, MINIMUM_CLI_VERSION } from '@/utils/versionUtils';
import { CodeView } from '@/components/session/CodeView';
import { Session } from '@/sync/storageTypes';
import { useHappyAction } from '@/hooks/useHappyAction';
import { HappyError } from '@/utils/errors';
import { useEscapeAction } from '@/hooks/useEscapeAction';
import { getSingleRouteParam, goBackOrReturn } from '@/utils/returnNavigation';
import { fetchGenomeById, parseSpec, type GenomeSpec, type GenomeRecord } from '@/utils/genomeHub';
import { type KanbanBoard } from '@/sync/kanbanTypes';
import { listAgents } from '@/sync/apiAgents';
import { sync } from '@/sync/sync';

// Animated status dot component
function formatTokensCompact(tokens: number): string {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M tok`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k tok`;
    return `${tokens} tok`;
}

function StatusDot({ color, isPulsing, size = 8 }: { color: string; isPulsing?: boolean; size?: number }) {    const pulseAnim = React.useRef(new Animated.Value(1)).current;

    React.useEffect(() => {
        if (isPulsing) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 0.3,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isPulsing, pulseAnim]);

    return (
        <Animated.View
            style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity: pulseAnim,
                marginRight: 4,
            }}
        />
    );
}

// ─── Genome Info Panel ───────────────────────────────────────────────────────

function useGenomeForSession(session: Session): { genome: GenomeRecord | null; spec: GenomeSpec | null; loading: boolean } {
    const teamId = session.metadata?.teamId ?? '';
    const artifact = useArtifact(teamId);
    const [genome, setGenome] = React.useState<GenomeRecord | null>(null);
    const [loading, setLoading] = React.useState(false);

    // Path 1: team kanban board member specId
    const boardSpecId = React.useMemo(() => {
        if (!artifact?.body) return null;
        try {
            const board = JSON.parse(artifact.body) as KanbanBoard;
            const member = board.team?.members?.find(m => m.sessionId === session.id);
            return member?.specId ?? null;
        } catch {
            return null;
        }
    }, [artifact?.body, session.id]);

    React.useEffect(() => {
        let cancelled = false;

        const resolveSpecId = async (): Promise<string | null> => {
            // Path 1: team kanban board member specId
            if (boardSpecId) return boardSpecId;

            // Path 2: session.metadata.genomeId (set by daemon for standalone agents)
            const metaGenomeId = (session.metadata as any)?.genomeId as string | undefined;
            if (metaGenomeId) return metaGenomeId;

            // Path 3: listAgents fallback — find standalone agent by sessionId
            const creds = sync.getCredentials();
            if (!creds) return null;
            try {
                const { agents } = await listAgents(creds, { type: 'standalone', limit: 100 });
                const match = agents.find(a => a.sessionId === session.id);
                return match?.genomeId ?? null;
            } catch {
                return null;
            }
        };

        setLoading(true);
        resolveSpecId().then(specId => {
            if (cancelled) return;
            if (!specId) {
                setGenome(null);
                setLoading(false);
                return;
            }
            return fetchGenomeById(specId).then(g => {
                if (!cancelled) {
                    setGenome(g);
                    setLoading(false);
                }
            }).catch(() => {
                if (!cancelled) {
                    setGenome(null);
                    setLoading(false);
                }
            });
        }).catch(() => {
            if (!cancelled) {
                setGenome(null);
                setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [boardSpecId, session.id, session.metadata]);

    const spec = React.useMemo(() => {
        if (!genome?.spec) return null;
        return parseSpec(genome.spec);
    }, [genome]);

    return { genome, spec, loading };
}

function ExpandableText({ text, maxChars = 200, style }: { text: string; maxChars?: number; style?: object }) {
    const [expanded, setExpanded] = React.useState(false);
    const { theme } = useUnistyles();
    const needsTruncation = text.length > maxChars;

    return (
        <View>
            <Text style={[{ color: theme.colors.textSecondary, fontSize: 13, lineHeight: 18, ...Typography.default() }, style]}>
                {needsTruncation && !expanded ? `${text.slice(0, maxChars)}…` : text}
            </Text>
            {needsTruncation && (
                <TouchableOpacity onPress={() => setExpanded(e => !e)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#007AFF', fontSize: 13, ...Typography.default() }}>
                        {expanded ? 'Show less' : 'Show more'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function GenomeInfoPanel({ session }: { session: Session }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const { genome, spec, loading } = useGenomeForSession(session);

    const genomeId = genome?.id;
    const displayName = spec?.displayName ?? genome?.name ?? '—';
    const namespace = genome?.namespace ?? spec?.namespace ?? '—';
    const version = genome?.version ?? spec?.version;
    const avgScore = (genome as any)?.avgScore as number | undefined;

    return (
        <ItemGroup title="Agent Genome">
            {loading ? (
                <Item
                    title="Loading genome…"
                    icon={<Ionicons name="hourglass-outline" size={29} color={theme.colors.textSecondary} />}
                    showChevron={false}
                />
            ) : !genome ? (
                <Item
                    title="No genome assigned"
                    subtitle="This agent was spawned without a genome spec"
                    icon={<Ionicons name="help-circle-outline" size={29} color={theme.colors.textSecondary} />}
                    showChevron={false}
                />
            ) : (
                <>
                    {/* Identity */}
                    <Item
                        title={displayName}
                        subtitle={`${namespace}  •  v${version ?? '?'}`}
                        icon={<Ionicons name="person-circle-outline" size={29} color="#AF52DE" />}
                        showChevron={!!genomeId}
                        onPress={genomeId ? () => router.push(`/agents/${genomeId}`) : undefined}
                    />

                    {/* Supervisor score */}
                    {typeof avgScore === 'number' && (
                        <Item
                            title="Supervisor Score"
                            detail={`${avgScore.toFixed(0)} / 100`}
                            icon={<Ionicons name="star-outline" size={29} color={avgScore >= 75 ? '#30D158' : avgScore >= 50 ? '#FF9500' : '#FF3B30'} />}
                            showChevron={false}
                        />
                    )}

                    {/* Responsibilities */}
                    {spec?.responsibilities && spec.responsibilities.length > 0 && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase', ...Typography.default() }}>
                                Responsibilities
                            </Text>
                            {spec.responsibilities.slice(0, 5).map((r, i) => (
                                <View key={i} style={{ flexDirection: 'row', marginBottom: 3 }}>
                                    <Text style={{ color: theme.colors.textSecondary, fontSize: 13, marginRight: 6, ...Typography.default() }}>•</Text>
                                    <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1, lineHeight: 18, ...Typography.default() }}>{r}</Text>
                                </View>
                            ))}
                            {spec.responsibilities.length > 5 && (
                                <Text style={{ color: theme.colors.textSecondary, fontSize: 12, marginTop: 2, ...Typography.default() }}>
                                    +{spec.responsibilities.length - 5} more…
                                </Text>
                            )}
                        </View>
                    )}

                    {/* System Prompt (collapsed by default) */}
                    {spec?.systemPrompt && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase', ...Typography.default() }}>
                                System Prompt
                            </Text>
                            <ExpandableText text={spec.systemPrompt} maxChars={300} />
                        </View>
                    )}

                    {/* Allowed Tools */}
                    {spec?.allowedTools && spec.allowedTools.length > 0 && (
                        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
                            <Text style={{ color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase', ...Typography.default() }}>
                                Allowed Tools ({spec.allowedTools.length})
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {spec.allowedTools.map((tool, i) => (
                                    <View key={i} style={{ backgroundColor: theme.colors.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                                        <Text style={{ color: theme.colors.textSecondary, fontSize: 12, ...Typography.default(), fontFamily: 'monospace' }}>{tool}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* View full genome button */}
                    {genomeId && (
                        <Item
                            title="View Full Genome"
                            subtitle="Open genome detail page"
                            icon={<Ionicons name="open-outline" size={29} color="#007AFF" />}
                            onPress={() => router.push(`/agents/${genomeId}`)}
                        />
                    )}
                </>
            )}
        </ItemGroup>
    );
}

function InternalIdentityPanel({ session }: { session: Session }) {
    const teamId = session.metadata?.teamId ?? '';
    const artifact = useArtifact(teamId);
    const member = React.useMemo(() => {
        if (!artifact?.body) return null;
        try {
            const board = JSON.parse(artifact.body) as KanbanBoard;
            return board.team?.members?.find(m => m.sessionId === session.id) ?? null;
        } catch {
            return null;
        }
    }, [artifact?.body, session.id]);

    const candidateId = member?.candidateId ?? (session.metadata as any)?.candidateId ?? null;
    const specId = member?.specId ?? (session.metadata as any)?.genomeId ?? null;

    if (!candidateId && !specId) {
        return null;
    }

    return (
        <ItemGroup title="Internal Identity">
            {candidateId ? (
                <Item
                    title="Candidate ID"
                    subtitle={candidateId}
                    icon={<Ionicons name="git-branch-outline" size={29} color="#8E8E93" />}
                    showChevron={false}
                />
            ) : null}
            {specId ? (
                <Item
                    title="Spec ID"
                    subtitle={specId}
                    icon={<Ionicons name="finger-print-outline" size={29} color="#8E8E93" />}
                    showChevron={false}
                />
            ) : null}
        </ItemGroup>
    );
}

// ─── Main Session Info ────────────────────────────────────────────────────────

function SessionInfoContent({ session, returnTo }: { session: Session; returnTo?: string }) {
    const { theme } = useUnistyles();
    const router = useRouter();
    const devModeEnabled = __DEV__;
    const sessionName = getSessionName(session);
    const sessionStatus = useSessionStatus(session);
    const handleExitSessionInfo = useCallback(() => {
        goBackOrReturn(router, returnTo, `/session/${session.id}`);
    }, [returnTo, router, session.id]);

    // Check if CLI version is outdated
    const isCliOutdated = session.metadata?.version && !isVersionSupported(session.metadata.version, MINIMUM_CLI_VERSION);

    const handleCopySessionId = useCallback(async () => {
        if (!session) return;
        try {
            await Clipboard.setStringAsync(session.id);
            Modal.alert(t('common.success'), t('sessionInfo.happySessionIdCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('sessionInfo.failedToCopySessionId'));
        }
    }, [session]);

    const handleCopyMetadata = useCallback(async () => {
        if (!session?.metadata) return;
        try {
            await Clipboard.setStringAsync(JSON.stringify(session.metadata, null, 2));
            Modal.alert(t('common.success'), t('sessionInfo.metadataCopied'));
        } catch (error) {
            Modal.alert(t('common.error'), t('sessionInfo.failedToCopyMetadata'));
        }
    }, [session]);

    // Use HappyAction for archiving - it handles errors automatically
    const [, performArchive] = useHappyAction(async () => {
        const result = await sessionKill(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToArchiveSession'), false);
        }
        // Exit the archived session context entirely.
        if (returnTo) {
            handleExitSessionInfo();
            return;
        }
        router.back();
        router.back();
    });

    const handleArchiveSession = useCallback(() => {
        Modal.alert(
            t('sessionInfo.archiveSession'),
            t('sessionInfo.archiveSessionConfirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.archiveSession'),
                    style: 'destructive',
                    onPress: performArchive
                }
            ]
        );
    }, [performArchive]);

    // Use HappyAction for deletion - it handles errors automatically
    const [, performDelete] = useHappyAction(async () => {
        const result = await sessionDelete(session.id);
        if (!result.success) {
            throw new HappyError(result.message || t('sessionInfo.failedToDeleteSession'), false);
        }
        // Success - no alert needed, UI will update to show deleted state
    });

    const handleDeleteSession = useCallback(() => {
        Modal.alert(
            t('sessionInfo.deleteSession'),
            t('sessionInfo.deleteSessionWarning'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('sessionInfo.deleteSession'),
                    style: 'destructive',
                    onPress: performDelete
                }
            ]
        );
    }, [performDelete]);

    const formatDate = useCallback((timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    }, []);

    const handleCopyUpdateCommand = useCallback(async () => {
        const updateCommand = 'npm install -g kanban-coder@latest';
        try {
            await Clipboard.setStringAsync(updateCommand);
            Modal.alert(t('common.success'), updateCommand);
        } catch (error) {
            Modal.alert(t('common.error'), t('common.error'));
        }
    }, []);

    return (
        <>
            <ItemList>
                {/* Session Header */}
                <View style={{ maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }}>
                    <View style={{ alignItems: 'center', paddingVertical: 24, backgroundColor: theme.colors.surface, marginBottom: 8, borderRadius: 12, marginHorizontal: 16, marginTop: 16 }}>
                        <Avatar id={getSessionAvatarId(session)} size={80} monochrome={!sessionStatus.isConnected} flavor={session.metadata?.flavor} />
                        <Text style={{
                            fontSize: 20,
                            fontWeight: '600',
                            marginTop: 12,
                            textAlign: 'center',
                            color: theme.colors.text,
                            ...Typography.default('semiBold')
                        }}>
                            {sessionName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                            <StatusDot color={sessionStatus.statusDotColor} isPulsing={sessionStatus.isPulsing} size={10} />
                            <Text style={{
                                fontSize: 15,
                                color: sessionStatus.statusColor,
                                fontWeight: '500',
                                ...Typography.default()
                            }}>
                                {sessionStatus.statusText}
                            </Text>
                        </View>
                        {session.latestUsage && (() => {
                            const totalTok = session.latestUsage.inputTokens + session.latestUsage.outputTokens;
                            const cost = (session.latestUsage.inputTokens * 3 + session.latestUsage.outputTokens * 15) / 1_000_000;
                            return (
                                <Text style={{
                                    fontSize: 13,
                                    color: theme.colors.textSecondary,
                                    marginTop: 6,
                                    ...Typography.default(),
                                }}>
                                    {formatTokensCompact(totalTok)}{' · '}{t('sessionInfo.costUnit', { usd: cost })}
                                </Text>
                            );
                        })()}
                    </View>
                </View>

                {/* CLI Version Warning */}
                {isCliOutdated && (
                    <ItemGroup>
                        <Item
                            title={t('sessionInfo.cliVersionOutdated')}
                            subtitle={t('sessionInfo.updateCliInstructions')}
                            icon={<Ionicons name="warning-outline" size={29} color="#FF9500" />}
                            showChevron={false}
                            onPress={handleCopyUpdateCommand}
                        />
                    </ItemGroup>
                )}

                {/* Session Details */}
                <ItemGroup>
                    <Item
                        title={t('sessionInfo.happySessionId')}
                        subtitle={`${session.id.substring(0, 8)}...${session.id.substring(session.id.length - 8)}`}
                        icon={<Ionicons name="finger-print-outline" size={29} color="#007AFF" />}
                        onPress={handleCopySessionId}
                    />
                    {session.metadata?.claudeSessionId && (
                        <Item
                            title={t('sessionInfo.claudeCodeSessionId')}
                            subtitle={`${session.metadata.claudeSessionId.substring(0, 8)}...${session.metadata.claudeSessionId.substring(session.metadata.claudeSessionId.length - 8)}`}
                            icon={<Ionicons name="code-outline" size={29} color="#9C27B0" />}
                            onPress={async () => {
                                try {
                                    await Clipboard.setStringAsync(session.metadata!.claudeSessionId!);
                                    Modal.alert(t('common.success'), t('sessionInfo.claudeCodeSessionIdCopied'));
                                } catch (error) {
                                    Modal.alert(t('common.error'), t('sessionInfo.failedToCopyClaudeCodeSessionId'));
                                }
                            }}
                        />
                    )}
                    <Item
                        title={t('sessionInfo.connectionStatus')}
                        detail={sessionStatus.isConnected ? t('status.online') : t('status.offline')}
                        icon={<Ionicons name="pulse-outline" size={29} color={sessionStatus.isConnected ? "#34C759" : "#8E8E93"} />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.created')}
                        subtitle={formatDate(session.createdAt)}
                        icon={<Ionicons name="calendar-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.lastUpdated')}
                        subtitle={formatDate(session.updatedAt)}
                        icon={<Ionicons name="time-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                    <Item
                        title={t('sessionInfo.sequence')}
                        detail={session.seq.toString()}
                        icon={<Ionicons name="git-commit-outline" size={29} color="#007AFF" />}
                        showChevron={false}
                    />
                </ItemGroup>

                {/* Genome Info Panel — shown for team sessions with specId */}
                <GenomeInfoPanel session={session} />

                {/* Internal identity — debug/info layer only */}
                {devModeEnabled && <InternalIdentityPanel session={session} />}

                {/* Token Usage */}
                {session.latestUsage && (
                    <ItemGroup title={t('sessionInfo.usageSection')}>
                        <Item
                            title={t('sessionInfo.inputTokens')}
                            detail={t('sessionInfo.tokensUnit', { n: session.latestUsage.inputTokens })}
                            icon={<Ionicons name="arrow-up-circle-outline" size={29} color="#007AFF" />}
                            showChevron={false}
                        />
                        <Item
                            title={t('sessionInfo.outputTokens')}
                            detail={t('sessionInfo.tokensUnit', { n: session.latestUsage.outputTokens })}
                            icon={<Ionicons name="arrow-down-circle-outline" size={29} color="#34C759" />}
                            showChevron={false}
                        />
                        {session.latestUsage.cacheRead > 0 && (
                            <Item
                                title={t('sessionInfo.cacheRead')}
                                detail={t('sessionInfo.tokensUnit', { n: session.latestUsage.cacheRead })}
                                icon={<Ionicons name="flash-outline" size={29} color="#FF9500" />}
                                showChevron={false}
                            />
                        )}
                        {session.latestUsage.contextSize > 0 && (
                            <Item
                                title={t('sessionInfo.contextSize')}
                                detail={t('sessionInfo.tokensUnit', { n: session.latestUsage.contextSize })}
                                icon={<Ionicons name="resize-outline" size={29} color="#8E8E93" />}
                                showChevron={false}
                            />
                        )}
                        <Item
                            title={t('sessionInfo.estimatedCost')}
                            detail={t('sessionInfo.costUnit', { usd: (session.latestUsage.inputTokens * 3 + session.latestUsage.outputTokens * 15) / 1_000_000 })}
                            icon={<Ionicons name="cash-outline" size={29} color="#30D158" />}
                            showChevron={false}
                        />
                    </ItemGroup>
                )}

                {/* Quick Actions */}
                <ItemGroup title={t('sessionInfo.quickActions')}>
                    {session.metadata?.machineId && (
                        <Item
                            title={t('sessionInfo.viewMachine')}
                            subtitle={t('sessionInfo.viewMachineSubtitle')}
                            icon={<Ionicons name="server-outline" size={29} color="#007AFF" />}
                            onPress={() => router.push(`/machine/${session.metadata?.machineId}`)}
                        />
                    )}
                    {sessionStatus.isConnected && (
                        <Item
                            title={t('sessionInfo.archiveSession')}
                            subtitle={t('sessionInfo.archiveSessionSubtitle')}
                            icon={<Ionicons name="archive-outline" size={29} color="#FF3B30" />}
                            onPress={handleArchiveSession}
                        />
                    )}
                    {!sessionStatus.isConnected && !session.active && (
                        <Item
                            title={t('sessionInfo.deleteSession')}
                            subtitle={t('sessionInfo.deleteSessionSubtitle')}
                            icon={<Ionicons name="trash-outline" size={29} color="#FF3B30" />}
                            onPress={handleDeleteSession}
                        />
                    )}
                </ItemGroup>

                {/* Metadata */}
                {session.metadata && (
                    <ItemGroup title={t('sessionInfo.metadata')}>
                        <Item
                            title={t('sessionInfo.host')}
                            subtitle={session.metadata.host}
                            icon={<Ionicons name="desktop-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        <Item
                            title={t('sessionInfo.path')}
                            subtitle={formatPathRelativeToHome(session.metadata.path, session.metadata.homeDir)}
                            icon={<Ionicons name="folder-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        {session.metadata.version && (
                            <Item
                                title={t('sessionInfo.cliVersion')}
                                subtitle={session.metadata.version}
                                detail={isCliOutdated ? '⚠️' : undefined}
                                icon={<Ionicons name="git-branch-outline" size={29} color={isCliOutdated ? "#FF9500" : "#5856D6"} />}
                                showChevron={false}
                            />
                        )}
                        {session.metadata.os && (
                            <Item
                                title={t('sessionInfo.operatingSystem')}
                                subtitle={formatOSPlatform(session.metadata.os)}
                                icon={<Ionicons name="hardware-chip-outline" size={29} color="#5856D6" />}
                                showChevron={false}
                            />
                        )}
                        <Item
                            title={t('sessionInfo.aiProvider')}
                            subtitle={(() => {
                                const flavor = session.metadata.flavor || 'claude';
                                if (flavor === 'claude') return 'Claude';
                                if (flavor === 'gpt' || flavor === 'openai') return 'Codex';
                                if (flavor === 'gemini') return 'Gemini';
                                return flavor;
                            })()}
                            icon={<Ionicons name="sparkles-outline" size={29} color="#5856D6" />}
                            showChevron={false}
                        />
                        {session.metadata.hostPid && (
                            <Item
                                title={t('sessionInfo.processId')}
                                subtitle={session.metadata.hostPid.toString()}
                                icon={<Ionicons name="terminal-outline" size={29} color="#5856D6" />}
                                showChevron={false}
                            />
                        )}
                        {session.metadata.happyHomeDir && (
                            <Item
                                title={t('sessionInfo.happyHome')}
                                subtitle={formatPathRelativeToHome(session.metadata.happyHomeDir, session.metadata.homeDir)}
                                icon={<Ionicons name="home-outline" size={29} color="#5856D6" />}
                                showChevron={false}
                            />
                        )}
                        <Item
                            title={t('sessionInfo.copyMetadata')}
                            icon={<Ionicons name="copy-outline" size={29} color="#007AFF" />}
                            onPress={handleCopyMetadata}
                        />
                    </ItemGroup>
                )}

                {/* Agent State */}
                {session.agentState && (
                    <ItemGroup title={t('sessionInfo.agentState')}>
                        <Item
                            title={t('sessionInfo.controlledByUser')}
                            detail={session.agentState.controlledByUser ? t('common.yes') : t('common.no')}
                            icon={<Ionicons name="person-outline" size={29} color="#FF9500" />}
                            showChevron={false}
                        />
                        {session.agentState.requests && Object.keys(session.agentState.requests).length > 0 && (
                            <Item
                                title={t('sessionInfo.pendingRequests')}
                                detail={Object.keys(session.agentState.requests).length.toString()}
                                icon={<Ionicons name="hourglass-outline" size={29} color="#FF9500" />}
                                showChevron={false}
                            />
                        )}
                    </ItemGroup>
                )}

                {/* Activity */}
                <ItemGroup title={t('sessionInfo.activity')}>
                    <Item
                        title={t('sessionInfo.thinking')}
                        detail={session.thinking ? t('common.yes') : t('common.no')}
                        icon={<Ionicons name="bulb-outline" size={29} color={session.thinking ? "#FFCC00" : "#8E8E93"} />}
                        showChevron={false}
                    />
                    {session.thinking && (
                        <Item
                            title={t('sessionInfo.thinkingSince')}
                            subtitle={formatDate(session.thinkingAt)}
                            icon={<Ionicons name="timer-outline" size={29} color="#FFCC00" />}
                            showChevron={false}
                        />
                    )}
                </ItemGroup>

                {/* Raw JSON (Dev Mode Only) */}
                {devModeEnabled && (
                    <ItemGroup title="Raw JSON (Dev Mode)">
                        {session.agentState && (
                            <>
                                <Item
                                    title="Agent State"
                                    icon={<Ionicons name="code-working-outline" size={29} color="#FF9500" />}
                                    showChevron={false}
                                />
                                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                                    <CodeView
                                        code={JSON.stringify(session.agentState, null, 2)}
                                        language="json"
                                    />
                                </View>
                            </>
                        )}
                        {session.metadata && (
                            <>
                                <Item
                                    title="Metadata"
                                    icon={<Ionicons name="information-circle-outline" size={29} color="#5856D6" />}
                                    showChevron={false}
                                />
                                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                                    <CodeView
                                        code={JSON.stringify(session.metadata, null, 2)}
                                        language="json"
                                    />
                                </View>
                            </>
                        )}
                        {sessionStatus && (
                            <>
                                <Item
                                    title="Session Status"
                                    icon={<Ionicons name="analytics-outline" size={29} color="#007AFF" />}
                                    showChevron={false}
                                />
                                <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                                    <CodeView
                                        code={JSON.stringify({
                                            isConnected: sessionStatus.isConnected,
                                            statusText: sessionStatus.statusText,
                                            statusColor: sessionStatus.statusColor,
                                            statusDotColor: sessionStatus.statusDotColor,
                                            isPulsing: sessionStatus.isPulsing
                                        }, null, 2)}
                                        language="json"
                                    />
                                </View>
                            </>
                        )}
                        {/* Full Session Object */}
                        <Item
                            title="Full Session Object"
                            icon={<Ionicons name="document-text-outline" size={29} color="#34C759" />}
                            showChevron={false}
                        />
                        <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                            <CodeView
                                code={JSON.stringify(session, null, 2)}
                                language="json"
                            />
                        </View>
                    </ItemGroup>
                )}
            </ItemList>
        </>
    );
}

export default React.memo(() => {
    const { theme } = useUnistyles();
    const router = useRouter();
    const params = useLocalSearchParams<{ id: string; returnTo?: string }>();
    const id = getSingleRouteParam(params.id) || '';
    const returnTo = getSingleRouteParam(params.returnTo);
    const session = useSession(id);
    const isDataReady = useIsDataReady();

    useEscapeAction(Platform.OS === 'web', () => {
        goBackOrReturn(router, returnTo, `/session/${id}`);
    });

    // Handle three states: loading, deleted, and exists
    if (!isDataReady) {
        // Still loading data
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="hourglass-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.textSecondary, fontSize: 17, marginTop: 16, ...Typography.default('semiBold') }}>{t('common.loading')}</Text>
            </View>
        );
    }

    if (!session) {
        // Session has been deleted or doesn't exist
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="trash-outline" size={48} color={theme.colors.textSecondary} />
                <Text style={{ color: theme.colors.text, fontSize: 20, marginTop: 16, ...Typography.default('semiBold') }}>{t('errors.sessionDeleted')}</Text>
                <Text style={{ color: theme.colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center', paddingHorizontal: 32, ...Typography.default() }}>{t('errors.sessionDeletedDescription')}</Text>
            </View>
        );
    }

    return <SessionInfoContent session={session} returnTo={returnTo} />;
});
