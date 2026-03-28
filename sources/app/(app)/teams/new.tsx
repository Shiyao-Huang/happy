import React from 'react';
import { View, ScrollView, TextInput, Pressable, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Text } from '@/components/ui/StyledText';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { trackAgentDeployed, trackTeamCreated } from '@/track';
import { t } from '@/text';
import { layout } from '@/utils/layout';
import { Modal } from '@/modal';
import { sync } from '@/sync/sync';
import { useAllSessions, storage, useAllMachines, useSetting } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { DEFAULT_KANBAN_BOARD, KanbanTeamMember, KanbanBoard, DEFAULT_TEAM_AGREEMENTS, DEFAULT_TEAM_ROLES, KanbanTeamRole } from '@/sync/kanbanTypes';
import { getRecentPathForMachine, updateRecentMachinePaths, getKnownPathsForMachine } from '@/utils/machinePaths';
import { findWorkspacePathProblem } from '@/utils/workspacePathGuard';
import { getLocalizedTeamRoles } from '@/team-config/i18n';
import { SidebarView } from '@/components/layout/SidebarView';
import { DESKTOP_BREAKPOINT } from '@/navigation/navigationConfig';
import { useEscapeAction } from '@/hooks/useEscapeAction';
import { goBackOrReturn } from '@/utils/returnNavigation';
import { fetchGenomeByName } from '@/utils/genomeHub';
import { randomUUID } from '@/utils/uuid';
import { isMachineOnline } from '@/utils/machineUtils';
import { getConcatenatedPathErrorMessage } from '@/utils/workingDirectory';

// Use localized team roles instead of hardcoded ones
const LOCALIZED_TEAM_ROLES = getLocalizedTeamRoles();
const ROLE_LIBRARY: Record<string, KanbanTeamRole> = LOCALIZED_TEAM_ROLES.reduce((acc, role) => {
    acc[role.id] = role;
    return acc;
}, {} as Record<string, KanbanTeamRole>);
const INITIAL_ROLE_COUNTS: Record<string, number> = LOCALIZED_TEAM_ROLES.reduce((acc, role) => {
    if (role.id === 'master') {
        acc[role.id] = 1;  // Master 是团队的核心协调者
    } else if (role.id === 'orchestrator') {
        acc[role.id] = 0;  // Orchestrator 与 Master 类似，默认不启用
    } else if (role.id === 'architect') {
        acc[role.id] = 1;
    } else if (role.id === 'implementer') {
        acc[role.id] = 1;
    } else if (role.id === 'qa-engineer') {
        acc[role.id] = 1;
    } else if (role.id === 'observer') {
        acc[role.id] = 1;
    } else {
        acc[role.id] = 0;
    }
    return acc;
}, {} as Record<string, number>);
import { useDesktopBridge, DesktopRoomMemberInput } from '@/desktop/useDesktopBridge';

type PromptAgentPreference = 'claude' | 'codex' | 'mixed';

const PROMPT_AGENT_PREFERENCE_LABELS: Record<PromptAgentPreference, string> = {
    claude: 'Claude Code',
    codex: 'Codex',
    mixed: 'Mixed',
};

const MANUAL_TEAM_COORDINATOR_ROLES = new Set([
    'master',
    'orchestrator',
    'project-manager',
    'product-owner',
]);

function buildTeamMemberSessionTag(teamId: string, memberId: string): string {
    return `team:${teamId}:member:${memberId}`;
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 100,
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    } as any,
    inputFocused: {
        borderColor: theme.colors.button.primary.background,
    },
    headerButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    headerButtonText: {
        fontSize: 17,
        fontWeight: '600',
        color: theme.colors.header.tint,
    },
    headerButtonDisabled: {
        opacity: 0.5,
    },
    sessionItem: {
        flexDirection: 'column', // Changed to column to accommodate role selector
        backgroundColor: theme.colors.surface,
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    sessionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sessionItemFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    sessionItemLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        borderBottomWidth: 0,
    },
    sessionInfo: {
        flex: 1,
        marginLeft: 12,
    },
    sessionPath: {
        fontSize: 14,
        color: theme.colors.text,
        fontWeight: '500',
    },
    sessionMeta: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: theme.colors.textSecondary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: theme.colors.button.primary.background,
        borderColor: theme.colors.button.primary.background,
    },
    roleSelector: {
        marginTop: 12,
        marginLeft: 36, // Indent to align with text
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    roleChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: theme.colors.groupped.background,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    roleChipSelected: {
        backgroundColor: theme.colors.button.primary.background,
        borderColor: theme.colors.button.primary.background,
    },
    roleChipText: {
        fontSize: 12,
        color: theme.colors.text,
    },
    roleChipTextSelected: {
        color: '#FFF',
        fontWeight: '600',
    },
    helperText: {
        fontSize: 13,
        color: theme.colors.textSecondary,
        marginTop: 8,
    },
    machineList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    machineItem: {
        flexGrow: 1,
        minWidth: 160,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 12,
        padding: 12,
        backgroundColor: theme.colors.surface,
    },
    machineItemSelected: {
        borderColor: theme.colors.button.primary.background,
        backgroundColor: theme.colors.groupped.background,
    },
    machineName: {
        fontSize: 15,
        fontWeight: '600',
        color: theme.colors.text,
    },
    machineMeta: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 4,
    },
    machineItemOffline: {
        opacity: 0.6,
    },
    machineMetaOffline: {
        color: theme.colors.textDestructive,
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
        backgroundColor: theme.colors.textDestructive,
    },
    agentChipGroup: {
        flexDirection: 'row',
        gap: 12,
    },
    agentChip: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        alignItems: 'center',
    },
    agentChipSelected: {
        borderColor: theme.colors.button.primary.background,
        backgroundColor: theme.colors.button.primary.background,
    },
    agentChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    agentChipTextSelected: {
        color: '#FFF',
    },
    inlineButton: {
        marginTop: 8,
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.divider,
    },
    inlineButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    pathDropdownToggle: {
        marginTop: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: theme.colors.surface,
    },
    pathDropdownToggleText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
    },
    pathDropdown: {
        marginTop: 8,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        borderRadius: 12,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
    },
    pathOption: {
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.divider,
    },
    pathOptionLast: {
        borderBottomWidth: 0,
    },
    pathOptionText: {
        fontSize: 13,
        color: theme.colors.text,
    },
    pathOptionSubText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    desktopMainPanel: {
        flex: 1,
        minHeight: 0,
        backgroundColor: theme.colors.groupped.background,
    },
    desktopHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        paddingHorizontal: 28,
        paddingVertical: 24,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    desktopHeaderCopy: {
        flex: 1,
        gap: 6,
    },
    desktopEyebrow: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: theme.colors.textSecondary,
    },
    desktopTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: theme.colors.text,
    },
    desktopSubtitle: {
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.textSecondary,
        maxWidth: 560,
    },
    desktopCreateButton: {
        minWidth: 110,
        paddingHorizontal: 18,
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.button.primary.background,
    },
    desktopCreateButtonDisabled: {
        opacity: 0.6,
    },
    desktopCreateButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#FFF',
    },
    desktopScrollView: {
        flex: 1,
    },
    desktopContentContainer: {
        width: '100%',
        alignSelf: 'center',
        paddingHorizontal: 28,
        paddingTop: 24,
        paddingBottom: 120,
    }
}));

