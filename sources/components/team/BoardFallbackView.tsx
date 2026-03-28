import React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { stylesheet } from '@/app/(app)/teams/teamStyles';
import { t } from '@/text';

interface BoardFallbackViewProps {
    isMissingDesktopRoom: boolean;
    desktopRoom: { name?: string } | null | undefined;
    collaborationState: unknown;
    isLoading: boolean;
    boardFallbackTitle: string;
    boardFallbackDescription: string;
    desktopBridge: unknown;
    isArtifactParseError: boolean;
    isAuthMissing: boolean;
    onInitialize: () => void;
    isOrgManagerInitializing?: boolean;
}

export function BoardFallbackView({
    isMissingDesktopRoom,
    desktopRoom,
    collaborationState,
    isLoading,
    boardFallbackTitle,
    boardFallbackDescription,
    desktopBridge,
    isArtifactParseError,
    isAuthMissing,
    onInitialize,
    isOrgManagerInitializing,
}: BoardFallbackViewProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    return (
        <View style={styles.loadingContainer}>
            {isOrgManagerInitializing ? (
                <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
                    <ActivityIndicator size="large" />
                    <Text style={[styles.title, { marginTop: 16, textAlign: 'center' }]}>
                        {t('teams.orgManagerInitializing')}
                    </Text>
                    <Text style={[styles.subtitle, { marginTop: 8, textAlign: 'center', maxWidth: 320 }]}>
                        {t('teams.orgManagerInitializingSubtitle')}
                    </Text>
                </View>
            ) : ((isMissingDesktopRoom && !desktopRoom && !collaborationState) || isLoading) ? (
                <ActivityIndicator size="large" />
            ) : (
                <View style={{ alignItems: 'center', padding: 20 }}>
                    <Ionicons name="alert-circle-outline" size={48} color={theme.colors.textSecondary} />
                    <Text style={[styles.title, { marginTop: 16, textAlign: 'center' }]}>
                        {boardFallbackTitle}
                    </Text>
                    <Text style={[styles.subtitle, { marginTop: 8, textAlign: 'center', maxWidth: 300 }]}>
                        {boardFallbackDescription}
                    </Text>
                    {!desktopBridge && !isArtifactParseError && !isAuthMissing ? (
                        <Pressable
                            style={{
                                marginTop: 20,
                                backgroundColor: theme.colors.button.primary.background,
                                paddingHorizontal: 24,
                                paddingVertical: 12,
                                borderRadius: 8
                            }}
                            onPress={onInitialize}
                        >
                            <Text style={{ color: theme.colors.button.primary.tint, fontWeight: '600' }}>
                                Initialize Board
                            </Text>
                        </Pressable>
                    ) : null}
                </View>
            )}
        </View>
    );
}
