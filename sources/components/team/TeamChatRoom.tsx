import React from 'react';
import { View, ScrollView, FlatList, TextInput, Pressable, KeyboardAvoidingView, Platform, Image, ActivityIndicator, Modal as RNModal, Dimensions } from 'react-native';
import { Text } from '@/components/ui/StyledText';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
    TeamMessage,
    SendTeamMessageRequest,
    canonicalizeTeamMentions,
    extractMentionTokens,
    type TeamMentionCandidate,
} from '@/sync/teamMessageTypes';
import { sync } from '@/sync/sync';
import { MarkdownView } from '../markdown/MarkdownView';
import { useRouter } from 'expo-router';
import { randomUUID } from '@/utils/uuid';
import { useActiveWord } from '@/components/autocomplete/useActiveWord';
import { useActiveSuggestions } from '@/components/autocomplete/useActiveSuggestions';
import { applySuggestion } from '@/components/autocomplete/applySuggestion';
import { AgentInputAutocomplete } from '@/components/session/AgentInputAutocomplete';
import {
  parseCommand,
  executeCreateTask,
  executeUpdateTask,
  executeAssignTask,
  executeCompleteTask,
  getCommandHelp,
  type TaskCommandResult,
  type ParsedCommand
} from '@/utils/teamCommandParser';
import { useTaskChatSync } from '@/hooks/useTaskChatSync';
import type { KanbanTask } from '@/sync/kanbanTypes';
import { parseTaskCommand, createTaskFromCommand } from '@/utils/taskHelpers';
import { extractTaskIds } from '@/utils/taskChatSync';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Modal } from '@/modal';
import { pushSessionRoute } from '@/utils/returnNavigation';
import { buildMentionChipAccessibilityLabel, buildMentionChipLabel, buildMentionFlowAccessibilityLabel, buildMentionFlowLabel } from '@/utils/teamMentionSummary';
import { trackTeamChatSent } from '@/track';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { appendTeamMessage, dedupeAndSortTeamMessages, isNearBottom, mergeTeamMessages } from './teamChatRoomList';

type TeamChatRoomVariant = 'default' | 'edzlf';
type TeamChatRoomIconName = keyof typeof Ionicons.glyphMap;

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    reconnectingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
        marginTop: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: theme.colors.warning + '18',
        borderWidth: 1,
        borderColor: theme.colors.warning + '40',
    },
    reconnectingBannerText: {
        fontSize: 13,
        fontWeight: '600',
        color: theme.colors.warning,
    },
    messageList: {
        flex: 1,
    },
    messageListContent: {
        padding: 16,
        paddingBottom: 24,
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 16,
        alignItems: 'flex-end', // Align avatars to bottom
    },
    myMessageRow: {
        flexDirection: 'row-reverse',
    },
    avatarContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: theme.colors.divider,
        marginRight: 8,
        marginBottom: 4, // Align with bubble bottom
        shadowColor: theme.colors.shadow.color || '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: theme.colors.shadow.opacity || 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    myAvatarContainer: {
        marginRight: 0,
        marginLeft: 8,
        backgroundColor: theme.colors.button.primary.background,
        borderColor: theme.colors.button.primary.background,
    },
    // 🆕 Online status indicator
    onlineIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.colors.success || '#10B981',
        borderWidth: 2,
        borderColor: theme.colors.surface,
        shadowColor: theme.colors.shadow.color || '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    avatarText: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    myAvatarText: {
        color: '#FFF',
    },
    messageBubbleContainer: {
        flex: 1,
        maxWidth: '75%',
    },
    messageBubble: {
        backgroundColor: theme.colors.surface,
        borderRadius: 20,
        padding: 12,
        borderBottomLeftRadius: 4,
        shadowColor: theme.colors.shadow.color || '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: theme.colors.shadow.opacity || 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    myMessageBubble: {
        borderRadius: 20,
        borderBottomRightRadius: 4,
        borderBottomLeftRadius: 20,
        overflow: 'hidden' as const,
    },
    senderName: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginBottom: 4,
        marginLeft: 40, // Align with bubble (avatar 32 + gap 8)
    },
    mySenderName: {
        alignSelf: 'flex-end',
        marginRight: 40,
        marginLeft: 0,
    },
    messageContent: {
        fontSize: 13,
        color: theme.colors.text,
        lineHeight: 20,
        fontWeight: '500',
    },
    myMessageContent: {
        color: '#FFFFFF',
        fontWeight: '500',
    },
    messageTime: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 6,
        alignSelf: 'flex-end',
        opacity: 0.8,
    },
    myMessageTime: {
        color: 'rgba(255,255,255,0.8)',
    },
    expandText: {
        fontSize: 13,
        marginTop: 8,
        fontWeight: '600',
        color: theme.colors.button.primary.background,
    },
    myExpandText: {
        color: '#FFFFFF',
        textDecorationLine: 'underline',
    },
    copiedIndicator: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        fontWeight: '600',
        marginTop: 6,
        marginLeft: 8,
    },
    myCopiedIndicator: {
        color: 'rgba(255,255,255,0.9)',
    },
    copyButton: {
        padding: 4,
        borderRadius: 4,
        opacity: 0.6,
    },
    associationPanel: {
        marginTop: 10,
        gap: 8,
    },
    associationSection: {
        gap: 6,
    },
    associationSectionLabel: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: theme.colors.textSecondary,
    },
    associationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 9,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.groupped.background,
    },
    associationCardMyMessage: {
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderColor: 'rgba(255,255,255,0.18)',
    },
    associationAvatar: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    associationMeta: {
        flex: 1,
        minWidth: 0,
    },
    associationName: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.text,
    },
    associationRole: {
        fontSize: 11,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
    mentionChip: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        marginBottom: 8,
        maxWidth: '88%',
    },
    mentionChipText: {
        fontSize: 11,
        fontWeight: '700',
    },
    systemMessage: {
        alignSelf: 'center',
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: 16,
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    systemMessageText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        fontStyle: 'italic',
    },
    inputContainer: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        paddingHorizontal: Platform.select({ web: 12, default: 10 }),
        paddingTop: 8,
        paddingBottom: Platform.select({ web: 10, default: 8 }),
    },
    unifiedInputPanel: {
        backgroundColor: theme.colors.input.background,
        borderRadius: Platform.select({ web: 16, default: 20 }),
        overflow: 'hidden',
        paddingTop: 2,
        paddingBottom: 8,
        paddingHorizontal: 8,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        paddingRight: 4,
        paddingVertical: 4,
        minHeight: 40,
    },
    input: {
        flex: 1,
        fontSize: Platform.select({ web: 14, default: 15 }),
        lineHeight: Platform.select({ web: 20, default: 22 }),
        color: theme.colors.input.text,
        minHeight: Platform.select({ web: 24, default: 26 }),
        maxHeight: Platform.select({ web: 112, default: 116 }),
        paddingTop: 0,
        paddingBottom: 0,
    } as any,
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 4,
        gap: 2,
    },
    actionButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonPressed: {
        opacity: 0.6,
    },
    helpPill: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 28,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: theme.colors.button.primary.background + '0D',
        gap: 4,
    },
    helpPillText: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.button.primary.background,
    },
    actionSpacer: {
        flex: 1,
    },
    sendButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonActive: {
        backgroundColor: theme.colors.button.primary.background,
    },
    sendButtonInactive: {
        backgroundColor: theme.colors.button.primary.disabled,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        opacity: 0.5,
    },
    emptyStateText: {
        fontSize: 15,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: 12,
    },
    // 🆕 历史消息选择器样式
    historyContainer: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        maxHeight: 200,
    },
    historyHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    historyTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: theme.colors.text,
    },
    historyList: {
        maxHeight: 150,
    },
    historyItem: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    historyItemPressed: {
        backgroundColor: theme.colors.groupped.background,
    },
    historyItemText: {
        fontSize: 14,
        color: theme.colors.text,
        lineHeight: 20,
    },
    // 🆕 Image message styles
    imageContainer: {
        borderRadius: 12,
        overflow: 'hidden',
        marginVertical: 4,
    },
    messageImage: {
        width: 200,
        height: 200,
        borderRadius: 12,
    },
    imageLoading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.groupped.background,
        borderRadius: 12,
    },
    // 🆕 Image preview container
    imagePreviewContainer: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    imagePreview: {
        width: 60,
        height: 60,
        borderRadius: 8,
    },
    imagePreviewInfo: {
        flex: 1,
    },
    imagePreviewText: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    imagePreviewSize: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    removeImageButton: {
        padding: 8,
    },
    uploadProgress: {
        height: 3,
        backgroundColor: theme.colors.divider,
        borderRadius: 2,
        marginTop: 6,
        overflow: 'hidden',
    },
    uploadProgressBar: {
        height: '100%',
        backgroundColor: theme.colors.button.primary.background,
        borderRadius: 2,
    },
    // 🆕 Clipboard paste prompt styles
    clipboardPrompt: {
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    clipboardPromptContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    clipboardPromptIcon: {
        marginRight: 10,
    },
    clipboardPromptText: {
        fontSize: 14,
        color: theme.colors.text,
        flex: 1,
    },
    clipboardPasteButton: {
        backgroundColor: theme.colors.button.primary.background,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
        marginLeft: 12,
    },
    clipboardPasteButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    clipboardDismissButton: {
        padding: 6,
        marginLeft: 8,
    },
}));

// Helper to get avatar initials or icon based on role
const getAvatarContent = (roleId?: string, displayName?: string) => {
    if (!roleId) {
        const name = displayName || '?';
        return name.substring(0, 2).toUpperCase();
    }

    const normalizedRole = ({
        master: 'orchestrator',
        builder: 'implementer',
        framer: 'architect',
        scout: 'researcher',
        scribe: 'observer',
        qa: 'qa-engineer',
        reviewer: 'observer',
        'agent-builder': 'agent-builder',
        'org-manager': 'org-manager',
        supervisor: 'supervisor',
        'help-agent': 'help-agent',
    } as const)[roleId] ?? roleId;

    if (normalizedRole === 'orchestrator') return '👑';
    if (normalizedRole === 'architect') return '🧭';
    if (normalizedRole === 'implementer') return '🛠️';
    if (normalizedRole === 'researcher') return '🔎';
    if (normalizedRole === 'qa-engineer') return '🧪';
    if (normalizedRole === 'observer') return '👁️';
    if (normalizedRole === 'agent-builder') return '🧬';
    if (normalizedRole === 'org-manager') return '🏛️';
    if (normalizedRole === 'supervisor') return '🔭';
    if (normalizedRole === 'help-agent') return '🛟';

    // Fallback to initials
    const name = displayName || normalizedRole || '?';
    return name.substring(0, 2).toUpperCase();
};

