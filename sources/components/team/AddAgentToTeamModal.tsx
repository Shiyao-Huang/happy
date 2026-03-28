import * as React from 'react';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    TextInput,
    View,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/StyledText';
import { t } from '@/text';
import { sync } from '@/sync/sync';
import { useAllMachines, useSetting } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { getRecentPathForMachine, getKnownPathsForMachine, updateRecentMachinePaths } from '@/utils/machinePaths';
import { searchGenomes, parseFeedback, parseSpec, type GenomeRecord } from '@/utils/genomeHub';
import { getGenomeScore } from '@/utils/agentMarketplace';
import { randomUUID } from '@/utils/uuid';

function buildTeamMemberSessionTag(teamId: string, memberId: string): string {
    return `team:${teamId}:member:${memberId}`;
}

interface Props {
    teamId: string;
    onClose: () => void;
}

type Step = 'browse' | 'machine';

export const AddAgentToTeamModal = React.memo(function AddAgentToTeamModal({ teamId, onClose }: Props) {
    const { theme } = useUnistyles();
    const allMachines = useAllMachines();
    const recentPaths = useSetting('recentMachinePaths');

    const [step, setStep] = React.useState<Step>('browse');
    const [query, setQuery] = React.useState('');
    const [genomes, setGenomes] = React.useState<GenomeRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [selectedGenome, setSelectedGenome] = React.useState<GenomeRecord | null>(null);
    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(
        () => allMachines.find(isMachineOnline)?.id ?? null,
    );
    const [cwd, setCwd] = React.useState('');
    const [customPrompt, setCustomPrompt] = React.useState('');
    const [showPathDropdown, setShowPathDropdown] = React.useState(false);
    const [spawning, setSpawning] = React.useState(false);

    React.useEffect(() => {
        setCwd(getRecentPathForMachine(selectedMachineId, recentPaths));
    }, [selectedMachineId, recentPaths]);

    const knownPaths = React.useMemo(
        () => getKnownPathsForMachine(selectedMachineId, recentPaths),
        [selectedMachineId, recentPaths],
    );

    const selectedMachine = allMachines.find((m) => m.id === selectedMachineId) ?? null;
    const canSpawn = !!selectedGenome && !!selectedMachineId && !!cwd.trim() && selectedMachine && isMachineOnline(selectedMachine);

    // Fetch marketplace genomes
    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        searchGenomes({ q: query || undefined, limit: 50 })
            .then((result) => {
                if (!cancelled) {
                    setGenomes(result.genomes);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setGenomes([]);
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => { cancelled = true; };
    }, [query]);

    // Sort by score (rank)
    const sortedGenomes = React.useMemo(() => {
        return [...genomes].sort((a, b) => getGenomeScore(b) - getGenomeScore(a));
    }, [genomes]);

    const handleSelectGenome = React.useCallback((genome: GenomeRecord) => {
        setSelectedGenome(genome);
        setStep('machine');
    }, []);

    const handleSpawn = React.useCallback(async () => {
        if (!selectedGenome || !selectedMachineId || !cwd.trim()) return;

        setSpawning(true);
        try {
            const spec = parseSpec(selectedGenome.spec);
            const runtimeType = (spec?.runtimeType === 'codex' ? 'codex' : 'claude') as 'claude' | 'codex';
            const roleId = spec?.teamRole ?? spec?.baseRoleId ?? 'member';
            const memberId = randomUUID();
            const sessionTag = buildTeamMemberSessionTag(teamId, memberId);
            const sessionName = spec?.displayName?.trim() || selectedGenome.name;
            const trimmedCustomPrompt = customPrompt.trim();

            const sessionId = await sync.spawnSessionOnMachine(selectedMachineId, {
                directory: cwd.trim(),
                agent: runtimeType,
                sessionTag,
                teamId,
                role: roleId,
                specId: selectedGenome.id,
                sessionName,
                env: {
                    AHA_TEAM_MEMBER_ID: memberId,
                    ...(trimmedCustomPrompt ? { AHA_AGENT_PROMPT: trimmedCustomPrompt } : {}),
                },
            });

            if (!sessionId) {
                throw new Error('Spawn returned no session ID');
            }

            await sync.addTeamMember(teamId, sessionId, roleId, sessionName, {
                memberId,
                sessionTag,
                candidateId: `spec:${selectedGenome.id}`,
                specId: selectedGenome.id,
                runtimeType,
                ...(trimmedCustomPrompt ? { customPrompt: trimmedCustomPrompt } : {}),
            });

            const updatedPaths = updateRecentMachinePaths(recentPaths, selectedMachineId, cwd.trim());
            sync.applySettings({ recentMachinePaths: updatedPaths });
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            const { Modal: AppModal } = require('@/modal');
            AppModal.alert(t('common.error'), msg);
        } finally {
            setSpawning(false);
        }
    }, [customPrompt, cwd, onClose, recentPaths, selectedGenome, selectedMachineId, teamId]);

    const renderGenomeCard = (genome: GenomeRecord) => {
        const score = getGenomeScore(genome);
        const scoreColor = score >= 85 ? '#22c55e' : score >= 70 ? '#f59e0b' : score > 0 ? '#ef4444' : theme.colors.textSecondary;
        const spec = parseSpec(genome.spec);
        const roleId = spec?.teamRole ?? spec?.baseRoleId ?? '';

        return (
            <Pressable
                key={genome.id}
                style={[styles.genomeRow, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface }]}
                onPress={() => handleSelectGenome(genome)}
            >
                <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={[styles.genomeName, { color: theme.colors.text }]} numberOfLines={1}>
                            {spec?.displayName || genome.name}
                        </Text>
                        {roleId ? (
                            <View style={[styles.roleBadge, { backgroundColor: theme.colors.surfaceHigh }]}>
                                <Text style={[styles.roleBadgeText, { color: theme.colors.textSecondary }]}>
                                    {roleId}
                                </Text>
                            </View>
                        ) : null}
                    </View>
                    {genome.description ? (
                        <Text style={{ fontSize: 13, color: theme.colors.textSecondary }} numberOfLines={2}>
                            {genome.description}
                        </Text>
                    ) : null}
                </View>
                {score > 0 ? (
                    <View style={{ alignItems: 'center', gap: 2 }}>
                        <Ionicons name="star" size={14} color={scoreColor} />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: scoreColor }}>
                            {score}
                        </Text>
                    </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
            </Pressable>
        );
    };

    return (
        <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <Pressable style={styles.overlay} onPress={onClose}>
                <Pressable style={[styles.sheet, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]} onPress={() => {}}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.colors.text }]}>
                            {t('addAgent.title')}
                        </Text>
                        {step === 'browse' ? (
                            <TextInput
                                style={[styles.searchInput, {
                                    color: theme.colors.text,
                                    backgroundColor: theme.colors.surfaceHigh,
                                    borderColor: theme.colors.divider,
                                }]}
                                value={query}
                                onChangeText={setQuery}
                                placeholder={t('addAgent.searchPlaceholder')}
                                placeholderTextColor={theme.colors.input.placeholder}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        ) : selectedGenome ? (
                            <View style={[styles.selectedBadge, { backgroundColor: theme.colors.surfaceHigh }]}>
                                <Text style={[styles.selectedBadgeText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                    {parseSpec(selectedGenome.spec)?.displayName || selectedGenome.name}
                                </Text>
                            </View>
                        ) : null}
                    </View>

                    <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {step === 'browse' ? (
                            <>
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('addAgent.sortedByRank')}
                                </Text>
                                {loading ? (
                                    <ActivityIndicator style={{ marginTop: 20 }} />
                                ) : sortedGenomes.length === 0 ? (
                                    <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                                        {t('addAgent.noResults')}
                                    </Text>
                                ) : (
                                    <View style={styles.genomeList}>
                                        {sortedGenomes.map(renderGenomeCard)}
                                    </View>
                                )}
                            </>
                        ) : (
                            <>
                                {/* Custom context */}
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('agents.customContextLabel')}
                                </Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        styles.textArea,
                                        {
                                            color: theme.colors.text,
                                            backgroundColor: theme.colors.surfaceHigh,
                                            borderColor: theme.colors.divider,
                                        },
                                    ]}
                                    value={customPrompt}
                                    onChangeText={setCustomPrompt}
                                    placeholder={t('agents.customContextPlaceholder')}
                                    placeholderTextColor={theme.colors.input.placeholder}
                                    autoCapitalize="sentences"
                                    autoCorrect={false}
                                    multiline
                                    textAlignVertical="top"
                                />

                                {/* Machine selector */}
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('agents.selectMachine')}
                                </Text>
                                {allMachines.length === 0 ? (
                                    <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                                        {t('agents.noMachinesHint')}
                                    </Text>
                                ) : (
                                    <View style={styles.machineList}>
                                        {allMachines.map((machine) => {
                                            const online = isMachineOnline(machine);
                                            const selected = machine.id === selectedMachineId;
                                            return (
                                                <Pressable
                                                    key={machine.id}
                                                    style={[
                                                        styles.machineChip,
                                                        { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface },
                                                        selected && { borderColor: theme.colors.button.primary.background, backgroundColor: theme.colors.groupped.background },
                                                        !online && styles.machineChipOffline,
                                                    ]}
                                                    onPress={() => online ? setSelectedMachineId(machine.id) : undefined}
                                                >
                                                    <View style={[styles.statusDot, online ? styles.statusOnline : styles.statusOffline]} />
                                                    <Text style={{ fontSize: 14, fontWeight: '500', color: theme.colors.text }} numberOfLines={1}>
                                                        {machine.metadata?.displayName ?? machine.metadata?.host ?? machine.id.slice(0, 8)}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* Directory */}
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('agents.workingDirectory')}
                                </Text>
                                <TextInput
                                    style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceHigh, borderColor: theme.colors.divider }]}
                                    value={cwd}
                                    onChangeText={(v) => { setCwd(v); setShowPathDropdown(false); }}
                                    placeholder={t('agents.directoryPlaceholder')}
                                    placeholderTextColor={theme.colors.input.placeholder}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                                {knownPaths.length > 0 ? (
                                    <>
                                        <Pressable
                                            style={[styles.dropdownToggle, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}
                                            onPress={() => setShowPathDropdown((v) => !v)}
                                        >
                                            <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>
                                                Recent paths
                                            </Text>
                                            <Ionicons
                                                name={showPathDropdown ? 'chevron-up' : 'chevron-down'}
                                                size={14}
                                                color={theme.colors.textSecondary}
                                            />
                                        </Pressable>
                                        {showPathDropdown ? (
                                            <View style={[styles.dropdown, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface }]}>
                                                {knownPaths.map((p) => (
                                                    <Pressable
                                                        key={p}
                                                        style={[styles.dropdownItem, { borderBottomColor: theme.colors.divider }]}
                                                        onPress={() => { setCwd(p); setShowPathDropdown(false); }}
                                                    >
                                                        <Text style={{ fontSize: 14, color: theme.colors.text }} numberOfLines={1}>
                                                            {p}
                                                        </Text>
                                                    </Pressable>
                                                ))}
                                            </View>
                                        ) : null}
                                    </>
                                ) : null}
                            </>
                        )}
                    </ScrollView>

                    {/* Actions */}
                    <View style={[styles.footer, { borderTopColor: theme.colors.divider }]}>
                        <Pressable
                            style={[styles.btn, styles.btnCancel, { borderColor: theme.colors.divider }]}
                            onPress={step === 'browse' ? onClose : () => { setStep('browse'); setSelectedGenome(null); }}
                        >
                            <Text style={[styles.btnText, { color: theme.colors.text }]}>
                                {step === 'browse' ? t('common.cancel') : t('common.back')}
                            </Text>
                        </Pressable>
                        {step === 'machine' ? (
                            <Pressable
                                style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.colors.button.primary.background }, !canSpawn && styles.btnDisabled]}
                                onPress={canSpawn && !spawning ? handleSpawn : undefined}
                            >
                                {spawning ? (
                                    <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                                ) : (
                                    <>
                                        <Ionicons name="add-circle" size={14} color={theme.colors.button.primary.tint} style={{ marginRight: 6 }} />
                                        <Text style={[styles.btnText, { color: theme.colors.button.primary.tint }]}>
                                            {t('addAgent.spawn')}
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        ) : null}
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
});

