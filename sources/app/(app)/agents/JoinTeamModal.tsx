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
import { getTranslationSection, t } from '@/text';
import { sync } from '@/sync/sync';
import { useArtifacts, useAllMachines, useSetting } from '@/sync/storage';
import { isMachineOnline } from '@/utils/machineUtils';
import { getRecentPathForMachine, getKnownPathsForMachine, updateRecentMachinePaths } from '@/utils/machinePaths';
import { parseSpec } from '@/utils/genomeHub';
import type { GenomeRecord } from '@/utils/genomeHub';
import { randomUUID } from '@/utils/uuid';

function buildTeamMemberSessionTag(teamId: string, memberId: string): string {
    return `team:${teamId}:member:${memberId}`;
}

interface Props {
    genome: GenomeRecord;
    onClose: () => void;
    teamId?: string;
    teamName?: string;
    onJoined?: () => void;
}

type Step = 'team' | 'machine';

/**
 * Two-step modal for joining a genome agent to an existing team.
 * Step 1: Select team + optional custom context
 * Step 2: Select machine + working directory → spawn
 */
export const JoinTeamModal = React.memo(function JoinTeamModal({
    genome,
    onClose,
    teamId,
    teamName,
    onJoined,
}: Props) {
    const { theme } = useUnistyles();
    const allArtifacts = useArtifacts();
    const allMachines = useAllMachines();
    const recentPaths = useSetting('recentMachinePaths');

    const teams = React.useMemo(
        () => allArtifacts.filter((a) => a.type === 'team'),
        [allArtifacts],
    );
    const machines = allMachines;

    const spec = React.useMemo(() => parseSpec(genome.spec), [genome.spec]);
    const runtimeType = (spec?.runtimeType === 'codex' ? 'codex' : 'claude') as 'claude' | 'codex';
    const roleId = spec?.teamRole ?? spec?.baseRoleId ?? 'member';
    const roleTranslations = getTranslationSection('teamRoles') as Record<string, { title?: string; summary?: string }>;
    const roleTitle = roleTranslations[roleId]?.title || roleId;
    const roleSummary = roleTranslations[roleId]?.summary || '';
    const lockedTeamId = teamId ?? null;

    const [step, setStep] = React.useState<Step>('team');
    const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(lockedTeamId);
    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(
        () => machines.find(isMachineOnline)?.id ?? null,
    );
    const [cwd, setCwd] = React.useState('');
    const [customPrompt, setCustomPrompt] = React.useState('');
    const [showPathDropdown, setShowPathDropdown] = React.useState(false);
    const [spawning, setSpawning] = React.useState(false);

    // Update cwd when machine changes
    React.useEffect(() => {
        setCwd(getRecentPathForMachine(selectedMachineId, recentPaths));
    }, [selectedMachineId]);

    const knownPaths = React.useMemo(
        () => getKnownPathsForMachine(selectedMachineId, recentPaths),
        [selectedMachineId],
    );
    const selectedTeam = React.useMemo(() => {
        if (!selectedTeamId) return null;
        return teams.find((team) => team.id === selectedTeamId) ?? null;
    }, [selectedTeamId, teams]);
    const selectedTeamLabel = selectedTeam?.title || teamName || t('teams.untitledTeam');

    const selectedMachine = machines.find((m) => m.id === selectedMachineId) ?? null;
    const canSpawn = !!selectedMachineId && !!cwd.trim() && selectedMachine && isMachineOnline(selectedMachine);

    const handleNext = React.useCallback(() => {
        if (!selectedTeamId) return;
        setStep('machine');
    }, [selectedTeamId]);

    const handleJoin = React.useCallback(async () => {
        if (!selectedTeamId || !selectedMachineId || !cwd.trim()) return;

        setSpawning(true);
        try {
            const memberId = randomUUID();
            const sessionTag = buildTeamMemberSessionTag(selectedTeamId, memberId);
            const sessionName = spec?.displayName?.trim() || genome.name;
            const trimmedCustomPrompt = customPrompt.trim();

            const sessionId = await sync.spawnSessionOnMachine(selectedMachineId, {
                directory: cwd.trim(),
                agent: runtimeType,
                sessionTag,
                teamId: selectedTeamId,
                role: roleId,
                specId: genome.id,
                sessionName,
                env: {
                    AHA_TEAM_MEMBER_ID: memberId,
                    ...(trimmedCustomPrompt ? { AHA_AGENT_PROMPT: trimmedCustomPrompt } : {}),
                },
            });

            if (!sessionId) {
                throw new Error('Spawn returned no session ID');
            }

            await sync.addTeamMember(selectedTeamId, sessionId, roleId, sessionName, {
                memberId,
                sessionTag,
                candidateId: `spec:${genome.id}`,
                specId: genome.id,
                runtimeType,
                ...(trimmedCustomPrompt ? { customPrompt: trimmedCustomPrompt } : {}),
            });

            const updatedPaths = updateRecentMachinePaths(recentPaths, selectedMachineId, cwd.trim());
            sync.applySettings({ recentMachinePaths: updatedPaths });
            onJoined?.();
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            const { Modal: AppModal } = require('@/modal');
            AppModal.alert(t('common.error'), msg);
        } finally {
            setSpawning(false);
        }
    }, [customPrompt, cwd, genome, onClose, onJoined, recentPaths, roleId, runtimeType, selectedMachineId, selectedTeamId, spec?.displayName]);

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
                            {t('agents.joinTeamTitle')}
                        </Text>
                        <View style={[styles.genomeBadge, { backgroundColor: theme.colors.surfaceHigh }]}>
                            <Text style={[styles.genomeBadgeText, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                {genome.name}
                            </Text>
                        </View>
                    </View>

                    <ScrollView style={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        {step === 'team' ? (
                            <>
                                {/* Team selector */}
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('agents.selectTeam')}
                                </Text>
                                {lockedTeamId ? (
                                    <View style={styles.teamList}>
                                        <View
                                            style={[
                                                styles.teamRow,
                                                {
                                                    borderColor: theme.colors.button.primary.background,
                                                    backgroundColor: theme.colors.groupped.background,
                                                },
                                            ]}
                                        >
                                            <View style={[styles.radioOuter, { borderColor: theme.colors.button.primary.background }]}>
                                                <View style={[styles.radioInner, { backgroundColor: theme.colors.button.primary.background }]} />
                                            </View>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text style={[styles.teamName, { color: theme.colors.text }]} numberOfLines={1}>
                                                    {selectedTeamLabel}
                                                </Text>
                                                <Text style={[styles.hint, { color: theme.colors.textSecondary, marginBottom: 0 }]}>
                                                    Current team
                                                </Text>
                                            </View>
                                            <Ionicons name="lock-closed" size={14} color={theme.colors.textSecondary} />
                                        </View>
                                    </View>
                                ) : teams.length === 0 ? (
                                    <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                                        No teams found. Create a team first.
                                    </Text>
                                ) : (
                                    <View style={styles.teamList}>
                                        {teams.map((team) => {
                                            const selected = team.id === selectedTeamId;
                                            return (
                                                <Pressable
                                                    key={team.id}
                                                    style={[
                                                        styles.teamRow,
                                                        { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface },
                                                        selected && { borderColor: theme.colors.button.primary.background, backgroundColor: theme.colors.groupped.background },
                                                    ]}
                                                    onPress={() => setSelectedTeamId(team.id)}
                                                >
                                                    <View style={[styles.radioOuter, { borderColor: selected ? theme.colors.button.primary.background : theme.colors.divider }]}>
                                                        {selected ? (
                                                            <View style={[styles.radioInner, { backgroundColor: theme.colors.button.primary.background }]} />
                                                        ) : null}
                                                    </View>
                                                    <Text style={[styles.teamName, { color: theme.colors.text }]} numberOfLines={1}>
                                                        {team.title || t('teams.untitledTeam')}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                )}

                                {/* Built-in role */}
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('agents.builtInRole')}
                                </Text>
                                <View style={[styles.roleCard, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface }]}>
                                    <View style={styles.roleCardHeader}>
                                        <Text style={[styles.roleCardTitle, { color: theme.colors.text }]}>
                                            {roleTitle}
                                        </Text>
                                        <View style={[styles.roleBadge, { backgroundColor: theme.colors.surfaceHigh }]}>
                                            <Text style={[styles.roleBadgeText, { color: theme.colors.textSecondary }]}>
                                                {roleId}
                                            </Text>
                                        </View>
                                    </View>
                                    {roleSummary ? (
                                        <Text style={[styles.roleCardSummary, { color: theme.colors.textSecondary }]}>
                                            {roleSummary}
                                        </Text>
                                    ) : null}
                                </View>
                                <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                                    {t('agents.builtInRoleHint')}
                                </Text>

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
                                <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                                    {t('agents.customContextHint')}
                                </Text>
                            </>
                        ) : (
                            <>
                                {/* Machine selector */}
                                <Text style={[styles.label, { color: theme.colors.textSecondary }]}>
                                    {t('agents.selectMachine')}
                                </Text>
                                {machines.length === 0 ? (
                                    <Text style={[styles.hint, { color: theme.colors.textSecondary }]}>
                                        {t('agents.noMachinesHint')}
                                    </Text>
                                ) : (
                                    <View style={styles.machineList}>
                                        {machines.map((machine) => {
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
                                                    <Text style={[styles.machineName, { color: theme.colors.text }]} numberOfLines={1}>
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
                                            <Text style={[styles.dropdownToggleText, { color: theme.colors.textSecondary }]}>
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
                                                        <Text style={[styles.dropdownItemText, { color: theme.colors.text }]} numberOfLines={1}>
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
                            onPress={step === 'team' ? onClose : () => setStep('team')}
                        >
                            <Text style={[styles.btnText, { color: theme.colors.text }]}>
                                {step === 'team' ? t('common.cancel') : t('common.back')}
                            </Text>
                        </Pressable>
                        {step === 'team' ? (
                            <Pressable
                                style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.colors.button.primary.background }, !selectedTeamId && styles.btnDisabled]}
                                onPress={selectedTeamId ? handleNext : undefined}
                            >
                                <Text style={[styles.btnText, { color: theme.colors.button.primary.tint }]}>
                                    {t('common.continue')}
                                </Text>
                                <Ionicons name="chevron-forward" size={14} color={theme.colors.button.primary.tint} style={{ marginLeft: 4 }} />
                            </Pressable>
                        ) : (
                            <Pressable
                                style={[styles.btn, styles.btnPrimary, { backgroundColor: theme.colors.button.primary.background }, !canSpawn && styles.btnDisabled]}
                                onPress={canSpawn && !spawning ? handleJoin : undefined}
                            >
                                {spawning ? (
                                    <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                                ) : (
                                    <>
                                        <Ionicons name="people" size={14} color={theme.colors.button.primary.tint} style={{ marginRight: 6 }} />
                                        <Text style={[styles.btnText, { color: theme.colors.button.primary.tint }]}>
                                            {t('agents.joinTeam')}
                                        </Text>
                                    </>
                                )}
                            </Pressable>
                        )}
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
        maxWidth: 480,
        borderRadius: 20,
        borderWidth: 1,
        maxHeight: '85%',
        overflow: 'hidden',
    },
    header: {
        padding: 20,
        paddingBottom: 12,
        gap: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    genomeBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    genomeBadgeText: {
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
    teamList: {
        gap: 8,
    },
    teamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    teamName: {
        fontSize: 15,
        fontWeight: '500',
        flex: 1,
    },
    radioOuter: {
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    roleCard: {
        borderRadius: 14,
        borderWidth: 1,
        padding: 14,
        gap: 10,
    },
    roleCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    roleCardTitle: {
        fontSize: 15,
        fontWeight: '700',
        flex: 1,
    },
    roleCardSummary: {
        fontSize: 13,
        lineHeight: 18,
    },
    roleBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
    },
    roleBadgeText: {
        fontSize: 12,
        fontWeight: '600',
    },
    machineList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    machineChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        minWidth: 140,
        flex: 1,
    },
    machineChipOffline: {
        opacity: 0.5,
    },
    machineName: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        flexShrink: 0,
    },
    statusOnline: {
        backgroundColor: '#34C759',
    },
    statusOffline: {
        backgroundColor: theme.colors.textDestructive,
    },
    input: {
        borderRadius: 12,
        borderWidth: 1,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
    } as any,
    textArea: {
        minHeight: 110,
    },
    dropdownToggle: {
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    dropdownToggleText: {
        fontSize: 12,
        fontWeight: '600',
    },
    dropdown: {
        marginTop: 4,
        borderRadius: 10,
        borderWidth: 1,
        overflow: 'hidden',
    },
    dropdownItem: {
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    dropdownItemText: {
        fontSize: 13,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        padding: 20,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    btn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 13,
        borderRadius: 12,
    },
    btnCancel: {
        borderWidth: 1,
    },
    btnPrimary: {},
    btnDisabled: {
        opacity: 0.4,
    },
    btnText: {
        fontSize: 15,
        fontWeight: '600',
    },
}));
