import React from 'react';
import {
    ActivityIndicator,
    Pressable,
    Text,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Item } from '@/components/ui/Item';
import { ItemGroup } from '@/components/ui/ItemGroup';
import { ItemList } from '@/components/ui/ItemList';
import { QRCode } from '@/components/qr';
import { useAuth } from '@/auth/AuthContext';
import { Modal } from '@/modal';
import {
    bindWeixinChannel,
    disconnectWeixinChannel,
    fetchChannelStatus,
    pollWeixinQRCode,
    requestWeixinQRCode,
    updateWeixinPushPolicy,
    type WeixinChannelStatus,
    type WeixinPushPolicy,
} from '@/sync/apiChannels';
import { t } from '@/text';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

/**
 * WeChat channel settings screen.
 *
 * V1: Configuration is handled via CLI (`aha channels weixin login`).
 * This screen shows the current status and CLI instructions.
 * Push policy selection is shown as copyable CLI commands.
 */
export default React.memo(function WeixinChannelScreen() {
    const { theme } = useUnistyles();
    const { credentials } = useAuth();
    const [status, setStatus] = React.useState<WeixinChannelStatus | null>(null);
    const [qrCode, setQrCode] = React.useState<{ qrcode: string; displayUrl: string } | null>(null);
    const [isLoading, setIsLoading] = React.useState(false);
    const [isPolling, setIsPolling] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);

    const copyCommand = React.useCallback(async (cmd: string, label?: string) => {
        await Clipboard.setStringAsync(cmd);
        Modal.alert(
            t('common.copied'),
            t('items.copiedToClipboard', { label: label ?? cmd }),
        );
    }, []);

    const refreshStatus = React.useCallback(async () => {
        if (!credentials) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await fetchChannelStatus(credentials);
            setStatus(result.weixin);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [credentials]);

    React.useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    React.useEffect(() => {
        if (!credentials || !qrCode) return;

        let cancelled = false;
        const interval = setInterval(async () => {
            if (cancelled) return;

            try {
                setIsPolling(true);
                const result = await pollWeixinQRCode(credentials, qrCode.qrcode);
                if (cancelled) return;

                if (result.status === 'confirmed' && result.credentials) {
                    await bindWeixinChannel(credentials, result.credentials);
                    if (cancelled) return;
                    setNotice(t('channels.weixinConnected'));
                    setQrCode(null);
                    await refreshStatus();
                } else if (result.status === 'expired') {
                    setError(t('channels.weixinQrExpired'));
                    setQrCode(null);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            } finally {
                if (!cancelled) {
                    setIsPolling(false);
                }
            }
        }, 2500);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [credentials, qrCode, refreshStatus]);

    const startQrLogin = React.useCallback(async () => {
        if (!credentials) return;
        setIsLoading(true);
        setError(null);
        setNotice(null);
        try {
            const result = await requestWeixinQRCode(credentials);
            setQrCode(result);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [credentials]);

    const disconnect = React.useCallback(async () => {
        if (!credentials) return;
        setIsLoading(true);
        setError(null);
        try {
            await disconnectWeixinChannel(credentials);
            setStatus(null);
            setQrCode(null);
            setNotice(t('channels.weixinDisconnected'));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [credentials]);

    const setPolicy = React.useCallback(async (pushPolicy: WeixinPushPolicy) => {
        if (!credentials) return;
        setIsLoading(true);
        setError(null);
        try {
            await updateWeixinPushPolicy(credentials, pushPolicy);
            await refreshStatus();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsLoading(false);
        }
    }, [credentials, refreshStatus]);

    const currentPolicy = status?.pushPolicy ?? 'all';
    const isConnected = Boolean(status?.connected);

    return (
        <ItemList style={{ paddingTop: 0 }}>
            <ItemGroup title={t('channels.connectionStatus')}>
                <View style={[styles.statusCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
                    <View style={styles.statusRow}>
                        <Text style={[styles.statusLabel, { color: theme.colors.text }]}>
                            {isConnected ? t('status.connected') : t('status.disconnected')}
                        </Text>
                        {isLoading ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : null}
                    </View>
                    <Text style={[styles.statusMeta, { color: theme.colors.textSecondary }]}>
                        {isConnected
                            ? t('channels.weixinPushPolicyCurrent', { policy: currentPolicy })
                            : t('channels.weixinBindHint')}
                    </Text>
                    {error ? (
                        <Text style={[styles.statusError, { color: theme.colors.warningCritical }]}>{error}</Text>
                    ) : null}
                    {notice ? (
                        <Text style={[styles.statusNotice, { color: theme.colors.success }]}>{notice}</Text>
                    ) : null}
                    <View style={styles.actionRow}>
                        <Pressable
                            onPress={refreshStatus}
                            style={[styles.actionButton, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceHigh }]}
                        >
                            <Text style={[styles.actionText, { color: theme.colors.text }]}>{t('common.retry')}</Text>
                        </Pressable>
                        {!isConnected ? (
                            <Pressable
                                onPress={startQrLogin}
                                disabled={isLoading}
                                style={[styles.actionButton, styles.primaryAction, { backgroundColor: theme.colors.button.primary.background }]}
                            >
                                <Text style={[styles.actionText, { color: theme.colors.button.primary.tint }]}>{t('channels.connectWeixin')}</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                onPress={disconnect}
                                disabled={isLoading}
                                style={[styles.actionButton, { borderColor: theme.colors.divider, backgroundColor: theme.colors.surfaceHigh }]}
                            >
                                <Text style={[styles.actionText, { color: theme.colors.text }]}>{t('common.disconnect')}</Text>
                            </Pressable>
                        )}
                    </View>
                </View>
            </ItemGroup>

            {qrCode ? (
                <ItemGroup title={t('channels.connectWeixin')} footer={isPolling ? t('channels.weixinScanWaiting') : undefined}>
                    <View style={[styles.qrCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.divider }]}>
                        <QRCode data={qrCode.displayUrl} size={220} />
                        <Text style={[styles.qrHint, { color: theme.colors.textSecondary }]}>
                            {t('channels.weixinQrHint')}
                        </Text>
                        <Pressable onPress={() => copyCommand(qrCode.displayUrl)}>
                            <Text style={[styles.copyLink, { color: theme.colors.button.primary.background }]}>
                                {t('channels.weixinCopyQrLink')}
                            </Text>
                        </Pressable>
                    </View>
                </ItemGroup>
            ) : null}

            {isConnected ? (
                <ItemGroup title={t('channels.pushPolicyTitle')} footer={t('channels.pushPolicyFooter')}>
                    <View style={styles.policyRow}>
                        {(['all', 'important', 'silent'] as WeixinPushPolicy[]).map((policy) => {
                            const active = currentPolicy === policy;
                            const label = policy === 'all'
                                ? t('channels.policyAll')
                                : policy === 'important'
                                    ? t('channels.policyImportant')
                                    : t('channels.policySilent');
                            return (
                                <Pressable
                                    key={policy}
                                    onPress={() => setPolicy(policy)}
                                    style={[
                                        styles.policyChip,
                                        {
                                            backgroundColor: active ? theme.colors.button.primary.background : theme.colors.surface,
                                            borderColor: active ? theme.colors.button.primary.background : theme.colors.divider,
                                        },
                                    ]}
                                >
                                    <Text style={{ color: active ? theme.colors.button.primary.tint : theme.colors.text }}>
                                        {label}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </View>
                </ItemGroup>
            ) : null}

            <ItemGroup title={t('settings.channelsWeixin')} footer={t('channels.cliFooter')}>
                <Item
                    title={t('channels.connectWeixin')}
                    subtitle="aha channels weixin login"
                    icon={<Ionicons name="qr-code-outline" size={29} color="#09B83E" />}
                    onPress={() => void copyCommand('aha channels weixin login', t('channels.connectWeixin'))}
                />
                <Item
                    title={t('channels.checkStatus')}
                    subtitle="aha channels status"
                    icon={<Ionicons name="radio-outline" size={29} color="#007AFF" />}
                    onPress={() => void copyCommand('aha channels status', t('channels.checkStatus'))}
                />
                <Item
                    title={t('common.disconnect')}
                    subtitle="aha channels weixin disconnect"
                    icon={<Ionicons name="close-circle-outline" size={29} color="#FF3B30" />}
                    onPress={() => void copyCommand('aha channels weixin disconnect', t('common.disconnect'))}
                />
            </ItemGroup>

            {/* Usage guide */}
            <ItemGroup title={t('channels.usageGuide')}>
                <Item title={t('channels.guide1')} icon={<Ionicons name="arrow-forward-circle-outline" size={22} color={theme.colors.textSecondary} />} />
                <Item title={t('channels.guide2')} icon={<Ionicons name="at-outline" size={22} color={theme.colors.textSecondary} />} />
                <Item title={t('channels.guide3')} icon={<Ionicons name="pricetag-outline" size={22} color={theme.colors.textSecondary} />} />
            </ItemGroup>

        </ItemList>
    )
})

const styles = StyleSheet.create({
    statusCard: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 16,
        gap: 10,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    statusLabel: {
        fontSize: 16,
        fontWeight: '700',
    },
    statusMeta: {
        fontSize: 13,
        lineHeight: 19,
    },
    statusError: {
        fontSize: 13,
        lineHeight: 18,
    },
    statusNotice: {
        fontSize: 13,
        lineHeight: 18,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    actionButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
    },
    primaryAction: {
        borderWidth: 0,
    },
    actionText: {
        fontSize: 13,
        fontWeight: '600',
    },
    qrCard: {
        borderWidth: 1,
        borderRadius: 14,
        padding: 20,
        alignItems: 'center',
        gap: 14,
    },
    qrHint: {
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 19,
    },
    copyLink: {
        fontSize: 13,
        fontWeight: '600',
    },
    policyRow: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    policyChip: {
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
});
