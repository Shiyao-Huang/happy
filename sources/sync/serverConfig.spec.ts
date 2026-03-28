import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
const originalServerEnv = process.env.EXPO_PUBLIC_HAPPY_SERVER_URL;

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(key: string) {
            return storage.get(key);
        }

        set(key: string, value: string) {
            storage.set(key, value);
        }

        delete(key: string) {
            storage.delete(key);
        }
    },
}));

function setWindowHostname(hostname: string) {
    Object.defineProperty(globalThis, 'window', {
        value: { location: { hostname } },
        configurable: true,
        writable: true,
    });
}

async function loadServerConfig() {
    vi.resetModules();
    return await import('./serverConfig');
}

describe('serverConfig', () => {
    beforeEach(() => {
        storage.clear();
        delete process.env.EXPO_PUBLIC_HAPPY_SERVER_URL;
        delete (globalThis as { window?: Window }).window;
    });

    afterEach(() => {
        if (originalServerEnv) {
            process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = originalServerEnv;
        } else {
            delete process.env.EXPO_PUBLIC_HAPPY_SERVER_URL;
        }
        delete (globalThis as { window?: Window }).window;
        vi.restoreAllMocks();
    });

    it('uses the hosted default server for localhost web builds', async () => {
        setWindowHostname('localhost');

        const { getServerUrl } = await loadServerConfig();

        expect(getServerUrl()).toBe('https://top1vibe.com');
    });

    it('keeps LAN auto-discovery for private IP web builds', async () => {
        setWindowHostname('192.168.1.20');

        const { getServerUrl } = await loadServerConfig();

        expect(getServerUrl()).toBe('http://192.168.1.20:3005');
    });

    it('rewrites localhost env overrides to the current LAN host', async () => {
        process.env.EXPO_PUBLIC_HAPPY_SERVER_URL = 'http://localhost:3005';
        setWindowHostname('192.168.1.20');

        const { getServerUrl } = await loadServerConfig();

        expect(getServerUrl()).toBe('http://192.168.1.20:3005');
    });

    it('preserves explicit custom servers', async () => {
        const { getServerUrl, isUsingCustomServer, setServerUrl } = await loadServerConfig();

        setServerUrl('https://custom.example.com');

        expect(getServerUrl()).toBe('https://custom.example.com');
        expect(isUsingCustomServer()).toBe(true);
    });
});