interface RoleVisual {
    avatarLabel?: string;
    avatarIcon?: TeamChatRoomIconName;
    avatarBackground: string;
    badgeLabel?: string;
    badgeBackground?: string;
    badgeTextColor?: string;
    dotColor?: string;
}

const getRoleVisual = (roleId?: string, displayName?: string): RoleVisual => {
    const roleMap = {
        master: 'orchestrator',
        builder: 'implementer',
        framer: 'architect',
        scout: 'researcher',
        scribe: 'observer',
        qa: 'qa-engineer',
        reviewer: 'observer',
        user: 'user',
        'agent-builder': 'agent-builder',
        'org-manager': 'org-manager',
        supervisor: 'supervisor',
        'help-agent': 'help-agent',
    } as const;
    const normalizedRole = roleId ? (roleMap[roleId as keyof typeof roleMap] ?? roleId) : 'user';

    if (normalizedRole === 'orchestrator') {
        return {
            avatarIcon: 'sparkles-outline',
            avatarBackground: '#C8860A',  // warm gold — the crown role
            badgeLabel: 'MASTER',
            badgeBackground: '#C8860A20',
            badgeTextColor: '#B27006',
            dotColor: '#C8860A',
        };
    }

    if (normalizedRole === 'implementer') {
        return {
            avatarIcon: 'hammer-outline',
            avatarBackground: '#E05C2A',  // vibrant orange-red — builder energy
            badgeLabel: 'IMPLEMENTER',
            badgeBackground: '#E05C2A20',
            badgeTextColor: '#C04820',
            dotColor: '#34C759',
        };
    }

    if (normalizedRole === 'architect') {
        return {
            avatarIcon: 'git-branch-outline',
            avatarBackground: '#4A6FD4',  // bright blue — system design
            badgeLabel: 'ARCHITECT',
            badgeBackground: '#4A6FD420',
            badgeTextColor: '#3A5BC0',
            dotColor: '#4A6FD4',
        };
    }

    if (normalizedRole === 'qa-engineer') {
        return {
            avatarIcon: 'flask-outline',
            avatarBackground: '#9B3DCA',  // vibrant purple — scientific testing
            badgeLabel: 'QA',
            badgeBackground: '#9B3DCA20',
            badgeTextColor: '#7B2DAA',
            dotColor: '#9B3DCA',
        };
    }

    if (normalizedRole === 'observer' || normalizedRole === 'researcher') {
        return {
            avatarIcon: 'eye-outline',
            avatarBackground: '#0EA5A0',  // bright teal — observation
            badgeLabel: normalizedRole === 'researcher' ? 'RESEARCH' : 'REVIEW',
            badgeBackground: '#0EA5A020',
            badgeTextColor: '#0A8580',
            dotColor: '#0EA5A0',
        };
    }

    if (normalizedRole === 'agent-builder') {
        return {
            avatarLabel: '🧬',
            avatarBackground: '#2DA44E',  // GitHub green — genome creation
            badgeLabel: 'BUILDER',
            badgeBackground: '#2DA44E20',
            badgeTextColor: '#1A8A38',
            dotColor: '#2DA44E',
        };
    }

    if (normalizedRole === 'org-manager') {
        return {
            avatarLabel: '🏛️',
            avatarBackground: '#1D6FA4',  // institutional blue — governance
            badgeLabel: 'ORG',
            badgeBackground: '#1D6FA420',
            badgeTextColor: '#145A88',
            dotColor: '#1D6FA4',
        };
    }

    if (normalizedRole === 'supervisor') {
        return {
            avatarLabel: '🔭',
            avatarBackground: '#6D5ACF',  // indigo — monitoring & oversight
            badgeLabel: 'SUPERVISOR',
            badgeBackground: '#6D5ACF20',
            badgeTextColor: '#5444B5',
            dotColor: '#6D5ACF',
        };
    }

    if (normalizedRole === 'help-agent') {
        return {
            avatarLabel: '🛟',
            avatarBackground: '#D4821A',  // warm amber — rescue & repair
            badgeLabel: 'HELP',
            badgeBackground: '#D4821A20',
            badgeTextColor: '#B06812',
            dotColor: '#D4821A',
        };
    }

    if (normalizedRole === 'user') {
        return {
            avatarIcon: 'person-outline',
            avatarBackground: '#4A7FAE',  // softer blue for user
            dotColor: '#4A7FAE',
        };
    }

    return {
        avatarLabel: getAvatarContent(normalizedRole, displayName),
        avatarBackground: '#5C7A8F',  // lighter default (was very dark #31485D)
        dotColor: '#34C759',
    };
};

interface TeamChatMember {
    member: { sessionId: string; displayName?: string; roleId?: string };
    session?: {
        active: boolean;
        updatedAt: number;
        metadata?: {
            role?: string;
            name?: string;
            machineId?: string;
        } | null;
    };
    role?: { title: string };
}

interface TeamChatAgentIdentity {
    sessionId: string;
    displayName: string;
    roleId?: string;
    roleLabel: string;
    isOnline: boolean;
}

// 🆕 Task Card Component for displaying task references in chat
interface TaskCardProps {
    task: KanbanTask;
    onPress?: () => void;
    styles: any;
}

const TaskCard = ({ task, onPress, styles }: TaskCardProps) => {
    const statusColors: Record<string, string> = {
        'todo': '#888',
        'in-progress': '#007AFF',
        'review': '#FF9500',
        'done': '#34C759',
        'blocked': '#FF3B30'
    };

    const statusColor = statusColors[task.status] || '#888';
    const statusLabels: Record<string, string> = {
        'todo': 'To Do',
        'in-progress': 'In Progress',
        'review': 'Review',
        'done': 'Done',
        'blocked': 'Blocked'
    };

    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: styles.messageBubble.backgroundColor,
                borderRadius: 12,
                padding: 12,
                marginTop: 8,
                borderWidth: 1,
                borderColor: statusColor,
                borderLeftWidth: 4,
                borderLeftColor: statusColor
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: styles.messageContent.color }}>
                    {task.title}
                </Text>
                <View style={{
                    backgroundColor: statusColor + '20',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 8
                }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: statusColor }}>
                        {statusLabels[task.status] || task.status}
                    </Text>
                </View>
            </View>
            {task.description && (
                <Text style={{ fontSize: 13, color: styles.messageContent.color, opacity: 0.8, marginTop: 4 }}>
                    {task.description.substring(0, 100)}
                    {task.description.length > 100 ? '...' : ''}
                </Text>
            )}
            {task.assigneeId && (
                <Text style={{ fontSize: 12, color: styles.messageTime.color, marginTop: 6 }}>
                    Assigned to: @{task.assigneeId.substring(0, 8)}
                </Text>
            )}
        </Pressable>
    );
};

interface MessageBubbleProps {
    message: TeamMessage;
    isMyMessage: boolean;
    styles: any;
    onAvatarPress: (sessionId: string) => void;
    resolveAgentIdentity: (sessionId: string, fallbackRole?: string, fallbackName?: string) => TeamChatAgentIdentity;
    variant: TeamChatRoomVariant;
    // 🆕 Task references support
    getTasksForMessage?: (messageId: string) => KanbanTask[];
}

