import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/StyledText';
import { Avatar } from '@/components/avatar/Avatar';
import { StatusDot } from '@/components/ui/StatusDot';

export interface TeamAgentsPopoverItem {
    sessionId: string;
    specId?: string | null;
    displayName: string;
    roleLabel?: string;
    runtimeType?: string | null;
    modelLabel?: string | null;
    sessionPath?: string | null;
    activeTaskTitle?: string | null;
    isOnline: boolean;
    presenceLabel?: string | null;
}

interface Props {
    items: TeamAgentsPopoverItem[];
    connectionStatus?: {
        text: string;
        color: string;
        isPulsing?: boolean;
    } | null;
    onAddAgent: () => void;
    onOpenSession: (sessionId: string) => void;
    onRenameSession: (sessionId: string, displayName: string) => void;
    onRemoveAgent: (sessionId: string, displayName: string) => void;
    onDeleteSession: (sessionId: string, displayName: string) => void;
}

const styles = StyleSheet.create((theme) => ({
    card: {
        width: 372,
        maxWidth: '100%',
        borderRadius: 20,
        borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.16,
        shadowRadius: 30,
        elevation: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    titleWrap: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 12,
        marginTop: 3,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
    },
    addButtonText: {
        fontSize: 12,
        fontWeight: '700',
    },
    divider: {
        height: 1,
    },
    list: {
        maxHeight: 480,
    },
    listContent: {
        padding: 12,
        gap: 10,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 32,
        gap: 10,
    },
    emptyTitle: {
        fontSize: 14,
        fontWeight: '700',
        textAlign: 'center',
    },
    emptyBody: {
        fontSize: 12,
        lineHeight: 18,
        textAlign: 'center',
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        borderWidth: 1,
        borderRadius: 16,
        padding: 10,
    },
    rowMain: {
        flex: 1,
        minWidth: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    copy: {
        flex: 1,
        minWidth: 0,
        gap: 3,
    },
    name: {
        fontSize: 14,
        fontWeight: '700',
    },
    meta: {
        fontSize: 12,
    },
    detail: {
        fontSize: 12,
        lineHeight: 17,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    iconButton: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
}));

function buildMeta(item: TeamAgentsPopoverItem): string {
    return [
        item.roleLabel,
        item.runtimeType ? item.runtimeType.toUpperCase() : null,
        item.modelLabel,
        item.presenceLabel || (item.isOnline ? 'Online' : 'Offline'),
    ].filter(Boolean).join(' · ');
}

export const TeamAgentsPopover = React.memo(function TeamAgentsPopover({
    items,
    connectionStatus,
    onAddAgent,
    onOpenSession,
    onRenameSession,
    onRemoveAgent,
    onDeleteSession,
}: Props) {
    const { theme } = useUnistyles();

    return (
        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
            <View style={styles.header}>
                <View style={styles.titleWrap}>
                    <Text style={[styles.title, { color: theme.colors.text }]}>Agents</Text>
                    <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                        {items.length} in this team
                    </Text>
                    {connectionStatus?.text ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <StatusDot
                                color={connectionStatus.color}
                                isPulsing={connectionStatus.isPulsing}
                                size={6}
                                style={{ marginRight: 4 }}
                            />
                            <Text style={[styles.subtitle, { color: connectionStatus.color, marginTop: 0 }]}>
                                {connectionStatus.text}
                            </Text>
                        </View>
                    ) : null}
                </View>
                <Pressable
                    onPress={onAddAgent}
                    style={[styles.addButton, { backgroundColor: theme.colors.button.primary.background }]}
                >
                    <Ionicons name="add" size={14} color={theme.colors.button.primary.tint} />
                    <Text style={[styles.addButtonText, { color: theme.colors.button.primary.tint }]}>Add agent</Text>
                </Pressable>
            </View>
            <View style={[styles.divider, { backgroundColor: theme.colors.divider }]} />
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                {items.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Ionicons name="sparkles-outline" size={24} color={theme.colors.textSecondary} />
                        <Text style={[styles.emptyTitle, { color: theme.colors.text }]}>No agents yet</Text>
                        <Text style={[styles.emptyBody, { color: theme.colors.textSecondary }]}>
                            Pull agents in from the marketplace and manage their sessions here.
                        </Text>
                    </View>
                ) : items.map((item) => (
                    <View
                        key={item.sessionId}
                        style={[
                            styles.row,
                            {
                                borderColor: theme.colors.divider,
                                backgroundColor: theme.colors.groupped.background,
                            },
                        ]}
                    >
                        <Pressable style={styles.rowMain} onPress={() => onOpenSession(item.sessionId)}>
                            <Avatar
                                id={item.specId || item.sessionId}
                                size={42}
                                flavor={item.runtimeType ?? undefined}
                            />
                            <View style={styles.copy}>
                                <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                                    {item.displayName}
                                </Text>
                                <Text style={[styles.meta, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                    {buildMeta(item)}
                                </Text>
                                <Text style={[styles.detail, { color: theme.colors.textSecondary }]} numberOfLines={2}>
                                    {item.activeTaskTitle
                                        ? `Working on ${item.activeTaskTitle}`
                                        : item.sessionPath || item.sessionId}
                                </Text>
                            </View>
                        </Pressable>
                        <View style={styles.actions}>
                            <Pressable
                                onPress={() => onRenameSession(item.sessionId, item.displayName)}
                                style={[
                                    styles.iconButton,
                                    { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface },
                                ]}
                            >
                                <Ionicons name="pencil-outline" size={15} color={theme.colors.text} />
                            </Pressable>
                            <Pressable
                                onPress={() => onRemoveAgent(item.sessionId, item.displayName)}
                                style={[
                                    styles.iconButton,
                                    { borderColor: theme.colors.divider, backgroundColor: theme.colors.surface },
                                ]}
                            >
                                <Ionicons name="person-remove-outline" size={15} color={theme.colors.text} />
                            </Pressable>
                            <Pressable
                                onPress={() => onDeleteSession(item.sessionId, item.displayName)}
                                style={[
                                    styles.iconButton,
                                    { borderColor: 'rgba(255, 59, 48, 0.24)', backgroundColor: 'rgba(255, 59, 48, 0.08)' },
                                ]}
                            >
                                <Ionicons name="trash-outline" size={15} color={theme.colors.textDestructive} />
                            </Pressable>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
});
