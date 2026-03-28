import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';

// --- hoisted mock state ---
const mockAuthQRStart = vi.hoisted(() => vi.fn(async () => true));
const mockAuthQRWait = vi.hoisted(() => vi.fn(async () => null as null | { secret: Uint8Array; token: string }));
const mockLogin = vi.hoisted(() => vi.fn(async () => {}));
const mockRouterBack = vi.hoisted(() => vi.fn());
const mockModalAlert = vi.hoisted(() => vi.fn());
const mockEncodeBase64 = vi.hoisted(() => vi.fn((bytes: Uint8Array, _enc?: string) => 'mock-encoded-' + bytes.length));

// Stub keypair so we can assert the exact value passed to authQRStart
const STUB_KEYPAIR = {
    publicKey: new Uint8Array(32).fill(1),
    secretKey: new Uint8Array(32).fill(2),
};

vi.mock('@/auth/authQRStart', () => ({
    generateAuthKeyPair: () => STUB_KEYPAIR,
    authQRStart: mockAuthQRStart,
}));

vi.mock('@/auth/authQRWait', () => ({
    authQRWait: mockAuthQRWait,
}));

vi.mock('@/auth/AuthContext', () => ({
    useAuth: () => ({ login: mockLogin }),
}));

vi.mock('@/modal', () => ({
    Modal: { alert: mockModalAlert },
}));

vi.mock('expo-router', () => ({
    Stack: { Screen: () => null },
    useRouter: () => ({ back: mockRouterBack, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('react-native-unistyles', () => {
    const theme = {
        colors: {
            text: '#000000',
            textSecondary: '#666666',
            surface: '#ffffff',
            groupped: { background: '#f2f2f7' },
            input: { background: '#ffffff', placeholder: '#c7c7cc', text: '#000000' },
        },
    };
    return {
        StyleSheet: {
            create: (factory: (t: typeof theme) => object) => factory(theme),
        },
        useUnistyles: () => ({ theme }),
    };
});

vi.mock('@/components/qr/QRCode', () => ({
    QRCode: () => null,
}));

vi.mock('@/components/ui/ItemList', () => ({
    ItemList: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/layout/SidebarView', () => ({
    SidebarView: ({ mainPanel }: { mainPanel: React.ReactNode }) => mainPanel,
}));

vi.mock('@/hooks/useEscapeAction', () => ({
    useEscapeAction: () => {},
}));

vi.mock('@/utils/returnNavigation', () => ({
    goBackOrReturn: vi.fn(),
}));

vi.mock('@/text', () => ({
    t: (key: string) => key,
}));

vi.mock('@/utils/layout', () => ({
    layout: { maxWidth: 320 },
}));

vi.mock('@/navigation/navigationConfig', () => ({
    DESKTOP_BREAKPOINT: 768,
}));

vi.mock('@/constants/Typography', () => ({
    Typography: { default: () => ({}), mono: () => ({}) },
}));

vi.mock('@/encryption/base64', () => ({
    encodeBase64: mockEncodeBase64,
}));

import RestoreQR from './qr';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderQR() {
    let renderer!: ReturnType<typeof create>;
    act(() => {
        renderer = create(React.createElement(RestoreQR as React.ComponentType));
    });
    return {
        unmount: () => act(() => { renderer.unmount(); }),
    };
}

describe('RestoreQR', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockAuthQRStart.mockReset().mockResolvedValue(true);
        mockAuthQRWait.mockReset().mockResolvedValue(null);
        mockLogin.mockReset();
        mockRouterBack.mockReset();
        mockModalAlert.mockReset();
        mockEncodeBase64.mockImplementation((bytes: Uint8Array, _enc?: string) => 'mock-encoded-' + bytes.length);

        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((msg?: unknown) => {
            if (typeof msg === 'string' && msg.includes('react-test-renderer is deprecated')) return;
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('should call authQRStart with the generated keypair on mount', async () => {
        renderQR();

        await act(async () => {
            await Promise.resolve();
        });

        expect(mockAuthQRStart).toHaveBeenCalledTimes(1);
        expect(mockAuthQRStart).toHaveBeenCalledWith(STUB_KEYPAIR);
    });

    it('should call auth.login and router.back when QR auth succeeds', async () => {
        const credentials = { secret: new Uint8Array(32).fill(3), token: 'tok-123' };
        mockAuthQRStart.mockResolvedValue(true);
        mockAuthQRWait.mockResolvedValue(credentials);

        renderQR();

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(mockLogin).toHaveBeenCalledTimes(1);
        expect(mockLogin).toHaveBeenCalledWith('tok-123', expect.stringContaining('mock-encoded'));
        expect(mockRouterBack).toHaveBeenCalledTimes(1);
    });

    it('should show error modal when authQRStart fails', async () => {
        mockAuthQRStart.mockResolvedValue(false);

        renderQR();

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(mockModalAlert).toHaveBeenCalledTimes(1);
        expect(mockLogin).not.toHaveBeenCalled();
        expect(mockRouterBack).not.toHaveBeenCalled();
    });

    it('should show error modal when authQRWait returns null (auth rejected)', async () => {
        mockAuthQRStart.mockResolvedValue(true);
        mockAuthQRWait.mockResolvedValue(null);

        renderQR();

        await act(async () => {
            await new Promise(resolve => setTimeout(resolve, 0));
        });

        expect(mockModalAlert).toHaveBeenCalledTimes(1);
        expect(mockLogin).not.toHaveBeenCalled();
    });

    it('should not call auth.login or show modal after unmount (cancelled)', async () => {
        let resolveWait!: (val: { secret: Uint8Array; token: string } | null) => void;
        mockAuthQRStart.mockResolvedValue(true);
        mockAuthQRWait.mockImplementation(
            ((_kp: unknown, _progress: unknown, shouldCancel: (() => boolean) | undefined) =>
                new Promise<{ secret: Uint8Array; token: string } | null>(resolve => {
                    resolveWait = resolve;
                    // Poll the cancel flag — simulate what the real implementation does
                    const interval = setInterval(() => {
                        if (shouldCancel && shouldCancel()) {
                            clearInterval(interval);
                            resolve(null);
                        }
                    }, 5);
                })) as any
        );

        const { unmount } = renderQR();

        await act(async () => {
            await Promise.resolve();
        });

        unmount();

        // Resolve after unmount — login and modal should NOT be called
        await act(async () => {
            resolveWait({ secret: new Uint8Array(32), token: 'late-token' });
            await new Promise(resolve => setTimeout(resolve, 20));
        });

        expect(mockLogin).not.toHaveBeenCalled();
        expect(mockModalAlert).not.toHaveBeenCalled();
    });
});
