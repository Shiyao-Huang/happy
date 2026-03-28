/**
 * AgentRoster.tsx
 *
 * Displays all team members with a three-state presence dot:
 *   🟢 green     — active and fresh (activeAt < 2 min)
 *   ⚫ grey      — active but stale, or offline < 1 h
 *   ⬛ dark-grey — offline ≥ 1 h (dead) or no session data
 *
 * Pure view component: receives pre-processed data and an optional press handler.
 * Presence state is computed by `buildRosterItems` (agentRosterUtils.ts) which
 * delegates to `presenceUtils.getAgentPresenceVisual`.
 */
import React from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/StyledText';
import { StyleSheet } from 'react-native-unistyles';
import { buildRosterItems, type AgentRosterItem, type RosterMemberInput, type SessionInput } from './agentRosterUtils';

export interface AgentRosterProps {
    members: RosterMemberInput[];
    sessions: Map<string, SessionInput>;
    onAgentPress?: (sessionId: string) => void;
    title?: string;
}

export function AgentRoster({ members, sessions, onAgentPress, title = 'Team Members' }: AgentRosterProps) {
    const items = React.useMemo(
        () => buildRosterItems(members, sessions),
        [members, sessions],
    );

    const renderItem = React.useCallback(
        ({ item, index }: { item: AgentRosterItem; index: number }) => {
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            const isSingle = items.length === 1;

            return (
                <Pressable
                    style={[
                        styles.item,
                        isSingle ? styles.itemSingle
                            : isFirst ? styles.itemFirst
                                : isLast ? styles.itemLast
                                    : {},
                    ]}
                    onPress={onAgentPress ? () => onAgentPress(item.sessionId) : undefined}
                >
                    <View
                        style={[styles.statusDot, { backgroundColor: item.dotColor }]}
                    />
                    <View style={styles.content}>
                        <Text style={styles.name} numberOfLines={1}>
                            {item.displayName}
                        </Text>
                        {item.roleId ? (
                            <Text style={styles.role} numberOfLines={1}>
                                {item.roleId}
                            </Text>
                        ) : null}
                    </View>
                </Pressable>
            );
        },
        [items.length, onAgentPress],
    );

    if (items.length === 0) {
        return null;
    }

    return (
        <View style={styles.container}>
            <Text style={styles.sectionLabel}>{title}</Text>
            <FlatList
                data={items}
                renderItem={renderItem}
                keyExtractor={(item) => item.sessionId}
                scrollEnabled={false}
            />
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        marginBottom: 16,
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        paddingHorizontal: 16,
        paddingBottom: 6,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        marginHorizontal: 16,
        marginBottom: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    itemFirst: {
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    itemLast: {
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        marginBottom: 0,
    },
    itemSingle: {
        borderRadius: 12,
        marginBottom: 0,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12,
        flexShrink: 0,
    },
    content: {
        flex: 1,
    },
    name: {
        fontSize: 14,
        fontWeight: '500',
        color: theme.colors.text,
    },
    role: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 1,
    },
}));