const MessageBubbleInner = ({
    message,
    isMyMessage,
    styles,
    onAvatarPress,
    resolveAgentIdentity,
    variant,
    getTasksForMessage,
}: MessageBubbleProps) => {
    const { theme } = useUnistyles();
    const [expanded, setExpanded] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [imageLoading, setImageLoading] = React.useState(true);
    const imageHasLoadedRef = React.useRef(false);
    const [showFullImage, setShowFullImage] = React.useState(false);
    const [showAssociations, setShowAssociations] = React.useState(false);
    const singlePressTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastPressAtRef = React.useRef(0);
    const isEdzlf = variant === 'edzlf';
    const roleVisual = React.useMemo(() => {
        return getRoleVisual(message.fromRole, message.fromDisplayName);
    }, [message.fromDisplayName, message.fromRole]);
    const originAgent = React.useMemo(() => {
        if (!message.fromSessionId) {
            return null;
        }
        return resolveAgentIdentity(message.fromSessionId, message.fromRole, message.fromDisplayName);
    }, [message.fromDisplayName, message.fromRole, message.fromSessionId, resolveAgentIdentity]);
    const senderLabel = originAgent?.displayName || message.fromDisplayName || message.fromSessionId?.substring(0, 8) || 'User';
    const senderRoleLabel = originAgent?.roleLabel || (message.fromRole && message.fromRole !== 'user' ? message.fromRole : null);
    const timeLabel = React.useMemo(() => {
        return new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }, [message.timestamp]);

    // 🆕 Get image from metadata
    const imageData = message.metadata?.image as {
        base64?: string;
        width?: number;
        height?: number;
        mimeType?: string;
    } | undefined;
    const imageUri = React.useMemo(() => {
        if (!imageData?.base64) {
            return null;
        }

        return `data:${imageData.mimeType || 'image/jpeg'};base64,${imageData.base64}`;
    }, [imageData?.base64, imageData?.mimeType]);
    const imageSource = React.useMemo(() => {
        if (!imageUri) {
            return undefined;
        }

        return { uri: imageUri };
    }, [imageUri]);

    // 🆕 复制消息内容
    const handleCopyMessage = React.useCallback(async () => {
        try {
            await Clipboard.setStringAsync(message.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy message:', error);
        }
    }, [message.content]);

    // 🆕 查找关联的任务，使用 sticky ref 防止任务短暂消失（时有时无）
    const lastRelatedTaskRef = React.useRef<any>(null);
    const relatedTask = React.useMemo(() => {
        if (!getTasksForMessage || !message.metadata?.taskId) return null;
        const tasksForMessage = getTasksForMessage(message.id);
        const found = tasksForMessage.find(t => t.id === message.metadata?.taskId) ?? null;
        // Keep last known task so the card doesn't flash away during brief sync gaps
        if (found !== null) lastRelatedTaskRef.current = found;
        return lastRelatedTaskRef.current;
    }, [getTasksForMessage, message.id, message.metadata?.taskId]);

    // Determine if we should show short or long content
    // If shortContent exists, use it as the summary.
    // Otherwise, truncate content.
    const hasShortContent = !!message.shortContent;
    const MAX_LENGTH = 150;
    const isLong = message.content.length > MAX_LENGTH || message.content.split('\n').length > 5;

    const shouldShowExpand = hasShortContent || isLong;
    const showCardBody = isEdzlf || isMyMessage || message.type !== 'chat' || !!message.metadata?.taskId || !!message.shortContent;
    const mentionedAgents = React.useMemo(() => {
        const uniqueSessionIds = [...new Set(message.mentions ?? [])];
        return uniqueSessionIds.map((sessionId) => resolveAgentIdentity(sessionId));
    }, [message.mentions, resolveAgentIdentity]);
    const mentionChipLabel = React.useMemo(() => {
        return buildMentionChipLabel(mentionedAgents);
    }, [mentionedAgents]);
    const mentionChipAccessibilityLabel = React.useMemo(() => {
        return buildMentionChipAccessibilityLabel(mentionedAgents);
    }, [mentionedAgents]);
    const mentionFlowLabel = React.useMemo(() => {
        return buildMentionFlowLabel(senderLabel, mentionedAgents);
    }, [mentionedAgents, senderLabel]);
    const mentionFlowAccessibilityLabel = React.useMemo(() => {
        return buildMentionFlowAccessibilityLabel(senderLabel, mentionedAgents);
    }, [mentionedAgents, senderLabel]);
    const hasAssociations = !!originAgent || mentionedAgents.length > 0;

    // Get short text for collapsed view
    const getShortText = React.useCallback(() => {
        if (message.shortContent) return message.shortContent;
        return message.content.substring(0, MAX_LENGTH) + '...';
    }, [message.shortContent, message.content]);

    React.useEffect(() => {
        return () => {
            if (singlePressTimerRef.current) {
                clearTimeout(singlePressTimerRef.current);
            }
        };
    }, []);

    const toggleBubbleDetails = React.useCallback(() => {
        if (hasAssociations) {
            setShowAssociations((previous) => !previous);
            return;
        }

        if (shouldShowExpand) {
            setExpanded((previous) => !previous);
        }
    }, [hasAssociations, shouldShowExpand]);

    const handleBubblePress = React.useCallback(() => {
        if (!message.fromSessionId) {
            toggleBubbleDetails();
            return;
        }

        const now = Date.now();
        const isDoublePress = now - lastPressAtRef.current < 260;
        lastPressAtRef.current = now;

        if (isDoublePress) {
            if (singlePressTimerRef.current) {
                clearTimeout(singlePressTimerRef.current);
                singlePressTimerRef.current = null;
            }
            onAvatarPress(message.fromSessionId);
            return;
        }

        singlePressTimerRef.current = setTimeout(() => {
            singlePressTimerRef.current = null;
            toggleBubbleDetails();
        }, 230);
    }, [message.fromSessionId, onAvatarPress, toggleBubbleDetails]);

    const renderContent = () => {
        // 🆕 Render image if present
        const renderImage = () => {
            if (!imageSource || !imageData) return null;

            const aspectRatio = (imageData.width && imageData.height)
                ? imageData.width / imageData.height
                : 1;
            const displayWidth = Math.min(200, imageData.width || 200);
            const displayHeight = displayWidth / aspectRatio;

            return (
                <Pressable
                    onPress={() => setShowFullImage(true)}
                    style={styles.imageContainer}
                >
                    <Image
                        source={imageSource}
                        style={[styles.messageImage, { width: displayWidth, height: displayHeight }]}
                        resizeMode="cover"
                        onLoadStart={() => {
                            if (!imageHasLoadedRef.current) {
                                setImageLoading(true);
                            }
                        }}
                        onLoadEnd={() => {
                            imageHasLoadedRef.current = true;
                            setImageLoading(false);
                        }}
                    />
                    {imageLoading && (
                        <View style={[styles.imageLoading, { width: displayWidth, height: displayHeight }]}>
                            <ActivityIndicator size="small" />
                        </View>
                    )}
                </Pressable>
            );
        };

        if (!shouldShowExpand || expanded) {
            // Show full content
            return (
                <View style={isMyMessage ? { opacity: 0.95 } : {}}>
                    {renderImage()}
                    {message.content !== '📷 Image' && (
                        <MarkdownView markdown={message.content} textColor={isMyMessage ? '#FFFFFF' : undefined} />
                    )}
                </View>
            );
        } else {
            // Show short content with Markdown support
            const shortText = getShortText();
            return (
                <View style={isMyMessage ? { opacity: 0.95 } : {}}>
                    {renderImage()}
                    {message.content !== '📷 Image' && (
                        <MarkdownView markdown={shortText} textColor={isMyMessage ? '#FFFFFF' : undefined} />
                    )}
                </View>
            );
        }
    };

    const isOnline = originAgent?.isOnline ?? false;

    const renderAvatarGlyph = () => {
        if (roleVisual.avatarIcon) {
            return <Ionicons name={roleVisual.avatarIcon} size={14} color="#FFFFFF" />;
        }

        return (
            <Text style={[styles.avatarText, isMyMessage && styles.myAvatarText]}>
                {roleVisual.avatarLabel || getAvatarContent(message.fromRole, message.fromDisplayName)}
            </Text>
        );
    };

    const renderDesktopHeader = () => {
        if (!isEdzlf) {
            return null;
        }

        if (isMyMessage) {
            return (
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 6, marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, color: theme.colors.textSecondary }}>{timeLabel}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary }}>{senderLabel}</Text>
                </View>
            );
        }

        return (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: showCardBody ? 6 : 4 }}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#223548' }}>{senderLabel}</Text>
                {roleVisual.badgeLabel ? (
                    <View
                        style={{
                            paddingHorizontal: 6,
                            height: 16,
                            borderRadius: 8,
                            justifyContent: 'center',
                            backgroundColor: roleVisual.badgeBackground || '#5F7D9920',
                        }}
                    >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: roleVisual.badgeTextColor || '#5F7D99' }}>
                            {roleVisual.badgeLabel}
                        </Text>
                    </View>
                ) : null}
                <Text style={{ fontSize: 11, color: '#9AA8B4' }}>{timeLabel}</Text>
            </View>
        );
    };

    const renderAssociationCard = (agent: TeamChatAgentIdentity, key: string) => {
        const agentVisual = getRoleVisual(agent.roleId, agent.displayName);
        const associationTextColor = isMyMessage ? '#FFFFFF' : styles.associationName.color;
        const associationMetaColor = isMyMessage ? 'rgba(255,255,255,0.78)' : styles.associationRole.color;

        return (
            <Pressable
                key={key}
                onPress={() => onAvatarPress(agent.sessionId)}
                style={[
                    styles.associationCard,
                    isMyMessage && styles.associationCardMyMessage,
                    isEdzlf && !isMyMessage && {
                        backgroundColor: '#F7FAFC',
                        borderColor: '#D9E4EA',
                    },
                ]}
            >
                <View style={[styles.associationAvatar, { backgroundColor: agentVisual.avatarBackground }]}>
                    {agentVisual.avatarIcon ? (
                        <Ionicons name={agentVisual.avatarIcon} size={12} color="#FFFFFF" />
                    ) : (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFFFFF' }}>
                            {agentVisual.avatarLabel || getAvatarContent(agent.roleId, agent.displayName)}
                        </Text>
                    )}
                </View>
                <View style={styles.associationMeta}>
                    <Text style={[styles.associationName, { color: associationTextColor }]} numberOfLines={1}>
                        {agent.displayName}
                    </Text>
                    <Text style={[styles.associationRole, { color: associationMetaColor }]} numberOfLines={1}>
                        {agent.roleLabel}
                    </Text>
                </View>
                <Ionicons
                    name="arrow-forward"
                    size={12}
                    color={isMyMessage ? 'rgba(255,255,255,0.72)' : theme.colors.textSecondary}
                />
            </Pressable>
        );
    };

    const renderAssociations = () => {
        if (!showAssociations || !hasAssociations) {
            return null;
        }

        return (
            <View style={styles.associationPanel}>
                {originAgent ? (
                    <View style={styles.associationSection}>
                        <Text
                            style={[
                                styles.associationSectionLabel,
                                isMyMessage && { color: 'rgba(255,255,255,0.72)' },
                            ]}
                        >
                            Origin Session
                        </Text>
                        {renderAssociationCard(originAgent, `origin-${originAgent.sessionId}`)}
                    </View>
                ) : null}

                {mentionedAgents.length > 0 ? (
                    <View style={styles.associationSection}>
                        <Text
                            style={[
                                styles.associationSectionLabel,
                                isMyMessage && { color: 'rgba(255,255,255,0.72)' },
                            ]}
                        >
                            @ Mentions
                        </Text>
                        {mentionedAgents.map((agent) => renderAssociationCard(agent, `mention-${agent.sessionId}`))}
                    </View>
                ) : null}
            </View>
        );
    };

    const renderMentionChip = () => {
        if (!mentionChipLabel) {
            return null;
        }

        const chipBackground = isMyMessage ? 'rgba(255,255,255,0.16)' : theme.colors.surfaceHigh;
        const chipBorder = isMyMessage ? 'rgba(255,255,255,0.18)' : '#D9E4EA';
        const chipTextColor = isMyMessage ? '#FFFFFF' : theme.colors.textSecondary;

        return (
            <View
                style={[
                    styles.mentionChip,
                    {
                        backgroundColor: chipBackground,
                        borderColor: chipBorder,
                    },
                ]}
                accessibilityLabel={mentionFlowAccessibilityLabel || mentionChipAccessibilityLabel || undefined}
            >
                <Ionicons name="at-outline" size={12} color={chipTextColor} />
                <Text
                    style={[
                        styles.mentionChipText,
                        { color: chipTextColor },
                    ]}
                    numberOfLines={1}
                >
                    {mentionFlowLabel || mentionChipLabel}
                </Text>
            </View>
        );
    };

    return (
        <View style={{ marginBottom: 2 }}>
            {!isMyMessage && !isEdzlf && (
                <Text style={styles.senderName}>
                    {senderRoleLabel ? `${senderLabel} · ${senderRoleLabel}` : senderLabel}
                </Text>
            )}

            <View style={[styles.messageRow, isMyMessage && styles.myMessageRow]}>
                <Pressable
                    onPress={() => message.fromSessionId && onAvatarPress(message.fromSessionId)}
                    disabled={!message.fromSessionId}
                    style={[
                        styles.avatarContainer,
                        isMyMessage && styles.myAvatarContainer,
                        isEdzlf && {
                            backgroundColor: roleVisual.avatarBackground,
                            borderColor: isMyMessage ? theme.colors.text : theme.colors.surface,
                            borderWidth: isMyMessage ? 0 : 1,
                            shadowOpacity: 0,
                            elevation: 0,
                        },
                    ]}
                >
                    {renderAvatarGlyph()}
                    {/* 🆕 Online status indicator */}
                    {!isMyMessage && isOnline && !isEdzlf && (
                        <View style={styles.onlineIndicator} />
                    )}
                </Pressable>

                <View style={[styles.messageBubbleContainer, isEdzlf && { maxWidth: isMyMessage ? '52%' : '82%' }]}>
                    {renderDesktopHeader()}
                    {isEdzlf && !showCardBody && !isMyMessage ? (
                        <View>
                            {renderMentionChip()}
                            <Pressable
                                onPress={handleBubblePress}
                                onLongPress={handleCopyMessage}
                                delayLongPress={500}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 }}
                            >
                                <View
                                    style={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: 5,
                                        backgroundColor: roleVisual.dotColor || '#34C759',
                                    }}
                                />
                                <View style={{ flex: 1 }}>
                                    {renderContent()}
                                </View>
                                <Pressable onPress={handleCopyMessage} style={styles.copyButton} hitSlop={8}>
                                    <Ionicons
                                        name={copied ? 'checkmark' : 'copy-outline'}
                                        size={14}
                                        color={copied ? (theme.colors.success || '#10B981') : theme.colors.textSecondary}
                                    />
                                </Pressable>
                            </Pressable>
                            {renderAssociations()}
                        </View>
                    ) : (
                        <Pressable
                            style={[
                                styles.messageBubble,
                                isMyMessage && styles.myMessageBubble,
                                isEdzlf && {
                                    borderRadius: 20,
                                    borderBottomLeftRadius: 20,
                                    borderBottomRightRadius: 20,
                                    overflow: 'hidden' as const,
                                },
                                isEdzlf && !isMyMessage && {
                                    backgroundColor: 'transparent',
                                    shadowOpacity: 0,
                                    shadowRadius: 0,
                                    elevation: 0,
                                    padding: 0,
                                    borderBottomLeftRadius: 20,
                                    borderBottomRightRadius: 20,
                                },
                            ]}
                            onPress={handleBubblePress}
                            onLongPress={handleCopyMessage}
                            delayLongPress={500}
                        >
                            {isMyMessage ? (
                                <LinearGradient
                                    colors={['#486884', '#2B4158']}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={[StyleSheet.absoluteFillObject as object, { borderRadius: 20 }]}
                                />
                            ) : null}
                            {isEdzlf && !isMyMessage ? (
                                <LinearGradient
                                    colors={[theme.colors.surface, theme.colors.surfaceHigh]}
                                    start={{ x: 0.5, y: 0 }}
                                    end={{ x: 0.5, y: 1 }}
                                    style={[
                                        StyleSheet.absoluteFillObject as object,
                                        {
                                            borderRadius: 20,
                                            borderWidth: 1,
                                            borderColor: '#D9E4EA',
                                        },
                                    ]}
                                />
                            ) : null}
                            <View style={isEdzlf && !isMyMessage ? { paddingHorizontal: 16, paddingVertical: 14, gap: 6 } : undefined}>
                                {renderMentionChip()}
                                {renderContent()}

                                {shouldShowExpand && (
                                    <Pressable onPress={() => setExpanded((previous) => !previous)} hitSlop={6}>
                                        <Text style={[styles.expandText, isMyMessage && styles.myExpandText]}>
                                            {expanded ? 'Show Less' : 'Show More'}
                                        </Text>
                                    </Pressable>
                                )}

                                {renderAssociations()}

                                {!isEdzlf && (
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={[styles.messageTime, isMyMessage && styles.myMessageTime]}>
                                            {timeLabel}
                                        </Text>
                                        <Pressable onPress={handleCopyMessage} style={styles.copyButton} hitSlop={8}>
                                            <Ionicons
                                                name={copied ? 'checkmark' : 'copy-outline'}
                                                size={14}
                                                color={copied
                                                    ? (theme.colors.success || '#10B981')
                                                    : isMyMessage ? 'rgba(255,255,255,0.7)' : theme.colors.textSecondary
                                                }
                                            />
                                        </Pressable>
                                    </View>
                                )}
                                {isEdzlf && (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Pressable onPress={handleCopyMessage} style={styles.copyButton} hitSlop={8}>
                                            <Ionicons
                                                name={copied ? 'checkmark' : 'copy-outline'}
                                                size={14}
                                                color={copied
                                                    ? (theme.colors.success || '#10B981')
                                                    : isMyMessage ? '#E7EFF6' : theme.colors.textSecondary
                                                }
                                            />
                                        </Pressable>
                                    </View>
                                )}
                                {isEdzlf && copied ? (
                                    <Text style={{ fontSize: 11, color: isMyMessage ? '#E7EFF6' : theme.colors.textSecondary, fontWeight: '600' }}>
                                        Copied
                                    </Text>
                                ) : null}
                            </View>
                        </Pressable>
                    )}

                    {/* 🆕 显示关联的任务卡片 */}
                    {relatedTask && (
                        <TaskCard
                            task={relatedTask}
                            styles={styles}
                            onPress={() => {
                                // Task card is informational within chat; full interaction is on the board tab
                            }}
                        />
                    )}
                </View>
            </View>

            {/* 🆕 Full-screen image viewer modal */}
            {imageData?.base64 && imageSource && (
                <RNModal
                    visible={showFullImage}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowFullImage(false)}
                >
                    <Pressable
                        style={{
                            flex: 1,
                            backgroundColor: 'rgba(0,0,0,0.9)',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        onPress={() => setShowFullImage(false)}
                    >
                        <Image
                            source={imageSource}
                            style={{
                                width: Dimensions.get('window').width - 32,
                                height: Dimensions.get('window').height * 0.7,
                            }}
                            resizeMode="contain"
                        />
                        <Pressable
                            style={{
                                position: 'absolute',
                                top: 60,
                                right: 20,
                                padding: 8,
                                backgroundColor: 'rgba(255,255,255,0.2)',
                                borderRadius: 20,
                            }}
                            onPress={() => setShowFullImage(false)}
                        >
                            <Ionicons name="close" size={24} color="#FFF" />
                        </Pressable>
                    </Pressable>
                </RNModal>
            )}
        </View>
    );
};

