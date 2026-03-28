import { io, type Socket } from 'socket.io-client';
import { TokenStorage } from '@/auth/tokenStorage';
import { Encryption } from './encryption/encryption';
import { getCurrentAuth } from '@/auth/AuthContext';

//
// Types
//

export interface SyncSocketConfig {
    endpoint: string;
    token: string;
}

export interface SyncSocketState {
    isConnected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    lastError: Error | null;
}

export type SyncSocketListener = (state: SyncSocketState) => void;

const AUTH_FAILURE_PATTERNS = [
    'authentication failed',
    'invalid token',
    'account not found for token',
    'invalid authentication token',
    'missing authentication token',
];

function getErrorText(error: unknown): string {
    if (typeof error === 'string') {
        return error;
    }

    if (error instanceof Error) {
        return error.message;
    }

    if (error && typeof error === 'object') {
        const value = error as Record<string, unknown>;
        return [value.message, value.description, value.type, value.context]
            .filter((part): part is string => typeof part === 'string' && part.length > 0)
            .join(' ');
    }

    return '';
}

function isAuthFailure(error: unknown): boolean {
    const message = getErrorText(error).toLowerCase();
    return AUTH_FAILURE_PATTERNS.some(pattern => message.includes(pattern)) || /\b401\b/.test(message);
}

function isWebSocketTransportFailure(error: unknown): boolean {
    const message = getErrorText(error).toLowerCase();

    return message.includes('websocket')
        || message.includes('transport error')
        || message.includes('xhr poll error');
}

//
// Main Class
//

export class ApiSocket {

    // State
    private socket: Socket | null = null;
    private config: SyncSocketConfig | null = null;
    private encryption: Encryption | null = null;
    private messageHandlers: Map<string, (data: any) => void> = new Map();
    private reconnectedListeners: Set<() => void> = new Set();
    private statusListeners: Set<(status: 'disconnected' | 'connecting' | 'connected' | 'error') => void> = new Set();
    private currentStatus: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
    private usePollingFallback = false;

    //
    // Initialization
    //

    initialize(config: SyncSocketConfig, encryption: Encryption) {
        this.config = config;
        this.encryption = encryption;
        this.connect();
    }

    //
    // Connection Management
    //

    connect() {
        if (!this.config || this.socket) {
            return;
        }

        this.updateStatus('connecting');

        // Extract path prefix from endpoint URL (e.g. '/api/v3' from 'https://top1vibe.com/api/v3')
        // socket.io path is relative to the domain root, so we must prepend the prefix
        const endpointUrl = new URL(this.config.endpoint);
        const pathPrefix = endpointUrl.pathname.replace(/\/+$/, ''); // remove trailing slash
        this.socket = io(endpointUrl.origin, {
            path: `${pathPrefix}/v1/updates`,
            auth: {
                token: this.config.token,
                clientType: 'user-scoped' as const
            },
            transports: this.usePollingFallback ? ['polling'] : ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: Infinity
        });

        this.setupEventHandlers();
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.updateStatus('disconnected');
    }

    /**
     * Manual reconnect — tears down the current socket and starts fresh.
     * Safe to call even when already disconnected.
     */
    reconnect() {
        if (this.config && this.encryption) {
            this.disconnect();
            this.connect();
        }
    }

    //
    // Listener Management
    //

    onReconnected = (listener: () => void) => {
        this.reconnectedListeners.add(listener);
        return () => this.reconnectedListeners.delete(listener);
    };

    onStatusChange = (listener: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void) => {
        this.statusListeners.add(listener);
        // Immediately notify with current status
        listener(this.currentStatus);
        return () => this.statusListeners.delete(listener);
    };

    //
    // Message Handling
    //

    onMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.set(event, handler);
        return () => this.messageHandlers.delete(event);
    }

    offMessage(event: string, handler: (data: any) => void) {
        this.messageHandlers.delete(event);
    }

    /**
     * RPC call for sessions - uses session-specific encryption
     */
    async sessionRPC<R, A>(sessionId: string, method: string, params: A): Promise<R> {
        const sessionEncryption = this.encryption!.getSessionEncryption(sessionId);
        if (!sessionEncryption) {
            throw new Error(`Session encryption not found for ${sessionId}`);
        }
        
        const result = await this.socket!.emitWithAck('rpc-call', {
            method: `${sessionId}:${method}`,
            params: await sessionEncryption.encryptRaw(params)
        });
        
        if (result.ok) {
            return await sessionEncryption.decryptRaw(result.result) as R;
        }
        throw new Error(result.error || 'RPC call failed');
    }

    /**
     * RPC call for machines - uses legacy/global encryption (for now)
     */
    async machineRPC<R, A>(machineId: string, method: string, params: A): Promise<R> {   
        const machineEncryption = this.encryption!.getMachineEncryption(machineId);
        if (!machineEncryption) {
            throw new Error(`Machine encryption not found for ${machineId}`);
        }
        
        const result = await this.socket!.emitWithAck('rpc-call', {
            method: `${machineId}:${method}`,
            params: await machineEncryption.encryptRaw(params)
        });
        
        if (result.ok) {
            return await machineEncryption.decryptRaw(result.result) as R;
        }
        throw new Error(result.error || 'RPC call failed');
    }

    send(event: string, data: any) {
        this.socket!.emit(event, data);
        return true;
    }

    async emitWithAck<T = any>(event: string, data: any): Promise<T> {
        if (!this.socket) {
            throw new Error('Socket not connected');
        }
        return await this.socket.emitWithAck(event, data);
    }

    //
    // HTTP Requests
    //

    async request(path: string, options?: RequestInit): Promise<Response> {
        if (!this.config) {
            throw new Error('SyncSocket not initialized');
        }

        const credentials = await TokenStorage.getCredentials();
        if (!credentials) {
            throw new Error('No authentication credentials');
        }

        const url = `${this.config.endpoint}${path}`;
        const headers = {
            'Authorization': `Bearer ${credentials.token}`,
            ...options?.headers
        };

        return fetch(url, {
            ...options,
            headers
        });
    }

    //
    // Token Management
    //

    updateToken(newToken: string) {
        if (this.config && this.config.token !== newToken) {
            this.config.token = newToken;

            if (this.socket) {
                this.disconnect();
                this.connect();
            }
        }
    }

    //
    // Private Methods
    //

    private updateStatus(status: 'disconnected' | 'connecting' | 'connected' | 'error') {
        if (this.currentStatus !== status) {
            this.currentStatus = status;
            this.statusListeners.forEach(listener => listener(status));
        }
    }

    private setupEventHandlers() {
        const socket = this.socket;
        if (!socket) return;

        // Connection events
        socket.on('connect', () => {
            if (this.socket !== socket) {
                return;
            }

            console.log('🔌 SyncSocket: Connected, recovered: ' + socket.recovered);
            console.log('🔌 SyncSocket: Socket ID:', socket.id);
            this.updateStatus('connected');
            if (!socket.recovered) {
                this.reconnectedListeners.forEach(listener => listener());
            }
        });

        socket.on('disconnect', (reason) => {
            if (this.socket !== socket) {
                return;
            }

            console.log('🔌 SyncSocket: Disconnected', reason);
            this.updateStatus('disconnected');
        });

        // Error events
        socket.on('connect_error', (error) => {
            if (this.socket !== socket) {
                return;
            }

            console.error('🔌 SyncSocket: Connection error', error);
            // Auth rejection from server — stop reconnecting and logout
            if (isAuthFailure(error)) {
                console.error('🔌 SyncSocket: Auth rejected, logging out');
                this.disconnect();
                const auth = getCurrentAuth();
                if (auth) {
                    auth.logout();
                }
                return;
            }

            if (!this.usePollingFallback && isWebSocketTransportFailure(error)) {
                this.reconnectWithPollingFallback(socket, error);
                return;
            }

            this.updateStatus('error');
        });

        socket.on('error', (error) => {
            if (this.socket !== socket) {
                return;
            }

            console.error('🔌 SyncSocket: Error', error);
            if (isAuthFailure(error)) {
                console.error('🔌 SyncSocket: Auth rejected via error event, logging out');
                this.disconnect();
                const auth = getCurrentAuth();
                if (auth) {
                    auth.logout();
                }
                return;
            }

            if (!this.usePollingFallback && isWebSocketTransportFailure(error)) {
                this.reconnectWithPollingFallback(socket, error);
                return;
            }

            this.updateStatus('error');
        });

        // Message handling
        socket.onAny((event, data) => {
            if (this.socket !== socket) {
                return;
            }

            const handler = this.messageHandlers.get(event);
            if (handler) {
                handler(data);
            } else if (event !== 'heartbeat') {
                console.warn(`📥 SyncSocket: No handler registered for '${event}'`);
            }
        });
    }

    private reconnectWithPollingFallback(socket: Socket, error: unknown) {
        console.warn('🔌 SyncSocket: WebSocket transport failed, retrying with polling fallback', error);
        this.usePollingFallback = true;
        socket.disconnect();
        if (this.socket === socket) {
            this.socket = null;
        }
        this.connect();
    }
}

//
// Singleton Export
//

export const apiSocket = new ApiSocket();