const QUICK_TEMPLATES = [
    {
        id: 'content',
        emoji: '✍️',
        title: 'Content Studio',
        subtitle: 'Write, SEO, social',
        teamName: 'Content Production Team',
        prompt: 'Build a parallel content production team. A researcher finds trending topics, a writer drafts the article, an SEO specialist optimizes for search, and a social media agent prepares platform-specific copy. Deliver a complete content package ready to publish.',
    },
    {
        id: 'research',
        emoji: '🔍',
        title: 'Research Team',
        subtitle: 'Multi-source analysis',
        teamName: 'Research & Analysis Team',
        prompt: 'Create a parallel research team where multiple scout agents collect information from different sources simultaneously, an analyst consolidates findings, and a scribe produces a final report with source citations for every data point.',
    },
    {
        id: 'legal',
        emoji: '⚖️',
        title: 'Contract Review',
        subtitle: 'Parallel doc analysis',
        teamName: 'Legal Review Team',
        prompt: 'Set up a contract review team. Analyst agents review documents in parallel, identify clause deviations from standard templates, flag risk levels (high/medium/low), and produce a concise summary memo with key risks for final approval.',
    },
    {
        id: 'intelligence',
        emoji: '📊',
        title: 'Market Intel',
        subtitle: 'Competitor tracking',
        teamName: 'Competitive Intelligence Team',
        prompt: 'Build a market intelligence team that monitors competitors, industry news, and market trends. Deliver a daily briefing with actionable insights, new product launches, pricing changes, and significant developments requiring attention.',
    },
] as const;