const MessageBubble = React.memo(MessageBubbleInner, (prevProps, nextProps) => {
    return prevProps.message === nextProps.message
        && prevProps.isMyMessage === nextProps.isMyMessage
        && prevProps.styles === nextProps.styles
        && prevProps.onAvatarPress === nextProps.onAvatarPress
        && prevProps.resolveAgentIdentity === nextProps.resolveAgentIdentity
        && prevProps.variant === nextProps.variant
        && prevProps.getTasksForMessage === nextProps.getTasksForMessage;
});

interface TeamChatRoomProps {
    teamId: string;
    teamName: string;
    mySessionId?: string;
    myRole?: string;
    myDisplayName?: string;
    members?: TeamChatMember[];
    returnTo?: string;
    // 🆕 Chat-Board 同步相关 props
    messages?: TeamMessage[];
    onMessagesChange?: (messages: TeamMessage[]) => void;
    taskChatSync?: ReturnType<typeof useTaskChatSync>;
    variant?: TeamChatRoomVariant;
    composerPrefill?: {
        text: string;
        token: number;
    } | null;
    fallbackMachineId?: string;
}

export default function TeamChatRoom({
    teamId,
    teamName,
    mySessionId,
    myRole,
    myDisplayName,
    members = [],
    returnTo,
    messages: externalMessages,
    onMessagesChange,
    taskChatSync,
    variant = 'default',
    composerPrefill = null,
    fallbackMachineId,
}: TeamChatRoomProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const messageListRef = React.useRef<FlatList<TeamMessage>>(null);
    const isNearBottomRef = React.useRef(true);  // Track if user is near bottom for auto-scroll
    const hasInitialScrolled = React.useRef(false);  // Ensure we scroll to bottom on first layout

    // Reliable scroll-to-end helper — uses rAF on web for accurate post-paint timing
    const scrollToEnd = React.useCallback((animated: boolean) => {
        const doScroll = () => messageListRef.current?.scrollToEnd({ animated });
        if (Platform.OS === 'web') {
            requestAnimationFrame(() => requestAnimationFrame(doScroll));
        } else {
            setTimeout(doScroll, 100);
        }
    }, []);
    const router = useRouter();
    const isEdzlf = variant === 'edzlf';
    const connectionStatus = useConnectionStatus();

    // 🆕 使用外部 messages（如果提供），否则使用内部状态
    const [internalMessages, setInternalMessages] = React.useState<TeamMessage[]>([]);
    const messages = externalMessages ?? internalMessages;
    const messagesRef = React.useRef<TeamMessage[]>(messages);
    const messageIdsRef = React.useRef<Set<string>>(new Set());

    React.useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    const setMessages = React.useCallback((update: React.SetStateAction<TeamMessage[]>) => {
        if (onMessagesChange) {
            const nextMessages = typeof update === 'function'
                ? (update as (prev: TeamMessage[]) => TeamMessage[])(messagesRef.current)
                : update;
            onMessagesChange(nextMessages);
            return;
        }
        setInternalMessages(update);
    }, [onMessagesChange, setInternalMessages]);

    const setMessagesRef = React.useRef(setMessages);
    React.useEffect(() => {
        setMessagesRef.current = setMessages;
    }, [setMessages]);

    React.useEffect(() => {
        messageIdsRef.current = new Set(messages.map(message => message.id));
    }, [messages]);

    const [inputText, setInputText] = React.useState('');
    const [inputSelection, setInputSelection] = React.useState<{ start: number; end: number }>({ start: 0, end: 0 });
    const [isSending, setIsSending] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const [showStatus, setShowStatus] = React.useState(false);
    const [isInputFocused, setIsInputFocused] = React.useState(false); // tracked for clipboard check timing
    const [showHistory, setShowHistory] = React.useState(false);
    // 🆕 Image selection state
    const [selectedImage, setSelectedImage] = React.useState<{
        uri: string;
        base64?: string;
        width: number;
        height: number;
        fileSize?: number;
    } | null>(null);
    const [uploadProgress, setUploadProgress] = React.useState(0);
    const inputRef = React.useRef<TextInput>(null);

    React.useEffect(() => {
        if (!composerPrefill?.text) {
            return;
        }

        setInputText(composerPrefill.text);

        const focusInput = () => {
            inputRef.current?.focus();
        };

        if (Platform.OS === 'web') {
            requestAnimationFrame(() => requestAnimationFrame(focusInput));
        } else {
            setTimeout(focusInput, 80);
        }
    }, [composerPrefill]);

    // 🆕 Web: listen for native paste (Cmd+V) to support direct clipboard image pasting
    React.useEffect(() => {
        if (Platform.OS !== 'web') return;

        const handleWebPaste = (event: Event) => {
            const clipboardEvent = event as ClipboardEvent;
            const items = clipboardEvent.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.type.startsWith('image/')) continue;

                const file = item.getAsFile();
                if (!file) continue;

                clipboardEvent.preventDefault();

                const reader = new FileReader();
                reader.onload = (e) => {
                    const dataUrl = e.target?.result as string;
                    if (!dataUrl) return;

                    // dataUrl is "data:image/png;base64,<data>"
                    const base64 = dataUrl.split(',')[1];
                    const img = new Image();
                    img.onload = () => {
                        setSelectedImage({
                            uri: dataUrl,
                            base64,
                            width: img.naturalWidth,
                            height: img.naturalHeight,
                            fileSize: file.size,
                        });
                    };
                    img.src = dataUrl;
                };
                reader.readAsDataURL(file);
                break; // handle first image only
            }
        };

        document.addEventListener('paste', handleWebPaste);
        return () => {
            document.removeEventListener('paste', handleWebPaste);
        };
    }, []);
    // 🆕 Clipboard image detection state
    const [clipboardHasImage, setClipboardHasImage] = React.useState(false);
    const [isCheckingClipboard, setIsCheckingClipboard] = React.useState(false);

    // 🆕 获取我发送过的消息历史（用于历史选取）
    // FIX: User messages have fromSessionId=undefined and fromRole='user'
    // We need to match both: session messages AND user messages from mobile app
    const myMessageHistory = React.useMemo(() => {
        return messages
            .filter(m =>
                m.type === 'chat' &&
                m.content.trim().length > 0 &&
                (
                    // Match messages from my session (if I'm an agent)
                    m.fromSessionId === mySessionId ||
                    // Match user messages from mobile app (fromSessionId is undefined, fromRole is 'user')
                    (!m.fromSessionId && m.fromRole === 'user')
                )
            )
            .map(m => m.content)
            .filter((content, index, arr) => arr.indexOf(content) === index) // 去重
            .slice(-20) // 最近20条
            .reverse(); // 最新的在前
    }, [messages, mySessionId]);

    // 🆕 Image picker and compression function
    const handlePickImage = React.useCallback(async () => {
        try {
            // Request permission
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Modal.alert('Permission Required', 'Please grant photo library access to send images.');
                return;
            }

            // Launch image picker
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                quality: 1,
                base64: false, // We'll get base64 after compression
            });

            if (result.canceled || !result.assets?.[0]) {
                return;
            }

            const asset = result.assets[0];
            setIsCompressing(true);

            // Compress image while preserving readability
            const MAX_WIDTH = 1600;
            const MAX_SIZE_KB = 800; // Max 800KB to balance quality and transmission
            let quality = 0.85;

            // Calculate new dimensions maintaining aspect ratio
            let width = asset.width;
            let height = asset.height;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }

            let manipulatorResult = await ImageManipulator.manipulateAsync(
                asset.uri,
                [{ resize: { width, height } }],
                {
                    compress: quality,
                    format: ImageManipulator.SaveFormat.JPEG,
                    base64: true,
                }
            );

            // Check size and compress further if needed
            let estimatedSize = manipulatorResult.base64
                ? Math.round((manipulatorResult.base64.length * 3) / 4)
                : 0;

            // If still too large, compress more aggressively
            while (estimatedSize > MAX_SIZE_KB * 1024 && quality > 0.5) {
                quality -= 0.1;
                width = Math.round(width * 0.8);
                height = Math.round(height * 0.8);

                manipulatorResult = await ImageManipulator.manipulateAsync(
                    asset.uri,
                    [{ resize: { width, height } }],
                    {
                        compress: quality,
                        format: ImageManipulator.SaveFormat.JPEG,
                        base64: true,
                    }
                );

                estimatedSize = manipulatorResult.base64
                    ? Math.round((manipulatorResult.base64.length * 3) / 4)
                    : 0;
            }

            setSelectedImage({
                uri: manipulatorResult.uri,
                base64: manipulatorResult.base64,
                width: manipulatorResult.width,
                height: manipulatorResult.height,
                fileSize: estimatedSize,
            });
        } catch (error) {
            console.error('Failed to pick/compress image:', error);
            Modal.alert('Error', 'Failed to process image. Please try again.');
        } finally {
            setIsCompressing(false);
        }
    }, []);

    // 🆕 Check clipboard for images (called on input focus)
    const checkClipboardForImage = React.useCallback(async () => {
        if (selectedImage || isCheckingClipboard) return; // Don't check if already have image selected

        try {
            setIsCheckingClipboard(true);
            const hasImage = await Clipboard.hasImageAsync();
            setClipboardHasImage(hasImage);
        } catch (error) {
            console.error('Failed to check clipboard:', error);
            setClipboardHasImage(false);
        } finally {
            setIsCheckingClipboard(false);
        }
    }, [selectedImage, isCheckingClipboard]);

    // 🆕 Paste image from clipboard (direct use without ImageManipulator - iOS doesn't support data URI)
    const handlePasteFromClipboard = React.useCallback(async () => {
        try {
            setIsCompressing(true);
            setClipboardHasImage(false);

            // Request JPEG format for smaller size
            const image = await Clipboard.getImageAsync({ format: 'jpeg' });
            if (!image || !image.data) {
                Modal.alert('No Image', 'No image found in clipboard.');
                return;
            }

            // Get dimensions from image size if available
            const width = image.size?.width || 800;
            const height = image.size?.height || 600;

            // Estimate file size (base64 is ~33% larger than binary)
            const estimatedSize = Math.round((image.data.length * 3) / 4);

            // Check if image is too large (> 500KB)
            const MAX_SIZE_KB = 500;
            if (estimatedSize > MAX_SIZE_KB * 1024) {
                Modal.alert(
                    'Image Too Large',
                    `The clipboard image is ${Math.round(estimatedSize / 1024)}KB. Please use the image picker button to select and compress the image.`
                );
                return;
            }

            setSelectedImage({
                uri: `data:image/jpeg;base64,${image.data}`,
                base64: image.data,
                width,
                height,
                fileSize: estimatedSize,
            });
        } catch (error) {
            console.error('Failed to paste image from clipboard:', error);
            Modal.alert('Error', 'Failed to paste image. Please try again.');
        } finally {
            setIsCompressing(false);
        }
    }, []);

    // 🆕 Format file size for display
    const formatFileSize = React.useCallback((bytes?: number) => {
        if (!bytes) return 'Unknown size';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }, []);

    const handleClearSelectedImage = React.useCallback(() => {
        setSelectedImage(null);
    }, []);

    const selectedImagePreview = React.useMemo(() => {
        if (!selectedImage) {
            return null;
        }

        return (
            <View style={styles.imagePreviewContainer}>
                <Image
                    source={{ uri: selectedImage.uri }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                />
                <View style={styles.imagePreviewInfo}>
                    <Text style={styles.imagePreviewText}>
                        {selectedImage.width} × {selectedImage.height}
                    </Text>
                    <Text style={styles.imagePreviewSize}>
                        {formatFileSize(selectedImage.fileSize)}
                    </Text>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                        <View style={styles.uploadProgress}>
                            <View style={[styles.uploadProgressBar, { width: `${uploadProgress}%` }]} />
                        </View>
                    )}
                </View>
                <Pressable
                    style={styles.removeImageButton}
                    onPress={handleClearSelectedImage}
                    disabled={isSending}
                >
                    <Ionicons
                        name="close-circle"
                        size={24}
                        color={isSending ? theme.colors.textSecondary + '50' : theme.colors.textSecondary}
                    />
                </Pressable>
            </View>
        );
    }, [selectedImage, uploadProgress, isSending, styles, formatFileSize, handleClearSelectedImage, theme.colors.textSecondary]);

    const formatRelativeTime = React.useCallback((timestamp?: number) => {
        if (!timestamp) return 'No activity';
        const diff = Date.now() - timestamp;
        if (diff < 60 * 1000) return 'Just now';
        if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
        return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
    }, []);

    React.useEffect(() => {
        setMessagesRef.current([]);
        messageIdsRef.current = new Set();
    }, [teamId]);

    // Filter active members for status display
    const activeMembers = React.useMemo(() => {
        return members.filter(m => m.session?.active);
    }, [members]);

    const memberDirectory = React.useMemo<Record<string, TeamChatAgentIdentity>>(() => {
        return members.reduce<Record<string, TeamChatAgentIdentity>>((accumulator, entry) => {
            const roleId = entry.member.roleId || entry.session?.metadata?.role;
            accumulator[entry.member.sessionId] = {
                sessionId: entry.member.sessionId,
                displayName: entry.member.displayName || entry.session?.metadata?.name || entry.member.sessionId.slice(0, 8),
                roleId,
                roleLabel: entry.role?.title || roleId || 'Agent',
                isOnline: !!entry.session?.active,
            };
            return accumulator;
        }, {});
    }, [members]);

    const mentionCandidates = React.useMemo<TeamMentionCandidate[]>(() => {
        return members.map((entry) => {
            const roleId = entry.member.roleId || entry.session?.metadata?.role;
            const displayName = entry.member.displayName || entry.session?.metadata?.name;

            return {
                sessionId: entry.member.sessionId,
                displayName,
                roleId,
                aliases: [
                    displayName,
                    entry.role?.title,
                ].filter((value): value is string => !!value),
            };
        });
    }, [members]);

    // @ mention autocomplete
    const mentionPrefixes = React.useMemo(() => ['@'], []);
    const activeWord = useActiveWord(inputText, inputSelection, mentionPrefixes);

    const mentionSuggestionHandler = React.useCallback(async (query: string) => {
        const q = query.replace(/^@/, '').toLowerCase();
        const items: { key: string; text: string; component: React.ElementType }[] = [];

        // Always include "help" as first option
        if (!q || 'help'.includes(q)) {
            items.push({
                key: '__help__',
                text: '@help',
                component: () => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44 }}>
                        <Ionicons name="medkit-outline" size={16} color="#FF9500" style={{ marginRight: 8 }} />
                        <Text style={{ fontSize: 14, fontWeight: '600' }}>help</Text>
                        <Text style={{ fontSize: 12, color: '#8FA1B0', marginLeft: 8 }}>Summon Help Agent</Text>
                    </View>
                ),
            });
        }

        // Add team members
        for (const entry of members) {
            const roleId = entry.member.roleId || entry.session?.metadata?.role || '';
            const displayName = entry.member.displayName || entry.session?.metadata?.name || roleId;
            const label = entry.role?.title || roleId;
            const isOnline = !!entry.session?.active;

            if (q && !displayName.toLowerCase().includes(q) && !roleId.toLowerCase().includes(q) && !label.toLowerCase().includes(q)) {
                continue;
            }

            const memberDisplayName = displayName;
            const memberLabel = label;
            const memberOnline = isOnline;

            items.push({
                key: entry.member.sessionId,
                text: `@${displayName}`,
                component: () => (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 44 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: memberOnline ? '#34C759' : '#999', marginRight: 8 }} />
                        <Text style={{ fontSize: 14, fontWeight: '500' }}>{memberDisplayName}</Text>
                        {memberLabel ? <Text style={{ fontSize: 12, color: '#8FA1B0', marginLeft: 8 }}>{memberLabel}</Text> : null}
                    </View>
                ),
            });
        }

        return items;
    }, [members]);

    const [mentionSuggestions, mentionSelectedIndex, mentionMoveUp, mentionMoveDown] = useActiveSuggestions(
        activeWord,
        mentionSuggestionHandler,
    );

    const handleMentionSelect = React.useCallback((index: number) => {
        const suggestion = mentionSuggestions[index];
        if (!suggestion) return;
        const result = applySuggestion(inputText, inputSelection, suggestion.text, ['@']);
        setInputText(result.text);
        setInputSelection({ start: result.cursorPosition, end: result.cursorPosition });
    }, [mentionSuggestions, inputText, inputSelection]);

    const memberDirectoryRef = React.useRef(memberDirectory);
    memberDirectoryRef.current = memberDirectory;

    const resolveAgentIdentity = React.useCallback((
        sessionId: string,
        fallbackRole?: string,
        fallbackName?: string,
    ): TeamChatAgentIdentity => {
        const knownAgent = memberDirectoryRef.current[sessionId];
        if (knownAgent) {
            return knownAgent;
        }

        return {
            sessionId,
            displayName: fallbackName || sessionId.slice(0, 8),
            roleId: fallbackRole,
            roleLabel: fallbackRole || 'Agent',
            isOnline: false,
        };
    }, []);

    const lastResponseBySession = React.useMemo<Record<string, number>>(() => {
        const map: Record<string, number> = {};
        messages.forEach(message => {
            if (!message.fromSessionId) return;
            map[message.fromSessionId] = Math.max(map[message.fromSessionId] || 0, message.timestamp);
        });
        return map;
    }, [messages]);

    const handleAvatarPress = React.useCallback((sessionId: string) => {
        const agent = resolveAgentIdentity(sessionId);
        pushSessionRoute(router, {
            id: sessionId,
            teamId,
            teamName,
            roleName: agent.roleLabel,
            returnTo,
        });
    }, [resolveAgentIdentity, returnTo, router, teamId, teamName]);

    const renderStatusHeader = () => {
        if (isEdzlf) {
            return (
                <View
                    style={{
                        marginHorizontal: 26,
                        marginTop: 18,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' }} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>
                            {activeMembers.length} Online
                        </Text>
                        <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                            / {members.length} Total
                        </Text>
                    </View>
                    <View style={{ flex: 1 }} />
                    <Pressable
                        onPress={() => setShowStatus(!showStatus)}
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: 14,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: '#F8FBFD',
                            borderWidth: 1,
                            borderColor: '#D9E4EA',
                        }}
                    >
                        <Ionicons name={showStatus ? "chevron-up" : "chevron-down"} size={15} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            );
        }

        return (
            <Pressable
                onPress={() => setShowStatus(!showStatus)}
                style={{
                    backgroundColor: theme.colors.surface,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.colors.divider,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34C759' }} />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.text }}>
                            {activeMembers.length} Online
                        </Text>
                    </View>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                        / {members.length} Total
                    </Text>
                </View>
                <Ionicons name={showStatus ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.textSecondary} />
            </Pressable>
        );
    };

    const renderStatusList = () => {
        if (!showStatus) return null;

        if (isEdzlf) {
            return (
                <>
                    <Pressable
                        onPress={() => setShowStatus(false)}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 40,
                        }}
                    />
                    <View
                        style={{
                            position: 'absolute',
                            top: 64,
                            right: 26,
                            width: 320,
                            maxWidth: '78%',
                            maxHeight: 340,
                            backgroundColor: '#F8FBFD',
                            borderWidth: 1,
                            borderColor: '#D9E4EA',
                            borderRadius: 14,
                            overflow: 'hidden',
                            shadowColor: '#000000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.12,
                            shadowRadius: 24,
                            elevation: 8,
                            zIndex: 50,
                        }}
                    >
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {members.map((m, index) => {
                                const isOnline = m.session?.active;
                                const lastResponse = lastResponseBySession[m.member.sessionId];
                                const lastResponseLabel = formatRelativeTime(lastResponse);

                                return (
                                    <Pressable
                                        key={m.member.sessionId}
                                        onPress={() => {
                                            setShowStatus(false);
                                            handleAvatarPress(m.member.sessionId);
                                        }}
                                        style={{
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            paddingHorizontal: 12,
                                            paddingVertical: 10,
                                            borderBottomWidth: index === members.length - 1 ? 0 : 1,
                                            borderBottomColor: '#E2EBF0',
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={{
                                                width: 28,
                                                height: 28,
                                                borderRadius: 14,
                                                backgroundColor: theme.colors.surfaceHigh,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                borderWidth: 1,
                                                borderColor: isOnline ? theme.colors.success : theme.colors.divider
                                            }}>
                                                <Text style={{ fontSize: 12 }}>
                                                    {getAvatarContent(m.member.roleId, m.member.displayName)}
                                                </Text>
                                            </View>
                                            <View>
                                                <Text style={{ fontSize: 13, fontWeight: '500', color: theme.colors.text }}>
                                                    {m.member.displayName || m.member.sessionId.substring(0, 8)}
                                                </Text>
                                                <Text style={{ fontSize: 11, color: theme.colors.textSecondary }}>
                                                    {m.role?.title || m.member.roleId || 'Unknown Role'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={{ fontSize: 11, color: isOnline ? theme.colors.success : theme.colors.textSecondary, fontWeight: isOnline ? '600' : '400' }}>
                                                {isOnline ? 'Online' : 'Offline'}
                                            </Text>
                                            <Text style={{ fontSize: 10, color: theme.colors.textSecondary, marginTop: 2 }}>
                                                Active: {lastResponseLabel}
                                            </Text>
                                        </View>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                </>
            );
        }

        return (
            <View style={{ backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}>
                {members.map((m) => {
                    const isOnline = m.session?.active;
                    const lastResponse = lastResponseBySession[m.member.sessionId];
                    const lastResponseLabel = formatRelativeTime(lastResponse);

                    return (
                        <Pressable
                            key={m.member.sessionId}
                            onPress={() => handleAvatarPress(m.member.sessionId)}
                            style={{
                                flexDirection: 'row',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                paddingHorizontal: 16,
                                paddingVertical: 12,
                                borderBottomWidth: 1,
                                borderBottomColor: theme.colors.groupped.background
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 16,
                                    backgroundColor: theme.colors.groupped.background,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderWidth: 1,
                                    borderColor: isOnline ? theme.colors.success : theme.colors.divider
                                }}>
                                    <Text style={{ fontSize: 14 }}>
                                        {getAvatarContent(m.member.roleId, m.member.displayName)}
                                    </Text>
                                </View>
                                <View>
                                    <Text style={{ fontSize: 14, fontWeight: '500', color: theme.colors.text }}>
                                        {m.member.displayName || m.member.sessionId.substring(0, 8)}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>
                                        {m.role?.title || m.member.roleId || 'Unknown Role'}
                                    </Text>
                                </View>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ fontSize: 12, color: isOnline ? theme.colors.success : theme.colors.textSecondary, fontWeight: isOnline ? '600' : '400' }}>
                                    {isOnline ? 'Online' : 'Offline'}
                                </Text>
                                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 }}>
                                    Active: {lastResponseLabel}
                                </Text>
                            </View>
                        </Pressable>
                    );
                })}
            </View>
        );
    };

    // Deduplicate and sort
    const uniqueMessages = React.useMemo(() => {
        return dedupeAndSortTeamMessages(messages);
    }, [messages]);

    const loadMessages = React.useCallback(async () => {
        try {
            setIsLoading(true);
            const result = await sync.getTeamMessages(teamId);

            setMessages(prev => mergeTeamMessages(prev, result.messages));

            setTimeout(() => {
                scrollToEnd(false);
            }, 100);
        } catch (error) {
            console.error('Failed to load team messages:', error);
        } finally {
            setIsLoading(false);
        }
    }, [teamId, setMessages]);

    // Load messages
    React.useEffect(() => {
        void loadMessages();
    }, [loadMessages]);

    // Subscribe to real-time messages
    React.useEffect(() => {
        let isActive = true;
        let cleanup: (() => void) | undefined;

        const subscribe = async () => {
            try {
                const unsubscribe = await sync.subscribeToTeamMessages(teamId, (message) => {
                    const shouldAutoScroll = isNearBottomRef.current;
                    setMessages(prev => {
                        if (messageIdsRef.current.has(message.id)) {
                            return prev;
                        }
                        messageIdsRef.current.add(message.id);
                        return appendTeamMessage(prev, message);
                    });
                    if (shouldAutoScroll) {
                        scrollToEnd(true);
                    }
                });

                if (!isActive) {
                    unsubscribe();
                    return;
                }

                cleanup = unsubscribe;
            } catch (error) {
                console.error('Failed to subscribe to team messages:', error);
            }
        };

        void subscribe();

        return () => {
            isActive = false;
            cleanup?.();
        };
    }, [teamId, setMessages]);

    const handleSend = async () => {
        const content = inputText.trim();
        const hasImage = !!selectedImage?.base64;

        // Allow sending if there's text or an image
        if ((!content && !hasImage) || isSending) return;

        try {
            setIsSending(true);

            // 🆕 Handle image message
            if (hasImage && selectedImage) {
                setUploadProgress(0);

                // Simulate upload progress (real implementation would track actual upload)
                const progressInterval = setInterval(() => {
                    setUploadProgress(prev => Math.min(prev + 10, 90));
                }, 100);

                const messageId = randomUUID();
                const imageContent = content || '📷 Image';

                // Send message with image data
                const request: SendTeamMessageRequest = {
                    id: messageId,
                    teamId,
                    content: imageContent,
                    type: 'chat',
                    fromSessionId: undefined,
                    fromRole: 'user',
                    fromDisplayName: myDisplayName || 'User',
                    metadata: {
                        image: {
                            base64: selectedImage.base64,
                            width: selectedImage.width,
                            height: selectedImage.height,
                            mimeType: 'image/jpeg',
                        },
                    },
                };

                await sync.sendTeamMessage(request);
                trackTeamChatSent(teamId, {
                    mode: 'image',
                    has_image: true,
                    has_text: Boolean(content),
                    message_length: imageContent.length,
                });

                clearInterval(progressInterval);
                setUploadProgress(100);

                isNearBottomRef.current = true;
                scrollToEnd(true);

                // Clear states
                setTimeout(() => {
                    setSelectedImage(null);
                    setUploadProgress(0);
                    setInputText('');
                }, 200);

                return;
            }

            // 🆕 1. 尝试从消息创建任务
            if (taskChatSync) {
                const createdTask = await taskChatSync.createTaskFromMessage(
                    content,
                    mySessionId || 'user',
                    myDisplayName || 'User'
                );

                if (createdTask) {
                    trackTeamChatSent(teamId, {
                        mode: 'task_from_message',
                        task_created: true,
                        message_length: content.length,
                    });
                    // 创建成功，Hook 已经自动发送了通知消息
                    setInputText('');
                    return;
                }
            }

            // 🆕 3. 检查是否是 /task 命令（Master要求的格式）
            const taskCommand = parseTaskCommand(content);
            if (taskCommand && taskChatSync) {
                try {
                    // 创建新任务
                    const taskId = randomUUID();
                    const sourceMessageId = randomUUID();
                    const newTask = createTaskFromCommand(
                        taskCommand,
                        taskId,
                        mySessionId || 'user',
                        sourceMessageId
                    );

                    // 发送 task-created 通知到聊天
                    const notificationMessage: TeamMessage = {
                        id: `task_created_${randomUUID()}`,
                        teamId,
                        fromDisplayName: myDisplayName || 'User',
                        content: `✅ Created task: **${newTask.title}**\n\n${newTask.description ? `Description: ${newTask.description}\n\n` : ''}Priority: ${newTask.priority}\nStatus: ${newTask.status}\n\n#task-${newTask.id}`,
                        type: 'notification',
                        timestamp: Date.now(),
                        metadata: {
                            taskId: newTask.id,
                            taskChange: {
                                field: 'status',
                                oldValue: null,
                                newValue: 'created'
                            }
                        },
                        shortContent: `Task created: ${newTask.title}`
                    };

                    await sync.sendTeamMessage({
                        teamId,
                        content: notificationMessage.content,
                        type: 'notification',
                        metadata: notificationMessage.metadata,
                        fromDisplayName: myDisplayName || 'User'
                    });

                    // 如果指定了 assignee，发送 @mention 通知
                    if (newTask.assigneeId) {
                        const assigneeMention = `@${newTask.assigneeId}`;
                        await sync.sendTeamMessage({
                            teamId,
                            content: `${assigneeMention} You have been assigned a new task: ${newTask.title}`,
                            type: 'notification',
                            mentions: [newTask.assigneeId],
                            metadata: {
                                taskId: newTask.id,
                                taskChange: {
                                    field: 'assigneeId',
                                    oldValue: null,
                                    newValue: newTask.assigneeId
                                }
                            }
                        });
                    }

                    trackTeamChatSent(teamId, {
                        mode: 'task_command',
                        task_created: true,
                        assignee_present: Boolean(newTask.assigneeId),
                        message_length: content.length,
                    });
                    setInputText('');
                    return;
                } catch (error) {
                    console.error('Failed to create task from /task command:', error);
                    const errorMessage: TeamMessage = {
                        id: `task_error_${Date.now()}`,
                        teamId,
                        content: `❌ Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        type: 'system',
                        timestamp: Date.now(),
                        fromRole: 'system',
                        fromDisplayName: 'System'
                    };
                    setMessages(prev => [...prev, errorMessage]);
                    setInputText('');
                    return;
                }
            }

            // 4. 检查是否是其他命令
            const command = parseCommand(content);

            if (command) {
                // 执行命令
                const result = await executeCommand(command);

                // 发送系统消息显示结果
                const resultMessage: TeamMessage = {
                    id: `cmd_result_${Date.now()}`,
                    teamId,
                    content: result.message,
                    type: 'system',
                    timestamp: Date.now(),
                    fromRole: 'system',
                    fromDisplayName: 'System'
                };

                setMessages(prev => [...prev, resultMessage]);

                // 如果是帮助命令，显示帮助信息
                if (command.type === 'unknown' && content.trim() === '/help') {
                    const helpMessage: TeamMessage = {
                        id: `help-${Date.now()}`,
                        teamId,
                        content: getCommandHelp(),
                        type: 'chat',
                        timestamp: Date.now(),
                        fromDisplayName: 'System',
                    };
                    setMessages(prev => [...prev, helpMessage]);
                    setInputText('');
                    return;
                }

                trackTeamChatSent(teamId, {
                    mode: 'command',
                    command_type: command.type,
                    message_length: content.length,
                });
                setInputText('');
                return;
            }

            // 4. 普通聊天消息
            const rawMentionTokens = extractMentionTokens(content);
            const mentions = canonicalizeTeamMentions(rawMentionTokens, mentionCandidates);
            const requestedHelp = rawMentionTokens.some((token) => token.trim().toLowerCase() === 'help');
            const helpTargetSessionId = mentions[0];
            if (requestedHelp) {
                const helpMachine = selectHelpMachine(helpTargetSessionId);
                if (helpMachine) {
                    try {
                        const helpResult = await sync.requestHelpOnMachine(helpMachine.machineId, {
                            teamId,
                            sessionId: helpMachine.targetSessionId,
                            type: 'user_mention',
                            description: content.trim(),
                            severity: 'medium',
                        });
                        if (!helpResult.success) {
                            console.warn('@help RPC returned failure:', helpResult.error);
                            // Show error to user as system message
                            setMessages(prev => [...prev, {
                                id: `help-error-${Date.now()}`,
                                teamId,
                                content: `Failed to trigger help agent: ${helpResult.error || 'Unknown error'}`,
                                type: 'system' as const,
                                timestamp: Date.now(),
                                fromRole: 'system',
                                fromDisplayName: 'System',
                            }]);
                        } else {
                            // Show confirmation to user
                            setMessages(prev => [...prev, {
                                id: `help-ack-${Date.now()}`,
                                teamId,
                                content: `Help agent is being dispatched...`,
                                type: 'system' as const,
                                timestamp: Date.now(),
                                fromRole: 'system',
                                fromDisplayName: 'System',
                            }]);
                        }
                    } catch (error) {
                        console.warn('Failed to trigger @help request:', error);
                        setMessages(prev => [...prev, {
                            id: `help-error-${Date.now()}`,
                            teamId,
                            content: `Failed to reach help agent: ${error instanceof Error ? error.message : 'Connection error'}`,
                            type: 'system' as const,
                            timestamp: Date.now(),
                            fromRole: 'system',
                            fromDisplayName: 'System',
                        }]);
                    }
                } else {
                    console.warn('Ignoring @help request because no active machine could be resolved for the team');
                    setMessages(prev => [...prev, {
                        id: `help-no-machine-${Date.now()}`,
                        teamId,
                        content: `No online machine available to handle @help. Make sure your daemon is running.`,
                        type: 'system' as const,
                        timestamp: Date.now(),
                        fromRole: 'system',
                        fromDisplayName: 'System',
                    }]);
                }
            }
            const taskIds = taskChatSync ? extractTaskIds(content) : [];
            const messageId = randomUUID();
            const messageMetadata: TeamMessage['metadata'] = {
                ...(taskIds.length > 0
                    ? {
                        taskId: taskIds[0],
                        action: 'task_referenced'
                    }
                    : {}),
                ...(requestedHelp
                    ? {
                        helpRequested: true,
                        helpTrigger: '@help',
                    }
                    : {}),
            };

            if (taskIds.length > 0 && taskChatSync) {
                const messageTimestamp = Date.now();
                const outgoingMessage: TeamMessage = {
                    id: messageId,
                    teamId,
                    content,
                    type: 'chat',
                    mentions: mentions.length > 0 ? mentions : undefined,
                    fromRole: 'user',
                    fromDisplayName: myDisplayName || 'User',
                    timestamp: messageTimestamp,
                    metadata: messageMetadata
                };

                await taskChatSync.linkMessageToTask(
                    messageId,
                    taskIds[0],
                    myDisplayName || 'User',
                    outgoingMessage
                );
            }

            // User messages should NOT use team member's session ID
            // Leave fromSessionId undefined so Happy-CLI recognizes this as a user message
            const request: SendTeamMessageRequest = {
                id: messageId,
                teamId,
                content,
                type: 'chat',
                mentions: mentions.length > 0 ? mentions : undefined,
                fromSessionId: undefined,  // User message, not from a team member session
                fromRole: 'user',           // Always 'user' for messages from the user
                fromDisplayName: myDisplayName || 'User',
                metadata: messageMetadata   // 🆕 包含任务链接信息
            };

            // Optimistic update: immediately show the message before server confirms.
            // Also pre-register the id so the subscription callback skips dedup.
            const optimisticMsg: TeamMessage = {
                id: messageId,
                teamId,
                content,
                type: 'chat',
                ...(mentions.length > 0 ? { mentions } : {}),
                fromRole: 'user',
                fromDisplayName: myDisplayName || 'User',
                timestamp: Date.now(),
                ...(messageMetadata ? { metadata: messageMetadata } : {}),
            };
            messageIdsRef.current.add(messageId);
            setMessages(prev => appendTeamMessage(prev, optimisticMsg));
            isNearBottomRef.current = true;
            scrollToEnd(true);
            setInputText('');

            await sync.sendTeamMessage(request);
            trackTeamChatSent(teamId, {
                mode: requestedHelp ? 'help_request' : 'chat',
                has_image: false,
                mention_count: mentions.length,
                requested_help: requestedHelp,
                task_reference_count: taskIds.length,
                message_length: content.length,
            });
        } catch (error) {
            console.error('Failed to send message:', error);
        } finally {
            setIsSending(false);
        }
    };

    /**
     * 执行命令
     */
    const executeCommand = async (command: ParsedCommand): Promise<TaskCommandResult> => {
        if (!mySessionId) {
            return {
                success: false,
                message: '❌ Cannot execute command: No active session'
            };
        }

        switch (command.type) {
            case 'createTask':
                return await executeCreateTask(
                    command.params,
                    mySessionId,
                    teamId,
                    myDisplayName || 'User'
                );

            case 'updateTask':
                return await executeUpdateTask(command.params);

            case 'assignTask':
                return await executeAssignTask(command.params);

            case 'completeTask':
                return await executeCompleteTask(command.params.taskId);

            default:
                return {
                    success: false,
                    message: `❌ Unknown command. Type /help for available commands.`
                };
        }
    };

    const extractMentions = (text: string): string[] => {
        return canonicalizeTeamMentions(extractMentionTokens(text), mentionCandidates);
    };

    const selectHelpMachine = React.useCallback((targetSessionId?: string): { machineId: string; targetSessionId?: string } | null => {
        const targetMember = targetSessionId
            ? members.find((entry) => entry.member.sessionId === targetSessionId)
            : null;
        const targetMachineId = targetMember?.session?.metadata?.machineId;
        if (targetMachineId) {
            return { machineId: targetMachineId, targetSessionId };
        }

        const activeMainlineMember = members.find((entry) => {
            const machineId = entry.session?.metadata?.machineId;
            const roleId = entry.member.roleId || entry.session?.metadata?.role;
            return !!machineId && !!entry.session?.active && roleId !== 'supervisor' && roleId !== 'help-agent';
        });

        if (activeMainlineMember?.session?.metadata?.machineId) {
            return {
                machineId: activeMainlineMember.session.metadata.machineId,
                targetSessionId: targetSessionId || activeMainlineMember.member.sessionId,
            };
        }

        const fallbackMember = members.find((entry) => !!entry.session?.metadata?.machineId);
        if (fallbackMember?.session?.metadata?.machineId) {
            return {
                machineId: fallbackMember.session.metadata.machineId,
                targetSessionId: targetSessionId || fallbackMember.member.sessionId,
            };
        }

        // All team agents dead — fall back to any connected machine
        if (fallbackMachineId) {
            return { machineId: fallbackMachineId, targetSessionId };
        }

        return null;
    }, [members, fallbackMachineId]);

    const reconnectingBanner = connectionStatus.isReconnecting ? (
        <View style={styles.reconnectingBanner}>
            <ActivityIndicator size="small" color={theme.colors.warning} />
            <Text style={styles.reconnectingBannerText}>重连中...</Text>
        </View>
    ) : null;

    const renderMessageItem = React.useCallback(({ item: message }: { item: TeamMessage }) => {
        if (message.type === 'system') {
            return (
                <View style={styles.systemMessage}>
                    <Ionicons name="information-circle-outline" size={12} color={theme.colors.textSecondary} />
                    <Text style={styles.systemMessageText}>{message.content}</Text>
                </View>
            );
        }

        return (
            <MessageBubble
                message={message}
                isMyMessage={message.fromRole === 'user' && (!message.fromSessionId || message.fromSessionId === mySessionId)}
                styles={styles}
                onAvatarPress={handleAvatarPress}
                resolveAgentIdentity={resolveAgentIdentity}
                variant={variant}
                getTasksForMessage={taskChatSync?.getTasksForMessage}
            />
        );
    }, [handleAvatarPress, mySessionId, resolveAgentIdentity, styles, taskChatSync?.getTasksForMessage, theme.colors.textSecondary, variant]);

    const renderEmptyState = React.useCallback(() => (
        <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.emptyStateText}>
                Start the conversation
            </Text>
        </View>
    ), [styles.emptyState, styles.emptyStateText, theme.colors.textSecondary]);

    if (isLoading) {
        return (
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={90}
            >
                {renderStatusHeader()}
                {renderStatusList()}
                {reconnectingBanner}
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                </View>
            </KeyboardAvoidingView>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={90}
        >
            {renderStatusHeader()}
            {renderStatusList()}
            {reconnectingBanner}
            <FlatList
                ref={messageListRef}
                style={styles.messageList}
                data={uniqueMessages}
                keyExtractor={(message) => message.id}
                renderItem={renderMessageItem}
                ListEmptyComponent={renderEmptyState}
                contentContainerStyle={[
                    styles.messageListContent,
                    isEdzlf && { paddingHorizontal: 26, paddingTop: 22, paddingBottom: 24 },
                    uniqueMessages.length === 0 && { flexGrow: 1 }
                ]}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={10}
                removeClippedSubviews={Platform.OS !== 'web'}
                keyboardShouldPersistTaps="handled"
                // Track user scroll position to determine if near bottom
                onScroll={(event) => {
                    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
                    isNearBottomRef.current = isNearBottom(layoutMeasurement.height, contentOffset.y, contentSize.height);
                }}
                scrollEventThrottle={16}
                // Only auto-scroll when user is near bottom (respecting user intent)
                onContentSizeChange={() => {
                    if (isNearBottomRef.current) {
                        scrollToEnd(true);
                    }
                }}
                // Scroll to bottom on first layout (e.g. initial render with messages already present)
                onLayout={() => {
                    if (!hasInitialScrolled.current) {
                        hasInitialScrolled.current = true;
                        scrollToEnd(false);
                    }
                }}
            />

            {/* 🆕 历史消息选择器 */}
            {showHistory && myMessageHistory.length > 0 && (
                <View style={styles.historyContainer}>
                    <View style={styles.historyHeader}>
                        <Text style={styles.historyTitle}>Recent Messages</Text>
                        <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
                            <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                        </Pressable>
                    </View>
                    <ScrollView
                        style={styles.historyList}
                        showsVerticalScrollIndicator={true}
                        keyboardShouldPersistTaps="handled"
                    >
                        {myMessageHistory.map((content, index) => (
                            <Pressable
                                key={index}
                                style={({ pressed }) => [
                                    styles.historyItem,
                                    pressed && styles.historyItemPressed
                                ]}
                                onPress={() => {
                                    setInputText(content);
                                    setShowHistory(false);
                                }}
                            >
                                <Text style={styles.historyItemText} numberOfLines={2}>
                                    {content}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* 🆕 Image preview before sending */}
            {selectedImagePreview}

            {/* 🆕 Compressing indicator */}
            {isCompressing && (
                <View style={[styles.imagePreviewContainer, { justifyContent: 'center' }]}>
                    <ActivityIndicator size="small" color={theme.colors.button.primary.background} />
                    <Text style={[styles.imagePreviewText, { marginLeft: 12 }]}>
                        Compressing image...
                    </Text>
                </View>
            )}

            {/* 🆕 Clipboard paste prompt - shows when clipboard has image */}
            {clipboardHasImage && !selectedImage && !isCompressing && (
                <View style={styles.clipboardPrompt}>
                    <View style={styles.clipboardPromptContent}>
                        <Ionicons
                            name="clipboard-outline"
                            size={20}
                            color={theme.colors.button.primary.background}
                            style={styles.clipboardPromptIcon}
                        />
                        <Text style={styles.clipboardPromptText}>
                            Image detected in clipboard
                        </Text>
                    </View>
                    <Pressable
                        style={({ pressed }) => [
                            styles.clipboardPasteButton,
                            pressed && { opacity: 0.8 }
                        ]}
                        onPress={handlePasteFromClipboard}
                    >
                        <Text style={styles.clipboardPasteButtonText}>Paste</Text>
                    </Pressable>
                    <Pressable
                        style={styles.clipboardDismissButton}
                        onPress={() => setClipboardHasImage(false)}
                        hitSlop={8}
                    >
                        <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
                    </Pressable>
                </View>
            )}

            <View style={styles.inputContainer}>
                {mentionSuggestions.length > 0 && (
                    <AgentInputAutocomplete
                        suggestions={mentionSuggestions.map((s) => React.createElement(s.component))}
                        selectedIndex={mentionSelectedIndex}
                        onSelect={handleMentionSelect}
                        itemHeight={44}
                    />
                )}

                <View style={styles.unifiedInputPanel}>
                    {/* Input row */}
                    <View style={styles.inputRow}>
                        <TextInput
                            ref={inputRef}
                            style={styles.input}
                            value={inputText}
                            onChangeText={setInputText}
                            onSelectionChange={(e) => setInputSelection(e.nativeEvent.selection)}
                            placeholder={selectedImage ? "Add a caption (optional)..." : "Message your team..."}
                            placeholderTextColor={theme.colors.input.placeholder}
                            multiline
                            maxLength={2000}
                            editable={!isSending}
                            onFocus={() => {
                                setIsInputFocused(true);
                                checkClipboardForImage();
                            }}
                            onBlur={() => {
                                setIsInputFocused(false);
                                setTimeout(() => setClipboardHasImage(false), 200);
                            }}
                            onKeyPress={(e) => {
                                const { resolveTeamChatComposerKeyAction } = require('./teamChatComposer') as typeof import('./teamChatComposer');
                                const action = resolveTeamChatComposerKeyAction({
                                    key: e.nativeEvent.key,
                                    shiftKey: Boolean((e.nativeEvent as { shiftKey?: boolean }).shiftKey),
                                    mentionSuggestionsCount: mentionSuggestions.length,
                                    mentionSelectedIndex,
                                    hasSendableContent: Boolean(inputText.trim() || selectedImage),
                                    isWeb: Platform.OS === 'web',
                                });

                                if (action === 'mention-up') {
                                    e.preventDefault?.();
                                    mentionMoveUp();
                                    return;
                                }
                                if (action === 'mention-down') {
                                    e.preventDefault?.();
                                    mentionMoveDown();
                                    return;
                                }
                                if (action === 'mention-select') {
                                    e.preventDefault?.();
                                    handleMentionSelect(mentionSelectedIndex);
                                    return;
                                }
                                if (action === 'send') {
                                    e.preventDefault?.();
                                    void handleSend();
                                    return;
                                }
                            }}
                        />
                    </View>

                    {/* Action row: buttons left, send right */}
                    <View style={styles.actionRow}>
                        {/* @help pill button */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.helpPill,
                                pressed && styles.actionButtonPressed,
                            ]}
                            onPress={() => {
                                const prefix = inputText.length > 0 && !inputText.endsWith(' ') ? ' ' : '';
                                setInputText(inputText + prefix + '@help ');
                                inputRef.current?.focus();
                            }}
                            hitSlop={4}
                        >
                            <Ionicons name="medkit" size={13} color={theme.colors.button.primary.background} />
                            <Text style={styles.helpPillText}>Help</Text>
                        </Pressable>

                        {/* Image picker */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                pressed && styles.actionButtonPressed,
                            ]}
                            onPress={handlePickImage}
                            disabled={isSending || isCompressing}
                            hitSlop={4}
                        >
                            <Ionicons
                                name="image-outline"
                                size={20}
                                color={(isSending || isCompressing) ? theme.colors.button.primary.disabled : theme.colors.textSecondary}
                            />
                        </Pressable>

                        {/* History */}
                        <Pressable
                            style={({ pressed }) => [
                                styles.actionButton,
                                pressed && styles.actionButtonPressed,
                            ]}
                            onPress={() => setShowHistory(!showHistory)}
                            disabled={myMessageHistory.length === 0}
                            hitSlop={4}
                        >
                            <Ionicons
                                name={showHistory ? "time" : "time-outline"}
                                size={20}
                                color={myMessageHistory.length === 0 ? theme.colors.button.primary.disabled : theme.colors.textSecondary}
                            />
                        </Pressable>

                        <View style={styles.actionSpacer} />

                        {/* Send button */}
                        <Pressable
                            style={[
                                styles.sendButton,
                                (inputText.trim() || selectedImage) && !isSending
                                    ? styles.sendButtonActive
                                    : styles.sendButtonInactive,
                            ]}
                            onPress={handleSend}
                            disabled={(!inputText.trim() && !selectedImage) || isSending}
                        >
                            <Ionicons
                                name="arrow-up"
                                size={16}
                                color={theme.colors.button.primary.tint}
                            />
                        </Pressable>
                    </View>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}
