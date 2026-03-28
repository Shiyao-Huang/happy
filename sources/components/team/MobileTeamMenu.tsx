import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';

interface MobileTeamMenuProps {
    onClose: () => void;
    onRename: () => void;
    onRecover: () => void;
    isRecovering: boolean;
    onArchive: () => void;
    onDelete: () => void;
}

export function MobileTeamMenu({
    onClose,
    onRename,
    onRecover,
    isRecovering,
    onArchive,
    onDelete,
}: MobileTeamMenuProps) {
    const { theme } = useUnistyles();

    return (
        <>
            <Pressable
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999,
                }}
                onPress={onClose}
            />
            <View style={{
                position: 'absolute',
                top: 50,
                right: 8,
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 12,
                elevation: 8,
                minWidth: 180,
                borderWidth: 1,
                borderColor: theme.colors.divider,
                zIndex: 1000,
            }}>
                <Pressable
                    onPress={onRename}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.divider,
                    }}
                >
                    <Ionicons name="pencil-outline" size={18} color={theme.colors.text} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.text }}>Rename</Text>
                </Pressable>
                <Pressable
                    onPress={onRecover}
                    disabled={isRecovering}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.divider,
                        opacity: isRecovering ? 0.6 : 1,
                    }}
                >
                    <Ionicons name="refresh-outline" size={18} color={theme.colors.text} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.text }}>
                        {isRecovering ? 'Recovering…' : 'Recover'}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onArchive}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: theme.colors.divider,
                    }}
                >
                    <Ionicons name="archive-outline" size={18} color={theme.colors.text} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.text }}>Archive</Text>
                </Pressable>
                <Pressable
                    onPress={onDelete}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        padding: 14,
                    }}
                >
                    <Ionicons name="trash-outline" size={18} color={theme.colors.textDestructive} style={{ marginRight: 12 }} />
                    <Text style={{ fontSize: 15, color: theme.colors.textDestructive }}>Delete</Text>
                </Pressable>
            </View>
        </>
    );
}
