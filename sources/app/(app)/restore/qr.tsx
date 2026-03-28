import React, { memo, useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { generateAuthKeyPair, authQRStart } from '@/auth/authQRStart';
import { authQRWait } from '@/auth/authQRWait';
import { encodeBase64 } from '@/encryption/base64';
import { QRCode } from '@/components/qr/QRCode';
import { ItemList } from '@/components/ui/ItemList';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';
import { SidebarView } from '@/components/layout/SidebarView';
import { DESKTOP_BREAKPOINT } from '@/navigation/navigationConfig';
import { useEscapeAction } from '@/hooks/useEscapeAction';
import { goBackOrReturn } from '@/utils/returnNavigation';
import { t } from '@/text';
import { layout } from '@/utils/layout';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

export default memo(function RestoreQR() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const auth = useAuth();
    const router = useRouter();
    const { width: windowWidth } = useWindowDimensions();
    const isDesktopShell = Platform.OS === 'web' && windowWidth >= DESKTOP_BREAKPOINT;
    const [authReady, setAuthReady] = useState(false);
    const isCancelledRef = useRef(false);

    const keypair = React.useMemo(() => generateAuthKeyPair(), []);
    const qrData = React.useMemo(
        () => 'happy:///account?' + encodeBase64(keypair.publicKey, 'base64url'),
        [keypair],
    );

    const handleExit = React.useCallback(() => {
        goBackOrReturn(router, undefined, '/restore');
    }, [router]);

    useEscapeAction(isDesktopShell, handleExit);

    useEffect(() => {
        const run = async () => {
            try {
                const success = await authQRStart(keypair);
                if (!success || isCancelledRef.current) {
                    if (!isCancelledRef.current) {
                        Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                    }
                    return;
                }

                setAuthReady(true);

                const credentials = await authQRWait(
                    keypair,
                    undefined,
                    () => isCancelledRef.current,
                );

                if (credentials && !isCancelledRef.current) {
                    const secretString = encodeBase64(credentials.secret, 'base64url');
                    await auth.login(credentials.token, secretString);
                    if (!isCancelledRef.current) {
                        router.back();
                    }
                } else if (!isCancelledRef.current) {
                    Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                }
            } catch {
                if (!isCancelledRef.current) {
                    Modal.alert(t('common.error'), t('errors.authenticationFailed'));
                }
            }
        };

        run();

        return () => {
            isCancelledRef.current = true;
        };
    }, [keypair]);

    const content = (
        <ItemList
            style={styles.page}
            containerStyle={[
                styles.contentContainer,
                { maxWidth: Math.min(layout.maxWidth, 880), alignSelf: 'center', width: '100%' },
            ]}
        >
            <View style={styles.hero}>
                <Text style={styles.eyebrow}>{t('home.devicesSection')}</Text>
                <Text style={styles.title}>{t('connect.linkViaQRCode')}</Text>
                <Text style={styles.subtitle}>{t('connect.linkViaQRCodeInstructions')}</Text>
            </View>

            <View style={styles.qrContainer}>
                {!authReady ? (
                    <View style={[styles.qrPlaceholder, { backgroundColor: theme.colors.surface }]}>
                        <ActivityIndicator size="large" color={theme.colors.text} />
                    </View>
                ) : (
                    <QRCode
                        data={qrData}
                        size={240}
                        foregroundColor="#000000"
                        backgroundColor="#FFFFFF"
                    />
                )}
            </View>
        </ItemList>
    );

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: !isDesktopShell,
                    headerTitle: t('connect.linkViaQRCode'),
                    headerBackTitle: t('common.back'),
                }}
            />
            {isDesktopShell ? <SidebarView mainPanel={content} /> : content}
        </>
    );
});

const stylesheet = StyleSheet.create((theme) => ({
    page: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    contentContainer: {
        paddingBottom: 24,
    },
    hero: {
        paddingHorizontal: 28,
        paddingTop: 24,
        paddingBottom: 8,
    },
    eyebrow: {
        fontSize: 11,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: theme.colors.textSecondary,
        ...Typography.default('semiBold'),
    },
    title: {
        marginTop: 10,
        fontSize: 30,
        lineHeight: 34,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    subtitle: {
        marginTop: 8,
        fontSize: 14,
        lineHeight: 21,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    qrContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    qrPlaceholder: {
        width: 240,
        height: 240,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
    },
}));