const styles = StyleSheet.create((theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    sheet: {
        width: '100%',
        maxWidth: 520,
        borderRadius: 20,
        borderWidth: 1,
        maxHeight: '85%',
        overflow: 'hidden',
    },
    header: {
        padding: 20,
        paddingBottom: 12,
        gap: 10,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    searchInput: {
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        fontSize: 15,
    },
    selectedBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    selectedBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    body: {
        paddingHorizontal: 20,
        paddingBottom: 8,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: 16,
        marginBottom: 8,
    },
    hint: {
        fontSize: 13,
        fontStyle: 'italic',
        marginBottom: 4,
    },
    genomeList: {
        gap: 8,
    },
    genomeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    genomeName: {
        fontSize: 15,
        fontWeight: '600',
    },
    roleBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
    },
    roleBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    machineList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    machineChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
    },
    machineChipOffline: {
        opacity: 0.4,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusOnline: {
        backgroundColor: '#34C759',
    },
    statusOffline: {
        backgroundColor: '#999',
    },
    input: {
        height: 44,
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        fontSize: 15,
    },
    textArea: {
        height: 80,
        paddingTop: 12,
        textAlignVertical: 'top',
    },
    dropdownToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginTop: 8,
        borderRadius: 10,
        borderWidth: 1,
    },
    dropdown: {
        borderRadius: 10,
        borderWidth: 1,
        marginTop: 4,
        overflow: 'hidden',
    },
    dropdownItem: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 1,
    },
    footer: {
        flexDirection: 'row',
        gap: 10,
        padding: 20,
        paddingTop: 14,
        borderTopWidth: 1,
    },
    btn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
    },
    btnCancel: {
        borderWidth: 1,
    },
    btnPrimary: {
        flex: 1.5,
    },
    btnDisabled: {
        opacity: 0.4,
    },
    btnText: {
        fontSize: 15,
        fontWeight: '600',
    },
}));