export default function NewTeamScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const { width } = useWindowDimensions();
    const searchParams = useLocalSearchParams<{ machineId?: string | string[] }>();
    const allSessions = useAllSessions();
    const machines = useAllMachines();
    const recentMachinePaths = useSetting('recentMachinePaths');
    const lastUsedAgent = useSetting('lastUsedAgent');
    const { bridge: desktopBridge } = useDesktopBridge();

    // Filter only active sessions
    const activeSessions = React.useMemo(() => {
        return allSessions.filter(s => s.active);
    }, [allSessions]);

    // Lookup map for sessions
    const sessionLookup = React.useMemo(() => {
        return new Map(allSessions.map(s => [s.id, s]));
    }, [allSessions]);

    const [title, setTitle] = React.useState('');
    const [target, setTarget] = React.useState('');
    const [creationMode, setCreationMode] = React.useState<'manual' | 'prompt'>('manual');
    const [taskPrompt, setTaskPrompt] = React.useState('');    const [promptAgentPreference, setPromptAgentPreference] = React.useState<PromptAgentPreference>(() => {
        if (lastUsedAgent === 'codex') {
            return 'codex';
        }
        return 'claude';
    });
    const [roleCounts, setRoleCounts] = React.useState<Record<string, number>>(() => ({ ...INITIAL_ROLE_COUNTS }));
    // Track agent type per role (defaults to global agentType)
    const [roleAgentTypes, setRoleAgentTypes] = React.useState<Record<string, 'claude' | 'codex'>>({});

    const [selectedSessions, setSelectedSessions] = React.useState<Set<string>>(new Set());
    const [sessionRoles, setSessionRoles] = React.useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = React.useState(false);
    const [titleFocused, setTitleFocused] = React.useState(false);
    const [targetFocused, setTargetFocused] = React.useState(false);
    const [cwd, setCwd] = React.useState('');
    const [cwdEdited, setCwdEdited] = React.useState(false);
    const [agentBinary, setAgentBinary] = React.useState('');
    const preferredMachineId = React.useMemo(() => {
        const machineId = searchParams.machineId;
        if (Array.isArray(machineId)) {
            return machineId[0] ?? null;
        }
        return typeof machineId === 'string' && machineId.length > 0 ? machineId : null;
    }, [searchParams.machineId]);
    const getPreferredOrFallbackMachineId = React.useCallback(() => {
        if (preferredMachineId) {
            return preferredMachineId;
        }
        const machineList = Object.values(storage.getState().machines || {});
        const active = machineList.find((machine) => machine.active);
        return active?.id ?? (machineList[0]?.id ?? null);
    }, [preferredMachineId]);
    const [selectedMachineId, setSelectedMachineId] = React.useState<string | null>(() => getPreferredOrFallbackMachineId());
    const [promptMachineIds, setPromptMachineIds] = React.useState<string[]>(() => {
        const initialId = getPreferredOrFallbackMachineId();
        return initialId ? [initialId] : [];
    });
    const [agentType, setAgentType] = React.useState<'claude' | 'codex'>(() => {
        if (lastUsedAgent === 'codex' || lastUsedAgent === 'claude') {
            return lastUsedAgent;
        }
        return 'claude';
    });
    const [isPathDropdownOpen, setIsPathDropdownOpen] = React.useState(false);
    const [isPromptMachinePickerOpen, setIsPromptMachinePickerOpen] = React.useState(false);
    const isDesktopShell = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

    const defaultRoleId = 'implementer';
    const promptPrimaryMachineId = promptMachineIds[0] ?? null;
    const pathSourceMachineId = creationMode === 'prompt' ? promptPrimaryMachineId : selectedMachineId;

    const handleExitNewTeam = React.useCallback(() => {
        goBackOrReturn(router, undefined, '/teams');
    }, [router]);

    useEscapeAction(isDesktopShell, handleExitNewTeam);

    // Track if machine change was user-initiated (not from machines array refresh)
    const userChangedMachineRef = React.useRef(false);

    const handleMachineChange = React.useCallback((machineId: string | null) => {
        userChangedMachineRef.current = true;
        setSelectedMachineId(machineId);
    }, []);

    React.useEffect(() => {
        if (machines.length === 0) {
            setSelectedMachineId(preferredMachineId ?? null);
            return;
        }
        if (preferredMachineId && machines.some((machine) => machine.id === preferredMachineId)) {
            if (selectedMachineId !== preferredMachineId) {
                setSelectedMachineId(preferredMachineId);
                setIsPathDropdownOpen(false);
            }
            return;
        }
        if (selectedMachineId && machines.some(machine => machine.id === selectedMachineId)) {
            return;
        }
        // This is a fallback selection, not user-initiated
        const fallback = machines.find(machine => machine.active) ?? machines[0];
        setSelectedMachineId(fallback?.id ?? null);
        setIsPathDropdownOpen(false);
    }, [machines, preferredMachineId, selectedMachineId]);

    React.useEffect(() => {
        if (machines.length === 0) {
            setPromptMachineIds([]);
            return;
        }

        const availableMachineIds = new Set(machines.map((machine) => machine.id));
        const fallback = getPreferredOrFallbackMachineId();

        setPromptMachineIds((previous) => {
            const filtered = previous.filter((machineId) => availableMachineIds.has(machineId));
            if (filtered.length > 0) {
                return filtered;
            }
            return fallback ? [fallback] : [];
        });
    }, [machines, getPreferredOrFallbackMachineId]);

    // Only reset cwdEdited when user explicitly changes machine
    React.useEffect(() => {
        if (userChangedMachineRef.current) {
            setCwdEdited(false);
            userChangedMachineRef.current = false;
        }
    }, [selectedMachineId]);

    // Auto-suggest path when machine changes or on initial mount
    // NOTE: recentMachinePaths intentionally excluded from deps to prevent
    // overwriting user input when settings sync. Path is only auto-suggested
    // when machine changes or on initial mount (when cwdEdited is false).
    React.useEffect(() => {
        if (!pathSourceMachineId || cwdEdited) {
            return;
        }
        const suggestedPath = getRecentPathForMachine(pathSourceMachineId, recentMachinePaths);
        setCwd((prev) => (prev === suggestedPath ? prev : suggestedPath));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathSourceMachineId, cwdEdited]);

    const selectedMachine = React.useMemo(() => {
        if (!pathSourceMachineId) {
            return null;
        }
        return machines.find((machine) => machine.id === pathSourceMachineId) ?? null;
    }, [machines, pathSourceMachineId]);
    const availablePaths = React.useMemo(() => {
        return getKnownPathsForMachine(pathSourceMachineId, recentMachinePaths, 10);
    }, [pathSourceMachineId, recentMachinePaths]);
    const promptMachines = React.useMemo(() => {
        return promptMachineIds
            .map((machineId) => machines.find((machine) => machine.id === machineId))
            .filter((machine): machine is (typeof machines)[number] => Boolean(machine));
    }, [machines, promptMachineIds]);
    const addablePromptMachines = React.useMemo(() => {
        return machines.filter((machine) => !promptMachineIds.includes(machine.id));
    }, [machines, promptMachineIds]);

    const handleAgentTypeChange = React.useCallback((type: 'claude' | 'codex') => {
        setAgentType(type);
        sync.applySettings({ lastUsedAgent: type });
    }, []);

    const handleCwdChange = React.useCallback((value: string) => {
        setCwd(value);
        setCwdEdited(true);
    }, []);

    const handleUseSuggestedPath = React.useCallback(() => {
        if (!pathSourceMachineId) {
            return;
        }
        const suggested = getRecentPathForMachine(pathSourceMachineId, recentMachinePaths);
        setCwd(suggested);
        setCwdEdited(false);
        setIsPathDropdownOpen(false);
    }, [pathSourceMachineId, recentMachinePaths]);

    const handleSelectPath = React.useCallback((path: string) => {
        setCwd(path);
        setCwdEdited(true);
        setIsPathDropdownOpen(false);
    }, []);

    const handleAddPromptMachine = React.useCallback((machineId: string) => {
        setPromptMachineIds((previous) => previous.includes(machineId) ? previous : [...previous, machineId]);
        setIsPromptMachinePickerOpen(false);
    }, []);

    const handleRemovePromptMachine = React.useCallback((machineId: string) => {
        setPromptMachineIds((previous) => previous.filter((id) => id !== machineId));
        setIsPathDropdownOpen(false);
    }, []);

    const handleSetPromptPrimaryMachine = React.useCallback((machineId: string) => {
        setPromptMachineIds((previous) => {
            if (!previous.includes(machineId)) {
                return [machineId, ...previous];
            }
            return [machineId, ...previous.filter((id) => id !== machineId)];
        });
        setCwdEdited(false);
        setIsPathDropdownOpen(false);
    }, []);

    const toggleSession = React.useCallback((sessionId: string) => {
        setSelectedSessions(prev => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
                next.delete(sessionId);
                // Also remove role assignment
                setSessionRoles(prevRoles => {
                    const nextRoles = { ...prevRoles };
                    delete nextRoles[sessionId];
                    return nextRoles;
                });
            } else {
                next.add(sessionId);
                // Default role assignment
                setSessionRoles(prevRoles => ({
                    ...prevRoles,
                    [sessionId]: defaultRoleId
                }));
            }
            return next;
        });
    }, []);

    const setRole = React.useCallback((sessionId: string, roleId: string) => {
        setSessionRoles(prev => ({
            ...prev,
            [sessionId]: roleId
        }));
    }, []);

    const updateRoleCount = React.useCallback((roleId: string, delta: number) => {
        setRoleCounts(prev => {
            const current = prev[roleId] || 0;
            const next = Math.max(0, current + delta);
            return { ...prev, [roleId]: next };
        });
    }, []);

    const updateRoleAgentType = React.useCallback((roleId: string, type: 'claude' | 'codex') => {
        setRoleAgentTypes(prev => ({
            ...prev,
            [roleId]: type
        }));
    }, []);

    // Helper to get agent type for a specific role (falls back to global)
    const getRoleAgentType = React.useCallback((roleId: string): 'claude' | 'codex' => {
        return roleAgentTypes[roleId] ?? agentType;
    }, [roleAgentTypes, agentType]);

    const getMachineDisplayName = React.useCallback((machine: (typeof machines)[number]) => {
        return machine.metadata?.displayName || machine.metadata?.host || 'Machine';
    }, []);

    const sendManualKickoffMessage = React.useCallback(async (
        teamId: string,
        members: KanbanTeamMember[],
        goal: string
    ) => {
        const mentions = members
            .filter((member) => MANUAL_TEAM_COORDINATOR_ROLES.has(member.roleId))
            .map((member) => member.sessionId)
            .filter((sessionId): sessionId is string => typeof sessionId === 'string' && sessionId.length > 0);

        const content = [
            `User goal for this team: ${goal}`,
            '',
            'Coordinators: break this goal into concrete tasks, assign owners, and start execution now.',
        ].join('\n');

        await sync.sendTeamMessage({
            teamId,
            content,
            type: 'chat',
            mentions,
            metadata: {
                priority: 'high',
                kickoff: true,
            },
        });
    }, []);

    const handleSave = React.useCallback(async () => {
        if (isSaving) return;

        if (!title.trim()) {
            await Modal.alert(
                t('common.error'),
                'Please enter a team name'
            );
            return;
        }

        try {
            setIsSaving(true);
            const resolvedCwd = cwd.trim();
            const cwdProblem = resolvedCwd ? findWorkspacePathProblem(resolvedCwd) : null;
            const resolvedAgentBinary = creationMode === 'manual' ? agentBinary.trim() : '';
            const isPromptMode = creationMode === 'prompt';
            const machineIdForSpawn = isPromptMode ? promptPrimaryMachineId : selectedMachineId;
            const hasRequestedSpawns = isPromptMode ? (taskPrompt.trim().length > 0) : Object.values(roleCounts).some(c => c > 0);
            let seedSpawnFailureReason: string | null = null;
            let roomIdForNavigation: string | null = null;

            if (isPromptMode && !taskPrompt.trim()) {
                await Modal.alert(
                    t('common.error'),
                    'Please enter a task prompt for the team.'
                );
                return;
            }

            if (hasRequestedSpawns && !resolvedCwd) {
                await Modal.alert(
                    t('common.error'),
                    isPromptMode
                        ? 'Please provide a working directory for the team prompt.'
                        : 'Please provide a working directory for the auto-spawned agents.'
                );
                return;
            }

            if (cwdProblem) {
                await Modal.alert(
                    t('common.error'),
                    `Working directory is invalid.\n\n${cwdProblem}\n\nPlease choose exactly one path.`,
                );
                return;
            }

            if (isPromptMode && promptMachineIds.length === 0) {
                await Modal.alert(
                    t('common.error'),
                    'Please add at least one machine for the team prompt.'
                );
                return;
            }

            // 1. Prepare manually selected members
            const manualMembers: KanbanTeamMember[] = isPromptMode
                ? []
                : Array.from(selectedSessions).map((sessionId) => {
                    const session = sessionLookup.get(sessionId);
                    const summary = session?.metadata?.summary?.text;
                    return {
                        sessionId,
                        roleId: sessionRoles[sessionId] || defaultRoleId,
                        displayName: session?.metadata?.name || session?.metadata?.path || sessionId,
                        focusAreas: summary ? [summary] : undefined,
                    };
                });

            const spawnedMembers: KanbanTeamMember[] = [];
            let promptBootstrapStarted = false;
            const promptRuntimePreference = PROMPT_AGENT_PREFERENCE_LABELS[promptAgentPreference];
            const promptTaskRequest = isPromptMode ? [
                taskPrompt.trim(),
                '',
                'Team assembly inputs (guidance, not hard constraints):',
                '- Communicate with the user in the same language as the user input.',
                `- Preferred working directory: ${resolvedCwd || '(not provided)'}`,
                `- Runtime preference: ${promptRuntimePreference}`,
                '- Available machines:',
                ...promptMachines.map((machine, index) => {
                    const roleLabel = index === 0 ? 'primary seed machine' : 'additional machine';
                    return `  - ${roleLabel}: ${getMachineDisplayName(machine)} (${machine.active ? 'online' : 'offline'}${machine.metadata?.platform ? `, ${machine.metadata.platform}` : ''})`;
                }),
            ].join('\n') : '';

            const cwdValidationError = resolvedCwd ? getConcatenatedPathErrorMessage(resolvedCwd) : null;
            if (cwdValidationError) {
                await Modal.alert(t('common.error'), cwdValidationError);
                return;
            }

            if (hasRequestedSpawns && !desktopBridge) {
                if (!machineIdForSpawn) {
                    await Modal.alert(
                        t('common.error'),
                        isPromptMode
                            ? 'Please choose a primary machine to start the org-manager.'
                            : 'Please select a machine to run the auto-spawned agents.'
                    );
                    return;
                }

                const targetMachineCheck = storage.getState().machines[machineIdForSpawn];
                if (!targetMachineCheck || !isMachineOnline(targetMachineCheck)) {
                    await Modal.alert(
                        t('common.error'),
                        'The selected machine is offline. Please select an online machine or wait for the machine to come online.'
                    );
                    return;
                }
            }

            if (desktopBridge) {
                const desktopMembers: DesktopRoomMemberInput[] = manualMembers.map((m) => ({
                    id: m.sessionId,
                    name: m.displayName || m.sessionId,
                    type: 'session',
                    role: m.roleId === 'orchestrator' ? 'master' : 'executor',
                    transport: 'remote',
                    metadata: {
                        roleId: m.roleId
                    }
                }));

                const room = await desktopBridge.createRoom({
                    name: title.trim(),
                    description: target.trim(),
                    members: desktopMembers,
                    metadata: {
                        roleTemplates: ROLE_LIBRARY,
                        assignedRoles: sessionRoles,
                        target: target.trim()
                    }
                });

                roomIdForNavigation = room.id;

                if (hasRequestedSpawns) {
                    if (isPromptMode) {
                        const roleId = 'org-manager';
                        const agentTitle = 'Org-manager 1';
                        try {
                            const orgManagerGenome = await fetchGenomeByName('@official', 'org-manager').catch(() => null);
                            const memberId = randomUUID();
                            const sessionTag = buildTeamMemberSessionTag(room.id, memberId);
                            const sessionId = await desktopBridge.startAgentSession({
                                roomId: room.id,
                                title: agentTitle,
                                args: ['--session-tag', sessionTag],
                                env: {
                                    AHA_AGENT_ROLE: roleId,
                                    AHA_EXECUTION_PLANE: 'bypass',
                                    AHA_ROOM_ID: room.id,
                                    AHA_ROOM_NAME: title.trim(),
                                    AHA_TEAM_MEMBER_ID: memberId,
                                    AHA_AGENT_TYPE: promptAgentPreference === 'codex' ? 'codex' : 'claude',
                                    AHA_TASK_PROMPT: promptTaskRequest,
                                    ...(orgManagerGenome ? { AHA_SPEC_ID: orgManagerGenome.id } : {}),
                                },
                                cwd: resolvedCwd || undefined,
                            });
                            if (sessionId) {
                                promptBootstrapStarted = true;
                                trackAgentDeployed(sessionId, {
                                    source: 'team_create_desktop_bridge_prompt',
                                    team_id: room.id,
                                    role_id: roleId,
                                    runtime_type: promptAgentPreference === 'codex' ? 'codex' : 'claude',
                                });
                            }
                        } catch (error) {
                            console.error('Failed to auto-spawn org-manager:', error);
                        }
                    } else {
                        for (const [roleId, count] of Object.entries(roleCounts)) {
                            for (let i = 0; i < count; i++) {
                                try {
                                    const agentTitle = `${roleId.charAt(0).toUpperCase() + roleId.slice(1)} ${i + 1}`;
                                    const spawnRequestedAt = Date.now();
                                    const memberId = randomUUID();
                                    const sessionTag = buildTeamMemberSessionTag(room.id, memberId);
                                    const sessionId = await desktopBridge.startAgentSession({
                                        roomId: room.id,
                                        title: agentTitle,
                                        args: ['--session-tag', sessionTag],
                                        env: {
                                            AHA_AGENT_ROLE: roleId,
                                            AHA_ROOM_ID: room.id,
                                            AHA_ROOM_NAME: title.trim(),
                                            AHA_TEAM_MEMBER_ID: memberId,
                                            AHA_AGENT_TYPE: getRoleAgentType(roleId)
                                        },
                                        cwd: resolvedCwd || undefined,
                                        cliPath: resolvedAgentBinary || undefined
                                    });
                                    if (sessionId) {
                                        spawnedMembers.push({
                                            memberId,
                                            sessionId,
                                            sessionTag,
                                            roleId,
                                            displayName: agentTitle,
                                            lifecycle: {
                                                spawnRequestedAt,
                                            },
                                        });
                                        trackAgentDeployed(sessionId, {
                                            source: 'team_create_desktop_bridge',
                                            team_id: room.id,
                                            role_id: roleId,
                                            runtime_type: getRoleAgentType(roleId),
                                        });
                                    }
                                } catch (error) {
                                    console.error(`Failed to spawn agent ${roleId}:`, error);
                                }
                            }
                        }
                    }
                }
            }

            let artifactId: string;

            if (!desktopBridge) {
                artifactId = randomUUID();
                const board: KanbanBoard = JSON.parse(JSON.stringify(DEFAULT_KANBAN_BOARD));
                if (!board.team) {
                    board.team = {
                        members: [],
                        roles: DEFAULT_TEAM_ROLES,
                        agreements: DEFAULT_TEAM_AGREEMENTS
                    };
                }

                board.team.members = [...manualMembers];

                if (target.trim()) {
                    board.tasks.push({
                        id: 'team-goal',
                        title: `🎯 Team Goal: ${target.trim()}`,
                        description: 'This is the primary objective for this team.',
                        status: 'todo',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                }

                if (hasRequestedSpawns) {
                    const targetMachine = machineIdForSpawn ? storage.getState().machines[machineIdForSpawn] : null;

                    if (isPromptMode) {
                        const roleId = 'org-manager';
                        const agentTitle = 'Org-manager 1';
                        const memberId = randomUUID();
                        const sessionTag = buildTeamMemberSessionTag(artifactId, memberId);

                        if (targetMachine?.active && resolvedCwd) {
                            try {
                                // Resolve org-manager genome from hub so the agent loads its DNA
                                const orgManagerGenome = await fetchGenomeByName('@official', 'org-manager').catch(() => null);
                                const spawnedSessionId = await sync.spawnSessionOnMachine(targetMachine.id, {
                                    directory: resolvedCwd,
                                    agent: promptAgentPreference === 'codex' ? 'codex' : 'claude',
                                    sessionTag,
                                    teamId: artifactId,
                                    role: roleId,
                                    executionPlane: 'bypass',
                                    sessionName: agentTitle,
                                    sessionPath: resolvedCwd,
                                    ...(orgManagerGenome ? { specId: orgManagerGenome.id } : {}),
                                    env: {
                                        AHA_TEAM_MEMBER_ID: memberId,
                                        AHA_TASK_PROMPT: promptTaskRequest
                                    }
                                });
                                if (spawnedSessionId) {
                                    promptBootstrapStarted = true;
                                    trackAgentDeployed(spawnedSessionId, {
                                        source: 'team_create_remote_prompt',
                                        team_id: artifactId,
                                        role_id: roleId,
                                        runtime_type: promptAgentPreference === 'codex' ? 'codex' : 'claude',
                                        machine_id: targetMachine.id,
                                    });
                                } else {
                                    console.warn('Spawned org-manager but no sessionId was returned');
                                    seedSpawnFailureReason = 'Spawned org-manager but no sessionId was returned.';
                                }
                            } catch (spawnError) {
                                console.error('Failed to auto-spawn org-manager:', spawnError);
                                seedSpawnFailureReason = spawnError instanceof Error ? spawnError.message : 'Failed to auto-spawn org-manager.';
                            }
                        } else if (!targetMachine?.active) {
                            console.warn('Selected machine is offline; skipping auto-spawn.');
                            seedSpawnFailureReason = 'Selected machine is offline; skipping auto-spawn.';
                        }
                    } else {
                        for (const [roleId, count] of Object.entries(roleCounts)) {
                            // ── Phase 3-B Change 6: resolve specId for manual role spawn ──
                            let roleSpecId: string | undefined;
                            try {
                                const roleGenome = await fetchGenomeByName('@official', roleId);
                                roleSpecId = roleGenome?.id;
                            } catch { /* genome-hub unreachable — proceed without specId */ }

                            for (let i = 0; i < count; i++) {
                                try {
                                    const agentTitle = `${roleId.charAt(0).toUpperCase() + roleId.slice(1)} ${i + 1}`;
                                    const memberId = randomUUID();
                                    const sessionTag = buildTeamMemberSessionTag(artifactId, memberId);

                                    if (targetMachine?.active && resolvedCwd) {
                                        try {
                                            const spawnRequestedAt = Date.now();
                                            const spawnedSessionId = await sync.spawnSessionOnMachine(targetMachine.id, {
                                                directory: resolvedCwd,
                                                agent: getRoleAgentType(roleId),
                                                sessionTag,
                                                teamId: artifactId,
                                                role: roleId,
                                                sessionName: agentTitle,
                                                sessionPath: resolvedCwd,
                                                ...(roleSpecId ? { specId: roleSpecId } : {}),
                                                env: {
                                                    AHA_TEAM_MEMBER_ID: memberId,
                                                },
                                            });
                                            if (spawnedSessionId) {
                                                spawnedMembers.push({
                                                    memberId,
                                                    sessionId: spawnedSessionId,
                                                    sessionTag,
                                                    roleId,
                                                    displayName: agentTitle,
                                                    ...(roleSpecId ? { specId: roleSpecId } : {}),
                                                    lifecycle: {
                                                        spawnRequestedAt,
                                                    },
                                                });
                                                trackAgentDeployed(spawnedSessionId, {
                                                    source: 'team_create_remote',
                                                    team_id: artifactId,
                                                    role_id: roleId,
                                                    runtime_type: getRoleAgentType(roleId),
                                                    machine_id: targetMachine.id,
                                                });
                                            } else {
                                                console.warn(`Spawned agent ${roleId} but no sessionId was returned`);
                                            }
                                        } catch (spawnError) {
                                            console.error('Failed to auto-spawn:', spawnError);
                                        }
                                    } else if (!targetMachine?.active) {
                                        console.warn('Selected machine is offline; skipping auto-spawn.');
                                    }
                                } catch (error) {
                                    console.error(`Failed to spawn agent ${roleId}:`, error);
                                }
                            }
                        }
                    }
                }

                board.team.members = [...manualMembers, ...spawnedMembers];
                const updatedBody = JSON.stringify(board, null, 2);

                if (isPromptMode && hasRequestedSpawns && spawnedMembers.length === 0 && !promptBootstrapStarted) {
                    throw new Error(seedSpawnFailureReason || 'Failed to auto-spawn org-manager.');
                }

                await sync.registerTeam({
                    id: artifactId,
                    name: title.trim(),
                    ...(target.trim() ? { description: target.trim() } : {}),
                    board: JSON.parse(updatedBody) as KanbanBoard,
                });
                await sync.fetchArtifactWithBody(artifactId);

                if (manualMembers.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    for (const member of manualMembers) {
                        try {
                            const currentSession = storage.getState().sessions[member.sessionId];
                            if (currentSession && currentSession.metadata) {
                                await sync.updateSessionMetadata(member.sessionId, {
                                    ...currentSession.metadata,
                                    role: member.roleId,
                                    teamId: artifactId
                                });
                            }
                        } catch (error) {
                            console.warn(`Failed to update metadata for manual session ${member.sessionId}:`, error);
                        }
                    }
                }

                if (!isPromptMode && target.trim()) {
                    await sendManualKickoffMessage(artifactId, [...manualMembers, ...spawnedMembers], target.trim());
                }
            } else {
                const board: KanbanBoard = JSON.parse(JSON.stringify(DEFAULT_KANBAN_BOARD));
                if (!board.team) {
                    board.team = {
                        members: [],
                        roles: DEFAULT_TEAM_ROLES,
                        agreements: DEFAULT_TEAM_AGREEMENTS
                    };
                }
                board.team.members = [...manualMembers, ...spawnedMembers];
                if (roomIdForNavigation) {
                    board.roomId = roomIdForNavigation;
                }

                if (target.trim()) {
                    board.tasks.push({
                        id: 'team-goal',
                        title: `🎯 Team Goal: ${target.trim()}`,
                        description: 'This is the primary objective for this team.',
                        status: 'todo',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    });
                }

                const initialBody = JSON.stringify(board, null, 2);

                if (isPromptMode && hasRequestedSpawns && spawnedMembers.length === 0 && !promptBootstrapStarted) {
                    throw new Error(seedSpawnFailureReason || 'Failed to auto-spawn org-manager.');
                }

                const createdTeam = await sync.registerTeam({
                    id: roomIdForNavigation ?? undefined,
                    name: title.trim(),
                    ...(target.trim() ? { description: target.trim() } : {}),
                    board: JSON.parse(initialBody) as KanbanBoard,
                });
                artifactId = createdTeam.id;
                await sync.fetchArtifactWithBody(artifactId);

                for (const member of manualMembers) {
                    const session = sessionLookup.get(member.sessionId);
                    if (session && session.metadata) {
                        try {
                            await sync.updateSessionMetadata(member.sessionId, {
                                ...session.metadata,
                                role: member.roleId,
                                teamId: artifactId
                            });
                        } catch (error) {
                            console.warn(`Failed to update metadata for session ${member.sessionId}:`, error);
                        }
                    }
                }

                if (!isPromptMode && target.trim()) {
                    await sendManualKickoffMessage(artifactId, [...manualMembers, ...spawnedMembers], target.trim());
                }
            }

            if (hasRequestedSpawns) {
                await Modal.alert(
                    'Team Created',
                    isPromptMode
                        ? `Team "${title}" created. Org-manager bootstrap started and will assemble the team in the background.`
                        : `Team "${title}" created with ${spawnedMembers.length} new agents.`
                );
            }

            const totalAgents = Object.values(roleCounts).reduce((sum, count) => sum + count, 0);
            trackTeamCreated(creationMode, totalAgents, {
                team_id: artifactId,
                prompt_mode: isPromptMode,
                requested_spawns: hasRequestedSpawns,
                spawned_agent_count: spawnedMembers.length + (promptBootstrapStarted ? 1 : 0),
                manual_member_count: manualMembers.length,
                environment: desktopBridge ? 'desktop_bridge' : 'remote_sync',
            });

            if (resolvedCwd && machineIdForSpawn) {
                const updatedPaths = updateRecentMachinePaths(recentMachinePaths, machineIdForSpawn, resolvedCwd);
                sync.applySettings({ recentMachinePaths: updatedPaths });
            }

            if (roomIdForNavigation) {
                router.replace(`/teams/${artifactId}?roomId=${roomIdForNavigation}` as any);
            } else {
                router.replace(`/teams/${artifactId}` as any);
            }
        } catch (err) {
            console.error('Failed to create team:', err);
            await Modal.alert(
                t('common.error'),
                err instanceof Error ? err.message : 'Failed to create team'
            );
        } finally {
            setIsSaving(false);
        }
    }, [title, cwd, agentBinary, creationMode, promptPrimaryMachineId, selectedMachineId, taskPrompt, selectedSessions, sessionLookup, sessionRoles, defaultRoleId, desktopBridge, roleCounts, promptAgentPreference, promptMachines, getMachineDisplayName, target, router, getRoleAgentType, recentMachinePaths, isSaving, promptMachineIds]);

    const HeaderRight = React.useCallback(() => (
        <Pressable
            style={[styles.headerButton, isSaving && styles.headerButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
        >
            {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.header.tint} />
            ) : (
                <Text style={styles.headerButtonText}>
                    Create
                </Text>
            )}
        </Pressable>
    ), [handleSave, isSaving, styles]);

    const formContent = (
        <>
            <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('newTeam.teamNameLabel')}</Text>
                <TextInput
                    style={[
                        styles.input,
                        titleFocused && styles.inputFocused,
                        Platform.OS === 'web' && {
                            outlineStyle: 'none',
                            outline: 'none',
                            outlineWidth: 0,
                            outlineColor: 'transparent'
                        } as any
                    ]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Backend Team"
                    placeholderTextColor={theme.colors.input.placeholder}
                    onFocus={() => setTitleFocused(true)}
                    onBlur={() => setTitleFocused(false)}
                    editable={!isSaving}
                    returnKeyType="next"
                />
            </View>

            <View style={styles.inputGroup}>
                <Text style={styles.label}>{t('newTeam.creationModeLabel')}</Text>
                <View style={{ flexDirection: 'row', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.divider }}>
                    <Pressable
                        onPress={() => setCreationMode('manual')}
                        style={{
                            flex: 1,
                            paddingVertical: 12,
                            alignItems: 'center',
                            backgroundColor: creationMode === 'manual' ? theme.colors.button.primary.background : theme.colors.surface,
                            borderLeftWidth: 1,
                            borderLeftColor: theme.colors.divider,
                        }}
                    >
                        <Text style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: creationMode === 'manual' ? '#FFF' : theme.colors.text,
                        }}>{t('newTeam.modeManual')}</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => setCreationMode('prompt')}
                        style={{
                            flex: 1,
                            paddingVertical: 12,
                            alignItems: 'center',
                            backgroundColor: creationMode === 'prompt' ? theme.colors.button.primary.background : theme.colors.surface,
                            borderLeftWidth: 1,
                            borderLeftColor: theme.colors.divider,
                        }}
                    >
                        <Text style={{
                            fontSize: 14,
                            fontWeight: '600',
                            color: creationMode === 'prompt' ? '#FFF' : theme.colors.text,
                        }}>{t('newTeam.modePrompt')}</Text>
                    </Pressable>
                </View>
            </View>

            {creationMode === 'prompt' && (
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('newTeam.quickStartLabel')}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, paddingHorizontal: 16 }}>
                        <View style={{ flexDirection: 'row', gap: 10, paddingRight: 16 }}>
                            {QUICK_TEMPLATES.map(tpl => {
                                const localizedTitle = t(`newTeam.templates.${tpl.id}.title` as any, {} as any) || tpl.title;
                                const localizedSubtitle = t(`newTeam.templates.${tpl.id}.subtitle` as any, {} as any) || tpl.subtitle;
                                return (
                                    <Pressable
                                        key={tpl.id}
                                        onPress={() => {
                                            setTitle(tpl.teamName);
                                            setTaskPrompt(tpl.prompt);
                                            setCreationMode('prompt');
                                        }}
                                        style={{
                                            backgroundColor: theme.colors.surface,
                                            borderRadius: 12,
                                            borderWidth: 1,
                                            borderColor: theme.colors.divider,
                                            padding: 12,
                                            minWidth: 130,
                                            maxWidth: 150,
                                        }}
                                    >
                                        <Text style={{ fontSize: 22, marginBottom: 6 }}>{tpl.emoji}</Text>
                                        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.colors.text }}>{localizedTitle}</Text>
                                        <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 3 }}>{localizedSubtitle}</Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </ScrollView>
                </View>
            )}

            {creationMode === 'manual' && (
                <View style={styles.inputGroup}>
                    <Text style={styles.label}>{t('newTeam.teamGoalLabel')}</Text>
                    <TextInput
                        style={[
                            styles.input,
                            targetFocused && styles.inputFocused,
                            Platform.OS === 'web' && {
                                outlineStyle: 'none',
                                outline: 'none',
                                outlineWidth: 0,
                                outlineColor: 'transparent'
                            } as any
                        ]}
                        value={target}
                        onChangeText={setTarget}
                        placeholder="e.g. Build a new landing page"
                        placeholderTextColor={theme.colors.input.placeholder}
                        onFocus={() => setTargetFocused(true)}
                        onBlur={() => setTargetFocused(false)}
                        editable={!isSaving}
                        returnKeyType="next"
                    />
                </View>
            )}

            {creationMode === 'prompt' && (
                <>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('newTeam.taskPromptLabel')}</Text>
                        <TextInput
                            style={[
                                styles.input,
                                {
                                    minHeight: 120,
                                    textAlignVertical: 'top',
                                    paddingTop: 14,
                                },
                                Platform.OS === 'web' && {
                                    outlineStyle: 'none',
                                    outline: 'none',
                                    outlineWidth: 0,
                                    outlineColor: 'transparent'
                                } as any
                            ]}
                            value={taskPrompt}
                            onChangeText={setTaskPrompt}
                            placeholder="描述你的任务，AI 将自动组建团队..."
                            placeholderTextColor={theme.colors.input.placeholder}
                            multiline
                            editable={!isSaving}
                        />
                        <Text style={styles.helperText}>
                            Org-manager will mirror the user's language automatically and use the inputs below as team assembly guidance.
                        </Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('newTeam.agentTypeLabel')}</Text>
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            {(['claude', 'codex', 'mixed'] as const).map((option) => {
                                const isSelected = promptAgentPreference === option;
                                return (
                                    <Pressable
                                        key={option}
                                        style={[
                                            styles.agentChip,
                                            { flex: 1 },
                                            isSelected && styles.agentChipSelected
                                        ]}
                                        onPress={() => setPromptAgentPreference(option)}
                                    >
                                        <Text style={[
                                            styles.agentChipText,
                                            isSelected && styles.agentChipTextSelected
                                        ]}>
                                            {PROMPT_AGENT_PREFERENCE_LABELS[option]}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <Text style={styles.helperText}>
                            {t('newTeam.agentTypeHelperText')}
                        </Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('newTeam.machinesLabel')}</Text>
                        {promptMachines.length === 0 ? (
                            <Text style={styles.helperText}>
                                {t('newTeam.noMachinesHelperText')}
                            </Text>
                        ) : (
                            <>
                                <View style={styles.machineList}>
                                    {promptMachines.map((machine, index) => (
                                        <View
                                            key={machine.id}
                                            style={[
                                                styles.machineItem,
                                                styles.machineItemSelected,
                                                !machine.active && styles.machineItemOffline
                                            ]}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <View style={[
                                                    styles.statusDot,
                                                    machine.active ? styles.statusOnline : styles.statusOffline
                                                ]} />
                                                <Text style={styles.machineName}>
                                                    {getMachineDisplayName(machine)}
                                                </Text>
                                            </View>
                                            <Text style={[styles.machineMeta, !machine.active && styles.machineMetaOffline]}>
                                                {index === 0 ? 'Primary seed machine' : 'Additional machine'} • {machine.active ? 'Online' : 'Offline'}
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                                                {index > 0 && (
                                                    <Pressable
                                                        style={styles.inlineButton}
                                                        onPress={() => handleSetPromptPrimaryMachine(machine.id)}
                                                    >
                                                        <Text style={styles.inlineButtonText}>{t('newTeam.setPrimaryButton')}</Text>
                                                    </Pressable>
                                                )}
                                                {promptMachineIds.length > 1 && (
                                                    <Pressable
                                                        style={styles.inlineButton}
                                                        onPress={() => handleRemovePromptMachine(machine.id)}
                                                    >
                                                        <Text style={styles.inlineButtonText}>{t('newTeam.removeButton')}</Text>
                                                    </Pressable>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                                <Pressable
                                    style={[styles.inlineButton, { marginTop: 12 }]}
                                    onPress={() => setIsPromptMachinePickerOpen((previous) => !previous)}
                                    disabled={addablePromptMachines.length === 0}
                                >
                                    <Text style={styles.inlineButtonText}>
                                        {addablePromptMachines.length === 0
                                            ? 'No more machines to add'
                                            : isPromptMachinePickerOpen
                                                ? 'Hide machine list'
                                                : '+ Add existing machine'}
                                    </Text>
                                </Pressable>
                                {isPromptMachinePickerOpen && addablePromptMachines.length > 0 && (
                                    <View style={[styles.pathDropdown, { marginTop: 12 }]}>
                                        {addablePromptMachines.map((machine, index) => (
                                            <Pressable
                                                key={machine.id}
                                                style={[
                                                    styles.pathOption,
                                                    index === addablePromptMachines.length - 1 && styles.pathOptionLast
                                                ]}
                                                onPress={() => handleAddPromptMachine(machine.id)}
                                            >
                                                <Text style={styles.pathOptionText}>{getMachineDisplayName(machine)}</Text>
                                                <Text style={styles.pathOptionSubText}>
                                                    {machine.active ? 'Online' : 'Offline'}{machine.metadata?.platform ? ` • ${machine.metadata.platform}` : ''}
                                                </Text>
                                            </Pressable>
                                        ))}
                                    </View>
                                )}
                            </>
                        )}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>{t('newTeam.workingDirectoryLabel')}</Text>
                        <TextInput
                            style={[
                                styles.input,
                                Platform.OS === 'web' && { outlineStyle: 'none' } as any
                            ]}
                            value={cwd}
                            onChangeText={handleCwdChange}
                            placeholder="e.g. /Users/username/project"
                            placeholderTextColor={theme.colors.input.placeholder}
                            editable={!isSaving}
                        />
                        {selectedMachine && (
                            <Pressable style={styles.inlineButton} onPress={handleUseSuggestedPath}>
                                <Text style={styles.inlineButtonText}>{t('newTeam.useLastPathButton')}</Text>
                            </Pressable>
                        )}
                        {availablePaths.length > 0 && (
                            <>
                                <Pressable
                                    style={styles.pathDropdownToggle}
                                    onPress={() => setIsPathDropdownOpen(prev => !prev)}
                                >
                                    <Text style={styles.pathDropdownToggleText}>
                                        {isPathDropdownOpen ? t('newTeam.hideRecentPaths') : t('newTeam.chooseFromRecentPaths')}
                                    </Text>
                                    <Ionicons
                                        name={isPathDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                        size={16}
                                        color={theme.colors.textSecondary}
                                    />
                                </Pressable>
                                {isPathDropdownOpen && (
                                    <View style={styles.pathDropdown}>
                                        {availablePaths.map((path, index) => (
                                            <Pressable
                                                key={`${path}-${index}`}
                                                style={[
                                                    styles.pathOption,
                                                    index === availablePaths.length - 1 && styles.pathOptionLast
                                                ]}
                                                onPress={() => handleSelectPath(path)}
                                            >
                                                <Text style={styles.pathOptionText}>{path}</Text>
                                                {selectedMachine?.metadata?.homeDir === path && (
                                                    <Text style={styles.pathOptionSubText}>{t('newTeam.homeDirectoryLabel')}</Text>
                                                )}
                                            </Pressable>
                                        ))}
                                    </View>
                                )}
                            </>
                        )}
                        <Text style={styles.helperText}>
                            The first machine seeds org-manager. The directory and machine list are passed into the prompt as planning inputs.
                        </Text>
                    </View>
                </>
            )}

            {creationMode === 'manual' && (
                <>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Team Composition (Auto-Spawn)</Text>
                        <View style={{ backgroundColor: theme.colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: theme.colors.divider }}>
                            {LOCALIZED_TEAM_ROLES.map((role, index) => {
                                const count = roleCounts[role.id] || 0;
                                const currentAgentType = getRoleAgentType(role.id);
                                return (
                                    <View key={role.id} style={{ marginBottom: index === LOCALIZED_TEAM_ROLES.length - 1 ? 0 : 16 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <View style={{ flex: 1, marginRight: 16 }}>
                                                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 4 }}>{role.title}</Text>
                                                <Text style={{ fontSize: 13, color: theme.colors.textSecondary }} numberOfLines={2}>{role.summary}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.groupped.background, borderRadius: 8, padding: 4 }}>
                                                <Pressable
                                                    onPress={() => updateRoleCount(role.id, -1)}
                                                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: theme.colors.surface }}
                                                >
                                                    <Ionicons name="remove" size={20} color={theme.colors.text} />
                                                </Pressable>
                                                <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.text, minWidth: 24, textAlign: 'center' }}>
                                                    {count}
                                                </Text>
                                                <Pressable
                                                    onPress={() => updateRoleCount(role.id, 1)}
                                                    style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: theme.colors.surface }}
                                                >
                                                    <Ionicons name="add" size={20} color={theme.colors.text} />
                                                </Pressable>
                                            </View>
                                        </View>
                                        {count > 0 && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: 4 }}>
                                                <Text style={{ fontSize: 12, color: theme.colors.textSecondary, marginRight: 8 }}>
                                                    {t('sessionInfo.aiProvider')}:
                                                </Text>
                                                <View style={{ flexDirection: 'row', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: theme.colors.divider }}>
                                                    <Pressable
                                                        onPress={() => updateRoleAgentType(role.id, 'claude')}
                                                        style={{
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 6,
                                                            backgroundColor: currentAgentType === 'claude' ? theme.colors.button.primary.background : theme.colors.surface,
                                                        }}
                                                    >
                                                        <Text style={{
                                                            fontSize: 12,
                                                            fontWeight: '600',
                                                            color: currentAgentType === 'claude' ? '#FFF' : theme.colors.text,
                                                        }}>{ t('agentInput.agent.claude') }</Text>
                                                    </Pressable>
                                                    <Pressable
                                                        onPress={() => updateRoleAgentType(role.id, 'codex')}
                                                        style={{
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 6,
                                                            backgroundColor: currentAgentType === 'codex' ? theme.colors.button.primary.background : theme.colors.surface,
                                                            borderLeftWidth: 1,
                                                            borderLeftColor: theme.colors.divider,
                                                        }}
                                                    >
                                                        <Text style={{
                                                            fontSize: 12,
                                                            fontWeight: '600',
                                                            color: currentAgentType === 'codex' ? '#FFF' : theme.colors.text,
                                                        }}>{ t('agentInput.agent.codex') }</Text>
                                                    </Pressable>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>{t('newTeam.automationSettingsLabel')}</Text>
                        <View style={{ gap: 16 }}>
                            <View>
                                <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>{t('newTeam.machineLabel')}</Text>
                                {machines.length === 0 ? (
                                    <Text style={styles.helperText}>
                                        {t('newTeam.noMachinesSpawnHelperText')}
                                    </Text>
                                ) : (
                                    <View style={styles.machineList}>
                                        {machines.map(machine => {
                                            const isSelected = machine.id === selectedMachineId;
                                            return (
                                                <Pressable
                                                    key={machine.id}
                                                    onPress={() => handleMachineChange(machine.id)}
                                                    style={[
                                                        styles.machineItem,
                                                        isSelected && styles.machineItemSelected,
                                                        !machine.active && styles.machineItemOffline
                                                    ]}
                                                >
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                        <View style={[
                                                            styles.statusDot,
                                                            machine.active ? styles.statusOnline : styles.statusOffline
                                                        ]} />
                                                        <Text style={styles.machineName}>
                                                            {getMachineDisplayName(machine)}
                                                        </Text>
                                                    </View>
                                                    <Text style={[styles.machineMeta, !machine.active && styles.machineMetaOffline]}>
                                                        {machine.active ? 'Online' : 'Offline'} • {machine.metadata?.platform || 'unknown'}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>

                            <View>
                                <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>{t('newTeam.agentTypeSectionLabel')}</Text>
                                <View style={styles.agentChipGroup}>
                                    {(['claude', 'codex'] as const).map(type => {
                                        const isSelected = agentType === type;
                                        return (
                                            <Pressable
                                                key={type}
                                                style={[
                                                    styles.agentChip,
                                                    isSelected && styles.agentChipSelected
                                                ]}
                                                onPress={() => handleAgentTypeChange(type)}
                                            >
                                                <Text style={[
                                                    styles.agentChipText,
                                                    isSelected && styles.agentChipTextSelected
                                                ]}>
                                                    {type === 'claude' ? 'Claude' : 'Codex'}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            </View>

                            <View>
                                <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>{t('newTeam.workingDirectoryLabel')}</Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        Platform.OS === 'web' && { outlineStyle: 'none' } as any
                                    ]}
                                    value={cwd}
                                    onChangeText={handleCwdChange}
                                    placeholder="e.g. /Users/username/project"
                                    placeholderTextColor={theme.colors.input.placeholder}
                                    editable={!isSaving}
                                />
                                {selectedMachine && (
                                    <Pressable style={styles.inlineButton} onPress={handleUseSuggestedPath}>
                                        <Text style={styles.inlineButtonText}>{t('newTeam.useLastPathButton')}</Text>
                                    </Pressable>
                                )}
                                {availablePaths.length > 0 && (
                                    <>
                                        <Pressable
                                            style={styles.pathDropdownToggle}
                                            onPress={() => setIsPathDropdownOpen(prev => !prev)}
                                        >
                                            <Text style={styles.pathDropdownToggleText}>
                                                {isPathDropdownOpen ? 'Hide recent paths' : 'Choose from recent paths'}
                                            </Text>
                                            <Ionicons
                                                name={isPathDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                                size={16}
                                                color={theme.colors.textSecondary}
                                            />
                                        </Pressable>
                                        {isPathDropdownOpen && (
                                            <View style={styles.pathDropdown}>
                                                {availablePaths.map((path, index) => (
                                                    <Pressable
                                                        key={`${path}-${index}`}
                                                        style={[
                                                            styles.pathOption,
                                                            index === availablePaths.length - 1 && styles.pathOptionLast
                                                        ]}
                                                        onPress={() => handleSelectPath(path)}
                                                    >
                                                        <Text style={styles.pathOptionText}>{path}</Text>
                                                        {selectedMachine?.metadata?.homeDir === path && (
                                                            <Text style={styles.pathOptionSubText}>{t('newTeam.homeDirectoryLabel')}</Text>
                                                        )}
                                                    </Pressable>
                                                ))}
                                            </View>
                                        )}
                                    </>
                                )}
                                <Text style={styles.helperText}>
                                    Required for auto-spawned agents so they boot inside the right repository.
                                </Text>
                            </View>

                            <View>
                                <Text style={[styles.label, { fontSize: 11, marginBottom: 4 }]}>Agent Binary (Optional)</Text>
                                <TextInput
                                    style={[
                                        styles.input,
                                        Platform.OS === 'web' && { outlineStyle: 'none' } as any
                                    ]}
                                    value={agentBinary}
                                    onChangeText={setAgentBinary}
                                    placeholder="e.g. happy, codex, claudecode"
                                    placeholderTextColor={theme.colors.input.placeholder}
                                    editable={!isSaving}
                                />
                                <Text style={styles.helperText}>
                                    Used when spawning teammates through the desktop bridge.
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Add Existing Agents (Optional)</Text>
                        {activeSessions.length === 0 ? (
                            <Text style={{ color: theme.colors.textSecondary, fontStyle: 'italic' }}>
                                No active agents found.
                            </Text>
                        ) : (
                            activeSessions.map((session, index) => {
                                const isFirst = index === 0;
                                const isLast = index === activeSessions.length - 1;
                                const isSelected = selectedSessions.has(session.id);
                                const currentRole = sessionRoles[session.id] || defaultRoleId;

                                return (
                                    <View
                                        key={session.id}
                                        style={[
                                            styles.sessionItem,
                                            isFirst && styles.sessionItemFirst,
                                            isLast && styles.sessionItemLast
                                        ]}
                                    >
                                        <Pressable
                                            style={styles.sessionHeader}
                                            onPress={() => toggleSession(session.id)}
                                        >
                                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                                                {isSelected && (
                                                    <Ionicons name="checkmark" size={16} color="#FFF" />
                                                )}
                                            </View>
                                            <View style={styles.sessionInfo}>
                                                <Text style={styles.sessionPath} numberOfLines={1}>
                                                    {session.metadata?.path || 'Unknown Path'}
                                                </Text>
                                                <Text style={styles.sessionMeta}>
                                                    Last active: {new Date(session.updatedAt).toLocaleTimeString()}
                                                </Text>
                                            </View>
                                        </Pressable>

                                        {isSelected && (
                                            <View style={styles.roleSelector}>
                                                {(ROLE_LIBRARY ? Object.entries(ROLE_LIBRARY) : []).map(([roleId, roleDef]) => {
                                                    const isRoleSelected = currentRole === roleId;
                                                    return (
                                                        <Pressable
                                                            key={roleId}
                                                            style={[
                                                                styles.roleChip,
                                                                isRoleSelected && styles.roleChipSelected
                                                            ]}
                                                            onPress={() => setRole(session.id, roleId)}
                                                        >
                                                            <Text style={[
                                                                styles.roleChipText,
                                                                isRoleSelected && styles.roleChipTextSelected
                                                            ]}>
                                                                {roleDef.title}
                                                            </Text>
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        )}
                    </View>
                </>
            )}
        </>
    );

    const desktopMainPanel = (
        <View style={styles.desktopMainPanel}>
            <View style={styles.desktopHeader}>
                <View style={styles.desktopHeaderCopy}>
                    <Text style={styles.desktopEyebrow}>{t('newTeam.pageEyebrow')}</Text>
                    <Text style={styles.desktopTitle}>{t('newTeam.pageTitle')}</Text>
                    <Text style={styles.desktopSubtitle}>
                        {t('newTeam.pageSubtitle')}
                    </Text>
                </View>
                <Pressable
                    style={[styles.desktopCreateButton, isSaving && styles.desktopCreateButtonDisabled]}
                    onPress={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                        <Text style={styles.desktopCreateButtonText}>{t('newTeam.createButton')}</Text>
                    )}
                </Pressable>
            </View>

            <ScrollView
                style={styles.desktopScrollView}
                contentContainerStyle={[
                    styles.desktopContentContainer,
                    { maxWidth: Math.min(layout.maxWidth, 960) }
                ]}
            >
                {formContent}
            </ScrollView>
        </View>
    );

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: !isDesktopShell,
                    headerTitle: 'New Team',
                    headerRight: HeaderRight,
                }}
            />
            {isDesktopShell ? (
                <SidebarView mainPanel={desktopMainPanel} />
            ) : (
                <View style={styles.container}>
                    <ScrollView
                        style={styles.scrollView}
                        contentContainerStyle={[
                            styles.contentContainer,
                            { maxWidth: layout.maxWidth, alignSelf: 'center', width: '100%' }
                        ]}
                    >
                        {formContent}
                    </ScrollView>
                </View>
            )}
        </>
    );
}
