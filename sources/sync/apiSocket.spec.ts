import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
    io: vi.fn(),
    logout: vi.fn(),
}));

vi.mock('socket.io-client', () => ({
    io: mockState.io,
}));

vi.mock('@/auth/AuthContext', () => ({
    getCurrentAuth: () => ({ logout: mockState.logout }),
}));

vi.mock('@/auth/tokenStorage', () => ({
    TokenStorage: {
        getCredentials: vi.fn(),
    },
}));

import { ApiSocket } from './apiSocket';

class MockSocket {
    recovered = false;
    id = 'mock-socket-id';
    disconnect = vi.fn();
    emit = vi.fn();
    emitWithAck = vi.fn();

    private handlers = new Map<string, Array<(...args: any[]) => void>>();
    private anyHandlers: Array<(event: string, data: any) => void> = [];

    on(event: string, handler: (...args: any[]) => void) {
        const existing = this.handlers.get(event) ?? [];
        existing.push(handler);
        this.handlers.set(event, existing);
        return this;
    }

    onAny(handler: (event: string, data: any) => void) {
        this.anyHandlers.push(handler);
        return this;
    }

    trigger(event: string, ...args: any[]) {
        for (const handler of this.handlers.get(event) ?? []) {
            handler(...args);
        }

        if (!['connect', 'disconnect', 'connect_error', 'error'].includes(event)) {
            for (const handler of this.anyHandlers) {
                handler(event, args[0]);
            }
        }
    }
}

describe('ApiSocket reconnect', () => {
    let sockets: MockSocket[] = [];
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        sockets = [];
        mockState.io.mockReset();
        mockState.logout.mockReset();
        mockState.io.mockImplementation(() => {
            const socket = new MockSocket();
            sockets.push(socket);
            return socket as any;
        });

        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleLogSpy.mockRestore();
    });

    function createSocket() {
        const apiSocket = new ApiSocket();
        apiSocket.initialize({ endpoint: 'https://example.com/api/v3', token: 'token-123' }, {} as any);
        return {
            apiSocket,
            socket: sockets[0]!,
        };
    }

    it('should call reconnectedListeners when !recovered on connect', () => {
        const { apiSocket, socket } = createSocket();
        const reconnected = vi.fn();

        apiSocket.onReconnected(reconnected);

        socket.recovered = false;
        socket.trigger('connect');

        expect(reconnected).toHaveBeenCalledTimes(1);
    });

    it('should NOT call reconnectedListeners when recovered=true', () => {
        const { apiSocket, socket } = createSocket();
        const reconnected = vi.fn();

        apiSocket.onReconnected(reconnected);

        socket.recovered = true;
        socket.trigger('connect');

        expect(reconnected).not.toHaveBeenCalled();
    });

    it('should update status to disconnected on disconnect', () => {
        const { apiSocket, socket } = createSocket();
        const statuses: string[] = [];

        apiSocket.onStatusChange((status) => {
            statuses.push(status);
        });

        socket.trigger('disconnect', 'transport close');

        expect(statuses.at(-1)).toBe('disconnected');
    });

    it('should stop reconnecting on auth failure (401)', () => {
        const { socket } = createSocket();

        socket.trigger('connect_error', new Error('401 Unauthorized'));

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(mockState.logout).toHaveBeenCalledTimes(1);
        expect(mockState.io).toHaveBeenCalledTimes(1);
    });

    it('should downgrade to polling when websocket fails', () => {
        const { socket } = createSocket();

        socket.trigger('connect_error', new Error('websocket error'));

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(mockState.logout).not.toHaveBeenCalled();
        expect(mockState.io).toHaveBeenCalledTimes(2);
        expect(mockState.io.mock.calls[0][1].transports).toEqual(['websocket', 'polling']);
        expect(mockState.io.mock.calls[1][1].transports).toEqual(['polling']);
    });

    it('should reconnect with a new token when updateToken changes credentials', () => {
        const { apiSocket, socket } = createSocket();

        apiSocket.updateToken('token-456');

        expect(socket.disconnect).toHaveBeenCalledTimes(1);
        expect(mockState.io).toHaveBeenCalledTimes(2);
        expect(mockState.io.mock.calls[1][1].auth.token).toBe('token-456');
    });

    it('should dispatch registered message handlers and stop after offMessage', () => {
        const { apiSocket, socket } = createSocket();
        const handler = vi.fn();

        apiSocket.onMessage('update', handler);

        socket.trigger('update', { id: 'evt-1' });
        expect(handler).toHaveBeenCalledWith({ id: 'evt-1' });

        apiSocket.offMessage('update', handler);
        socket.trigger('update', { id: 'evt-2' });

        expect(handler).toHaveBeenCalledTimes(1);
    });
});
