import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUnistyles } from 'react-native-unistyles';
import { useAuth } from '@/auth/AuthContext';
import { Text } from '@/components/ui/StyledText';
import { Item } from '@/components/ui/Item';
import { ItemGroup } from '@/components/ui/ItemGroup';
import { ItemList } from '@/components/ui/ItemList';
import { SidebarView } from '@/components/layout/SidebarView';
import { getCurrentLanguage, t } from '@/text';
import { getServerUrl } from '@/sync/serverConfig';

interface ChannelStatusResponse {
    weixin: { connected: boolean } | null;
}

export default React.memo(function ChannelsScreen() {
    const { theme } = useUnistyles();
    const router = useRouter();
    const auth = useAuth();
    const isChinese = getCurrentLanguage() === 'zh-Hans';
    const serverUrl = getServerUrl();

    const [weixinConnected, setWeixinConnected] = React.useState<boolean | null>(null);

    React.useEffect(() => {
        if (!auth.credentials?.token) return;

        const fetchStatus = async () => {
            try {
                const response = await fetch(`${serverUrl}/v1/channels/status`, {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${auth.credentials!.token}`,
                        'Content-Type': 'application/json',
                    },
                });
                if (!response.ok) return;
                const data: ChannelStatusResponse = await response.json();
                setWeixinConnected(data.weixin?.connected ?? false);
            } catch {
                // silent fail on status check
            }
        };

        void fetchStatus();
    }, [auth.credentials?.token, serverUrl]);

    const statusText = weixinConnected === null
        ? undefined
        : weixinConnected
            ? (isChinese ? '已连接' : 'Connected')
            : (isChinese ? '未连接' : 'Not connected');

    const statusColor = weixinConnected
        ? theme.colors.status.connected
        : theme.colors.status.disconnected;

    const mainPanel = (
        <ItemList style={{ paddingTop: 0 }}>
            {/* Connected Channels */}
            <ItemGroup
                title={t('channelsList.connectedTitle')}
                footer={t('channelsList.connectedFooter')}
            >
                <Item
                    title={t('settings.channelsWeixin')}
                    subtitle={t('settings.channelsWeixinSubtitle')}
                    icon={<Ionicons name="chatbubbles-outline" size={29} color="#09B83E" />}
                    detail={statusText}
                    onPress={() => router.push('/channels/weixin' as any)}
                    showChevron
                />
            </ItemGroup>

            {/* Available Channels */}
            <ItemGroup title={t('channelsList.availableTitle')}>
                <Item
                    title="Telegram"
                    subtitle={isChinese ? '即将推出' : 'Coming soon'}
                    icon={<Ionicons name="paper-plane-outline" size={29} color={theme.colors.textSecondary} />}
                    disabled
                />
                <Item
                    title="Discord"
                    subtitle={isChinese ? '即将推出' : 'Coming soon'}
                    icon={<Ionicons name="game-controller-outline" size={29} color={theme.colors.textSecondary} />}
                    disabled
                />
                <Item
                    title="Slack"
                    subtitle={isChinese ? '即将推出' : 'Coming soon'}
                    icon={<Ionicons name="logo-slack" size={29} color={theme.colors.textSecondary} />}
                    disabled
                />
            </ItemGroup>

            {/* Usage Guide */}
            <ItemGroup title={t('channels.usageGuide')}>
                <Item title={t('channels.guide1')} icon={<Ionicons name="arrow-forward-circle-outline" size={22} color={theme.colors.textSecondary} />} />
                <Item title={t('channels.guide2')} icon={<Ionicons name="at-outline" size={22} color={theme.colors.textSecondary} />} />
                <Item title={t('channels.guide3')} icon={<Ionicons name="pricetag-outline" size={22} color={theme.colors.textSecondary} />} />
            </ItemGroup>
        </ItemList>
    );

    return <SidebarView mainPanel={mainPanel} />;
});
