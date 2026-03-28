import Constants from 'expo-constants';
import { apiSocket } from '@/sync/apiSocket';
import { AuthCredentials } from '@/auth/tokenStorage';
import { Encryption } from '@/sync/encryption/encryption';
import { decodeBase64, encodeBase64 } from '@/encryption/base64';
import { storage } from './storage';
import { ApiEphemeralUpdateSchema, ApiMessage, ApiUpdateContainerSchema } from './apiTypes';
import type { ApiEphemeralActivityUpdate, ApiEphemeralUpdate } from './apiTypes';
import { Session, Machine } from './storageTypes';
import { InvalidateSync } from '@/utils/sync';
import { SessionEncryption } from './encryption/sessionEncryption';
import { ActivityUpdateAccumulator } from './reducer/activityUpdateAccumulator';
import { MachineActivityAccumulator } from './reducer/machineActivityAccumulator';
import { randomUUID } from '@/utils/uuid';
import * as Notifications from 'expo-notifications';
import { registerPushToken } from './apiPush';
import { Platform, AppState } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';
import { NormalizedMessage, normalizeRawMessage, RawRecord } from './typesRaw';
import { applySettings, Settings, settingsDefaults, settingsParse } from './settings';
import { Profile, profileParse } from './profile';
import { loadPendingSettings, savePendingSettings } from './persistence';
import { initializeTracking, tracking } from '@/track';
import { parseToken } from '@/utils/parseToken';
import { RevenueCat, LogLevel, PaywallResult } from './revenueCat';
import { trackPaywallButtonClicked, trackPaywallPresented, trackPaywallPurchased, trackPaywallCancelled, trackPaywallRestored, trackPaywallError, trackSessionTokenUsage } from '@/track';
import { getServerUrl } from './serverConfig';
import { config } from '@/config';
import { log } from '@/log';
import { gitStatusSync } from './gitStatusSync';
import { projectManager } from './projectManager';
import { Message } from './typesMessage';
import { EncryptionCache } from './encryption/encryptionCache';
import { systemPrompt } from './prompt/systemPrompt';
import { fetchArtifact, fetchArtifacts, createArtifact, updateArtifact, deleteArtifact } from './apiArtifacts';
import { DecryptedArtifact, Artifact, ArtifactBody, ArtifactCreateRequest, ArtifactHeader, ArtifactKind, ArtifactUpdateRequest } from './artifactTypes';
import { ArtifactEncryption } from './encryption/artifactEncryption';
import { getFriendsList, getUserProfile } from './apiFriends';
import { fetchFeed } from './apiFeed';
import { FeedItem } from './feedTypes';
import { UserProfile } from './friendTypes';
import { initializeTodoSync } from '../-zen/model/ops';
import { DEFAULT_KANBAN_BOARD } from '@/sync/kanbanTypes';
import type { KanbanBoard, KanbanTeamMember } from '@/sync/kanbanTypes';
import { canonicalizeTeamMentions, type TeamMentionCandidate } from './teamMessageTypes';
import { getNextPersistedMessageCount } from './persistedMessageCount';
import { logCommerceEvent } from '@/observability/commerceEvents';
import { getServiceToken } from './apiServices';

const inferArtifactTypeFromBody = (body: string | null | undefined): 'team' | undefined => {
    if (!body) {
        return undefined;
    }
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === 'object') {
            if (parsed.team || parsed.tasks || parsed.columns) {
                return 'team';
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
};

const decodeArtifactBase64Text = (value: string): string | null => {
    try {
        return new TextDecoder().decode(decodeBase64(value));
    } catch {
        return null;
    }
};

const resolvePlaintextArtifactKeyKind = (encodedKey: string | null | undefined): ArtifactKind | null => {
    if (!encodedKey) {
        return null;
    }
    const decoded = decodeArtifactBase64Text(encodedKey);
    if (decoded === 'team' || decoded === 'standalone') {
        return decoded;
    }
    return null;
};

const parsePlaintextArtifactHeader = (encodedHeader: string): ArtifactHeader | null => {
    const decoded = decodeArtifactBase64Text(encodedHeader);
    if (!decoded) {
        return null;
    }

    try {
        const parsed = JSON.parse(decoded) as Record<string, any>;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return {
            title: typeof parsed.title === 'string'
                ? parsed.title
                : (typeof parsed.name === 'string' ? parsed.name : null),
            type: parsed.type,
            sessions: Array.isArray(parsed.sessions) ? parsed.sessions : undefined,
            draft: typeof parsed.draft === 'boolean' ? parsed.draft : undefined,
        };
    } catch {
        return null;
    }
};

const parsePlaintextArtifactBody = (encodedBody: string): ArtifactBody | null => {
    const decoded = decodeArtifactBase64Text(encodedBody);
    if (!decoded) {
        return null;
    }

    try {
        const parsed = JSON.parse(decoded) as any;
        if (parsed && typeof parsed === 'object' && 'body' in parsed) {
            const bodyValue = parsed.body;
            if (bodyValue === null) {
                return { body: null };
            }
            if (typeof bodyValue === 'string') {
                return { body: bodyValue };
            }
            if (bodyValue && typeof bodyValue === 'object') {
                return { body: JSON.stringify(bodyValue) };
            }
        }

        if (typeof parsed === 'string') {
            return { body: parsed };
        }

        if (parsed && typeof parsed === 'object') {
            return { body: JSON.stringify(parsed) };
        }

        return null;
    } catch {
        return null;
    }
};

const resolvePlaintextTeamArtifact = (
    artifact: Pick<Artifact, 'id' | 'header' | 'dataEncryptionKey'> & Partial<Pick<Artifact, 'body'>>
): { header: ArtifactHeader | null; body: ArtifactBody | null } | null => {
    const plaintextKind = resolvePlaintextArtifactKeyKind(artifact.dataEncryptionKey);
    if (!plaintextKind) {
        return null;
    }

    const header = parsePlaintextArtifactHeader(artifact.header);
    if (!header || header.type !== plaintextKind) {
        return null;
    }

    const body = artifact.body ? parsePlaintextArtifactBody(artifact.body) : null;
    return { header, body };
};

type ArtifactEncryptionContext = {
    key: Uint8Array;
    variant: 'legacy' | 'dataKey';
    wrapper: 'boxed-v0' | 'legacy';
};

const buildTeamMentionCandidates = (
    teamId: string,
    sessions: Session[],
    artifact?: DecryptedArtifact | null
): TeamMentionCandidate[] => {
    const candidates = new Map<string, TeamMentionCandidate>();
    const artifactSessionIds = new Set(artifact?.sessions ?? []);

    const upsertCandidate = (sessionId: string, updates: Partial<TeamMentionCandidate>) => {
        if (!sessionId) {
            return;
        }

        const existing = candidates.get(sessionId) ?? { sessionId, aliases: [] };
        const aliasSet = new Set(existing.aliases ?? []);

        updates.aliases?.forEach((alias) => {
            if (alias) {
                aliasSet.add(alias);
            }
        });

        candidates.set(sessionId, {
            sessionId,
            displayName: updates.displayName ?? existing.displayName,
            roleId: updates.roleId ?? existing.roleId,
            aliases: [...aliasSet],
        });
    };

    sessions.forEach((session) => {
        if (session.metadata?.teamId !== teamId && !artifactSessionIds.has(session.id)) {
            return;
        }

        upsertCandidate(session.id, {
            displayName: session.metadata?.name,
            roleId: session.metadata?.role,
            aliases: [
                session.metadata?.name,
                session.metadata?.role,
                session.metadata?.flavor ?? undefined,
            ].filter((value): value is string => !!value),
        });
    });

    if (artifact?.body) {
        try {
            const board = JSON.parse(artifact.body);
            const members = Array.isArray(board?.team?.members) ? board.team.members : [];
            members.forEach((member: any) => {
                if (!member || typeof member.sessionId !== 'string') {
                    return;
                }

                upsertCandidate(member.sessionId, {
                    displayName: typeof member.displayName === 'string' ? member.displayName : undefined,
                    roleId: typeof member.roleId === 'string' ? member.roleId : undefined,
                    aliases: [
                        typeof member.displayName === 'string' ? member.displayName : undefined,
                        typeof member.roleId === 'string' ? member.roleId : undefined,
                    ].filter((value): value is string => !!value),
                });
            });
        } catch {
            // Ignore malformed team artifact bodies and fall back to session metadata only.
        }
    }

    return [...candidates.values()];
};

class Sync {

    encryption!: Encryption;
    serverID!: string;
    anonID!: string;
    private credentials!: AuthCredentials;
    public encryptionCache = new EncryptionCache();
    private sessionsSync: InvalidateSync;
    private messagesSync = new Map<string, InvalidateSync>();
    private sessionReceivedMessages = new Map<string, Set<string>>();
    private sessionDataKeys = new Map<string, Uint8Array>(); // Store session data encryption keys internally
    private machineDataKeys = new Map<string, Uint8Array>(); // Store machine data encryption keys internally
    private artifactEncryptionContexts = new Map<string, ArtifactEncryptionContext>(); // Store artifact encryption contexts internally
    private settingsSync: InvalidateSync;
    private profileSync: InvalidateSync;
    private purchasesSync: InvalidateSync;
    private machinesSync: InvalidateSync;
    private pushTokenSync: InvalidateSync;
    private nativeUpdateSync: InvalidateSync;
    private artifactsSync: InvalidateSync;
    private friendsSync: InvalidateSync;
    private friendRequestsSync: InvalidateSync;
    private feedSync: InvalidateSync;
    private todosSync: InvalidateSync;
    private activityAccumulator: ActivityUpdateAccumulator;
    private machineActivityAccumulator: MachineActivityAccumulator;
    private pendingSettings: Partial<Settings> = loadPendingSettings();
    revenueCatInitialized = false;

    // Team messaging
    private teamMessagesCache = new Map<string, import('@/sync/teamMessageTypes').TeamMessage[]>();
    private teamMessageSubscriptions = new Map<string, Set<(message: import('@/sync/teamMessageTypes').TeamMessage) => void>>();

    // Task events (Server-Driven Task Orchestration)
    private taskEventSubscriptions = new Map<string, Set<(event: { type: 'task-created' | 'task-updated' | 'task-deleted'; teamId: string; taskId: string; task?: any }) => void>>();

    // Generic locking mechanism
    private recalculationLockCount = 0;
    private lastRecalculationTime = 0;

    // Deduplication for syncSessionToTeam: prevents re-calling addTeamMember on every agentState update
    private syncedSessionTeams = new Set<string>();
    // Reentrancy guard for fetchArtifactsList to prevent mutual recursion with updateArtifact
    private _isFetchingArtifactsList = false;
    // Reentrancy guard for duplicate artifact writes with the same payload
    private inFlightArtifactUpdates = new Map<string, Promise<void>>();

    constructor() {
        this.sessionsSync = new InvalidateSync(this.fetchSessions);
        this.settingsSync = new InvalidateSync(this.syncSettings);
        this.profileSync = new InvalidateSync(this.fetchProfile);
        this.purchasesSync = new InvalidateSync(this.syncPurchases);
        this.machinesSync = new InvalidateSync(this.fetchMachines);
        this.nativeUpdateSync = new InvalidateSync(this.fetchNativeUpdate);
        this.artifactsSync = new InvalidateSync(this.fetchArtifactsList);
        this.friendsSync = new InvalidateSync(this.fetchFriends);
        this.friendRequestsSync = new InvalidateSync(this.fetchFriendRequests);
        this.feedSync = new InvalidateSync(this.fetchFeed);
        this.todosSync = new InvalidateSync(this.fetchTodos);

        const registerPushToken = async () => {
            if (__DEV__) {
                return;
            }
            await this.registerPushToken();
        }
        this.pushTokenSync = new InvalidateSync(registerPushToken);
        this.activityAccumulator = new ActivityUpdateAccumulator(this.flushActivityUpdates.bind(this), 2000);
        this.machineActivityAccumulator = new MachineActivityAccumulator(this.flushMachineActivityUpdates.bind(this), 2000);

        // Listen for app state changes to refresh purchases
        AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
                log.log('📱 App became active');
                this.purchasesSync.invalidate();
                this.profileSync.invalidate();
                this.machinesSync.invalidate();
                this.pushTokenSync.invalidate();
                this.sessionsSync.invalidate();
                this.nativeUpdateSync.invalidate();
                log.log('📱 App became active: Invalidating artifacts sync');
                this.artifactsSync.invalidate();
                this.friendsSync.invalidate();
                this.friendRequestsSync.invalidate();
                this.feedSync.invalidate();
                this.todosSync.invalidate();
            } else {
                log.log(`📱 App state changed to: ${nextAppState}`);
            }
        });
    }

    async create(credentials: AuthCredentials, encryption: Encryption) {
        this.credentials = credentials;
        this.encryption = encryption;
        this.anonID = encryption.anonID;
        this.serverID = parseToken(credentials.token);
        await this.#init();

        // Await settings sync to have fresh settings
        await this.settingsSync.awaitQueue();

        // Await profile sync to have fresh profile
        await this.profileSync.awaitQueue();

        // Await purchases sync to have fresh purchases
        await this.purchasesSync.awaitQueue();
    }

    async restore(credentials: AuthCredentials, encryption: Encryption) {
        // NOTE: No awaiting anything here, we're restoring from a disk (ie app restarted)
        this.credentials = credentials;
        this.encryption = encryption;
        this.anonID = encryption.anonID;
        this.serverID = parseToken(credentials.token);
        await this.#init();
    }

    async #init() {

        // Subscribe to updates
        this.subscribeToUpdates();

        // Sync initial PostHog opt-out state with stored settings
        if (tracking) {
            const currentSettings = storage.getState().settings;
            if (currentSettings.analyticsOptOut) {
                tracking.optOut();
            } else {
                tracking.optIn();
            }
        }

        // Invalidate sync
        log.log('🔄 #init: Invalidating all syncs');
        this.sessionsSync.invalidate();
        this.settingsSync.invalidate();
        this.profileSync.invalidate();
        this.purchasesSync.invalidate();
        this.machinesSync.invalidate();
        this.pushTokenSync.invalidate();
        this.nativeUpdateSync.invalidate();
        this.friendsSync.invalidate();
        this.friendRequestsSync.invalidate();
        this.artifactsSync.invalidate();
        this.feedSync.invalidate();
        this.todosSync.invalidate();
        log.log('🔄 #init: All syncs invalidated, including artifacts and todos');

        // Wait for both sessions and machines to load, then mark as ready
        Promise.all([
            this.sessionsSync.awaitQueue(),
            this.machinesSync.awaitQueue()
        ]).then(() => {
            storage.getState().applyReady();
        }).catch((error) => {
            console.error('Failed to load initial data:', error);
        });
    }


    onSessionVisible = (sessionId: string) => {
        let ex = this.messagesSync.get(sessionId);
        if (!ex) {
            ex = new InvalidateSync(() => this.fetchMessages(sessionId));
            this.messagesSync.set(sessionId, ex);
        }
        ex.invalidate();

        // Also invalidate git status sync for this session
        gitStatusSync.getSync(sessionId).invalidate();

    }


    async sendMessage(sessionId: string, text: string, displayText?: string) {

        // Get encryption
        const encryption = this.encryption.getSessionEncryption(sessionId);
        if (!encryption) { // Should never happen
            console.error(`Session ${sessionId} not found`);
            return;
        }

        // Get session data from storage
        const session = storage.getState().sessions[sessionId];
        if (!session) {
            console.error(`Session ${sessionId} not found in storage`);
            return;
        }

        // Read permission mode and model mode from session state
        const permissionMode = session.permissionMode || 'bypassPermissions';
        const modelMode = session.modelMode || 'default';

        // Generate local ID
        const localId = randomUUID();

        // Determine sentFrom based on platform
        let sentFrom: string;
        if (Platform.OS === 'web') {
            sentFrom = 'web';
        } else if (Platform.OS === 'android') {
            sentFrom = 'android';
        } else if (Platform.OS === 'ios') {
            // Check if running on Mac (Catalyst or Designed for iPad on Mac)
            if (isRunningOnMac()) {
                sentFrom = 'mac';
            } else {
                sentFrom = 'ios';
            }
        } else {
            sentFrom = 'web'; // fallback
        }

        // Resolve model settings based on modelMode
        let model: string | null = null;
        let fallbackModel: string | null = null;

        switch (modelMode) {
            case 'default':
                model = null;
                fallbackModel = null;
                break;
            case 'adaptiveUsage':
                model = 'claude-opus-4-1-20250805';
                fallbackModel = 'claude-sonnet-4-5-20250929';
                break;
            case 'sonnet':
                model = 'claude-sonnet-4-5-20250929';
                fallbackModel = null;
                break;
            case 'opus':
                model = 'claude-opus-4-1-20250805';
                fallbackModel = null;
                break;
            default:
                // If no modelMode is specified, use default behavior (let server decide)
                model = null;
                fallbackModel = null;
                break;
        }

        // Create user message content with metadata
        const content: RawRecord = {
            role: 'user',
            content: {
                type: 'text',
                text
            },
            meta: {
                sentFrom,
                permissionMode: permissionMode || 'bypassPermissions',
                model,
                fallbackModel,
                appendSystemPrompt: systemPrompt,
                ...(displayText && { displayText }) // Add displayText if provided
            }
        };
        const encryptedRawRecord = await encryption.encryptRawRecord(content);

        // Add to messages - normalize the raw record
        const createdAt = Date.now();
        const normalizedMessage = normalizeRawMessage(localId, localId, createdAt, content);
        if (normalizedMessage) {
            this.applyMessages(sessionId, [normalizedMessage]);
        }

        // Send message with optional permission mode and source identifier
        apiSocket.send('message', {
            sid: sessionId,
            message: encryptedRawRecord,
            localId,
            sentFrom,
            permissionMode: permissionMode || 'bypassPermissions'
        });
    }

    applySettings = (delta: Partial<Settings>) => {
        storage.getState().applySettingsLocal(delta);

        // Save pending settings
        this.pendingSettings = { ...this.pendingSettings, ...delta };
        savePendingSettings(this.pendingSettings);

        // Sync PostHog opt-out state if it was changed
        if (tracking && 'analyticsOptOut' in delta) {
            const currentSettings = storage.getState().settings;
            if (currentSettings.analyticsOptOut) {
                tracking.optOut();
            } else {
                tracking.optIn();
            }
        }

        // Invalidate settings sync
        this.settingsSync.invalidate();
    }

    refreshPurchases = () => {
        this.purchasesSync.invalidate();
    }

    refreshProfile = async () => {
        await this.profileSync.invalidateAndAwait();
    }

    purchaseProduct = async (productId: string, surface: string = 'developer-purchases'): Promise<{ success: boolean; error?: string }> => {
        const logPurchaseEvent = (event: Parameters<typeof logCommerceEvent>[0]) => {
            logCommerceEvent(event, { token: this.credentials?.token });
        };

        try {
            // Check if RevenueCat is initialized
            if (!this.revenueCatInitialized) {
                logPurchaseEvent({
                    name: 'purchase_failed',
                    flow: 'direct-purchase',
                    surface,
                    properties: {
                        product_id: productId,
                        reason: 'revenuecat_not_initialized',
                    },
                });
                return { success: false, error: 'RevenueCat not initialized' };
            }

            // Fetch the product
            const products = await RevenueCat.getProducts([productId]);
            if (products.length === 0) {
                logPurchaseEvent({
                    name: 'purchase_failed',
                    flow: 'direct-purchase',
                    surface,
                    properties: {
                        product_id: productId,
                        reason: 'product_not_found',
                    },
                });
                return { success: false, error: `Product '${productId}' not found` };
            }

            // Purchase the product
            const product = products[0];
            logPurchaseEvent({
                name: 'purchase_attempted',
                flow: 'direct-purchase',
                surface,
                properties: {
                    product_id: product.identifier,
                },
            });
            const { customerInfo } = await RevenueCat.purchaseStoreProduct(product);

            // Update local purchases data
            storage.getState().applyPurchases(customerInfo);
            logPurchaseEvent({
                name: 'purchase_completed',
                flow: 'direct-purchase',
                surface,
                properties: {
                    product_id: product.identifier,
                    entitlement_count: Object.keys(customerInfo.entitlements?.all || {}).length,
                },
            });

            return { success: true };
        } catch (error: any) {
            // Check if user cancelled
            if (error.userCancelled) {
                logPurchaseEvent({
                    name: 'purchase_failed',
                    flow: 'direct-purchase',
                    surface,
                    properties: {
                        product_id: productId,
                        reason: 'purchase_cancelled',
                    },
                });
                return { success: false, error: 'Purchase cancelled' };
            }

            // Return the error message
            const errorMessage = error.message || 'Purchase failed';
            logPurchaseEvent({
                name: 'purchase_failed',
                flow: 'direct-purchase',
                surface,
                properties: {
                    product_id: productId,
                    reason: errorMessage,
                },
            });
            return { success: false, error: errorMessage };
        }
    }

    getOfferings = async (): Promise<{ success: boolean; offerings?: any; error?: string }> => {
        try {
            // Check if RevenueCat is initialized
            if (!this.revenueCatInitialized) {
                return { success: false, error: 'RevenueCat not initialized' };
            }

            // Fetch offerings
            const offerings = await RevenueCat.getOfferings();

            // Return the offerings data
            return {
                success: true,
                offerings: {
                    current: offerings.current,
                    all: offerings.all
                }
            };
        } catch (error: any) {
            return { success: false, error: error.message || 'Failed to fetch offerings' };
        }
    }

    presentPaywall = async (surface: string = 'unknown'): Promise<{ success: boolean; purchased?: boolean; error?: string }> => {
        const logPaywallEvent = (event: Parameters<typeof logCommerceEvent>[0]) => {
            logCommerceEvent(event, { token: this.credentials?.token });
        };

        try {
            trackPaywallButtonClicked();
            logPaywallEvent({
                name: 'paywall_entry_clicked',
                flow: 'paywall',
                surface,
            });

            // Check if RevenueCat is initialized
            if (!this.revenueCatInitialized) {
                const error = 'RevenueCat not initialized';
                trackPaywallError(error);
                logPaywallEvent({
                    name: 'paywall_error',
                    flow: 'paywall',
                    surface,
                    properties: {
                        reason: 'revenuecat_not_initialized',
                    },
                });
                return { success: false, error };
            }

            // Track paywall presentation
            trackPaywallPresented();
            logPaywallEvent({
                name: 'paywall_presented',
                flow: 'paywall',
                surface,
            });

            // Present the paywall
            const result = await RevenueCat.presentPaywall();

            // Handle the result
            switch (result) {
                case PaywallResult.PURCHASED:
                    trackPaywallPurchased();
                    logPaywallEvent({
                        name: 'paywall_result',
                        flow: 'paywall',
                        surface,
                        properties: {
                            result: 'purchased',
                        },
                    });
                    // Refresh customer info after purchase
                    await this.syncPurchases();
                    return { success: true, purchased: true };
                case PaywallResult.RESTORED:
                    trackPaywallRestored();
                    logPaywallEvent({
                        name: 'paywall_result',
                        flow: 'paywall',
                        surface,
                        properties: {
                            result: 'restored',
                        },
                    });
                    // Refresh customer info after restore
                    await this.syncPurchases();
                    return { success: true, purchased: true };
                case PaywallResult.CANCELLED:
                    trackPaywallCancelled();
                    logPaywallEvent({
                        name: 'paywall_result',
                        flow: 'paywall',
                        surface,
                        properties: {
                            result: 'cancelled',
                        },
                    });
                    return { success: true, purchased: false };
                case PaywallResult.NOT_PRESENTED:
                    // Don't track error for NOT_PRESENTED as it's a platform limitation
                    logPaywallEvent({
                        name: 'paywall_result',
                        flow: 'paywall',
                        surface,
                        properties: {
                            result: 'not_presented',
                        },
                    });
                    return { success: false, error: 'Paywall not available on this platform' };
                case PaywallResult.ERROR:
                default:
                    const errorMsg = 'Failed to present paywall';
                    trackPaywallError(errorMsg);
                    logPaywallEvent({
                        name: 'paywall_error',
                        flow: 'paywall',
                        surface,
                        properties: {
                            reason: errorMsg,
                        },
                    });
                    return { success: false, error: errorMsg };
            }
        } catch (error: any) {
            const errorMessage = error.message || 'Failed to present paywall';
            trackPaywallError(errorMessage);
            logPaywallEvent({
                name: 'paywall_error',
                flow: 'paywall',
                surface,
                properties: {
                    reason: errorMessage,
                },
            });
            return { success: false, error: errorMessage };
        }
    }

    async assumeUsers(userIds: string[]): Promise<void> {
        if (!this.credentials || userIds.length === 0) return;

        const state = storage.getState();
        // Filter out users we already have in cache (including null for 404s)
        const missingIds = userIds.filter(id => !(id in state.users));

        if (missingIds.length === 0) return;

        log.log(`👤 Fetching ${missingIds.length} missing users...`);

        // Fetch missing users in parallel
        const results = await Promise.all(
            missingIds.map(async (id) => {
                try {
                    const profile = await getUserProfile(this.credentials!, id);
                    return { id, profile };  // profile is null if 404
                } catch (error) {
                    console.error(`Failed to fetch user ${id}:`, error);
                    return { id, profile: null };  // Treat errors as 404
                }
            })
        );

        // Convert to Record<string, UserProfile | null>
        const usersMap: Record<string, UserProfile | null> = {};
        results.forEach(({ id, profile }) => {
            usersMap[id] = profile;
        });

        storage.getState().applyUsers(usersMap);
        log.log(`👤 Applied ${results.length} users to cache (${results.filter(r => r.profile).length} found, ${results.filter(r => !r.profile).length} not found)`);
    }

    //
    // Private
    //

    private fetchSessions = async () => {
        if (!this.credentials) return;

        const API_ENDPOINT = getServerUrl();
        const response = await fetch(`${API_ENDPOINT}/v1/sessions`, {
            headers: {
                'Authorization': `Bearer ${this.credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch sessions: ${response.status}`);
        }

        const data = await response.json();
        const sessions = data.sessions as Array<{
            id: string;
            tag: string;
            seq: number;
            metadata: string;
            metadataVersion: number;
            agentState: string | null;
            agentStateVersion: number;
            dataEncryptionKey: string | null;
            active: boolean;
            activeAt: number;
            createdAt: number;
            updatedAt: number;
            lastMessage: ApiMessage | null;
            persistedMessageCount?: number;
        }>;

        // Initialize all session encryptions first
        const sessionKeys = new Map<string, Uint8Array | null>();
        const results = await Promise.allSettled(
            sessions.map(async (session) => {
                if (!session.dataEncryptionKey) {
                    return { sessionId: session.id, key: null };
                }
                try {
                    const decrypted = await this.encryption.decryptEncryptionKey(session.dataEncryptionKey);
                    if (!decrypted) {
                        console.error(`Failed to decrypt data encryption key for session ${session.id}`);
                        return { sessionId: session.id, key: null };
                    }
                    return { sessionId: session.id, key: decrypted };
                } catch (error) {
                    console.error(`Exception decrypting key for session ${session.id}:`, error);
                    return { sessionId: session.id, key: null };
                }
            })
        );

        // Collect successful decryptions
        for (const result of results) {
            if (result.status === 'fulfilled') {
                sessionKeys.set(result.value.sessionId, result.value.key);
            }
        }
        await this.encryption.initializeSessions(sessionKeys);

        // Decrypt sessions
        let decryptedSessions: (Omit<Session, 'presence'> & { presence?: "online" | number })[] = [];
        for (const session of sessions) {
            // Get session encryption (should always exist after initialization)
            const sessionEncryption = this.encryption.getSessionEncryption(session.id);
            if (!sessionEncryption) {
                console.error(`Session encryption not found for ${session.id} - this should never happen`);
                continue;
            }

            // Decrypt metadata using session-specific encryption
            let metadata = await sessionEncryption.decryptMetadata(session.metadataVersion, session.metadata);

            // Decrypt agent state using session-specific encryption
            let agentState = await sessionEncryption.decryptAgentState(session.agentStateVersion, session.agentState);

            // Put it all together
            const processedSession = {
                ...session,
                thinking: false,
                thinkingAt: 0,
                metadata,
                agentState
            };
            decryptedSessions.push(processedSession);
        }

        // Apply to storage
        this.applySessions(decryptedSessions);
        log.log(`📥 fetchSessions completed - processed ${decryptedSessions.length} sessions`);

    }

    public refreshMachines = async () => {
        return this.fetchMachines();
    }

    public refreshSessions = async () => {
        return this.sessionsSync.invalidateAndAwait();
    }

    public getCredentials() {
        return this.credentials;
    }

    // Artifact methods
    public fetchArtifactsList = async (): Promise<void> => {
        log.log('📦 fetchArtifactsList: Starting artifact sync');
        if (!this.credentials) {
            log.log('📦 fetchArtifactsList: No credentials, skipping');
            return;
        }

        // Reentrancy guard: prevent mutual recursion with updateArtifact → fetchArtifactsList → migration → updateArtifact
        if (this._isFetchingArtifactsList) {
            log.log('📦 fetchArtifactsList: Already in progress, skipping to prevent recursion');
            return;
        }
        this._isFetchingArtifactsList = true;

        try {
            log.log('📦 fetchArtifactsList: Fetching artifacts from server');
            const artifacts = await fetchArtifacts(this.credentials);
            log.log(`📦 fetchArtifactsList: Received ${artifacts.length} artifacts from server`);
            let decryptedArtifacts: DecryptedArtifact[] = [];
            const inaccessibleArtifacts: Array<{ id: string; stage: string; reason: string }> = [];

            for (const artifact of artifacts) {
                try {
                    const plaintextTeamArtifact = resolvePlaintextTeamArtifact(artifact);
                    if (plaintextTeamArtifact) {
                        log.log(`📦 fetchArtifactsList: Artifact ${artifact.id} uses plaintext artifact compatibility path`);

                        decryptedArtifacts.push({
                            id: artifact.id,
                            title: plaintextTeamArtifact.header?.title || null,
                            type: plaintextTeamArtifact.header?.type,
                            sessions: plaintextTeamArtifact.header?.sessions,
                            draft: plaintextTeamArtifact.header?.draft,
                            body: undefined,
                            headerVersion: artifact.headerVersion,
                            bodyVersion: artifact.bodyVersion,
                            seq: artifact.seq,
                            createdAt: artifact.createdAt,
                            updatedAt: artifact.updatedAt,
                            isDecrypted: true,
                        });
                        continue;
                    }

                    // Decrypt the data encryption key
                    const encryptionContext = await this.encryption.decryptEncryptionKeyWithVariant(artifact.dataEncryptionKey);
                    if (!encryptionContext) {
                        console.error(`Failed to decrypt key for artifact ${artifact.id}`, {
                            stage: 'dataEncryptionKey',
                            compatibilityPathChecked: true,
                            keyPreview: decodeArtifactBase64Text(artifact.dataEncryptionKey)?.slice(0, 32) ?? 'non-text',
                            likelyCause: 'unsupported legacy wrapper, corrupt key envelope, or wrong account secret',
                        });
                        inaccessibleArtifacts.push({
                            id: artifact.id,
                            stage: 'dataEncryptionKey',
                            reason: 'decryptEncryptionKeyWithVariant returned null',
                        });
                        continue;
                    }

                    // Store the decrypted key in memory
                    this.artifactEncryptionContexts.set(artifact.id, encryptionContext);

                    // Create artifact encryption instance
                    const artifactEncryption = new ArtifactEncryption(
                        encryptionContext.key,
                        encryptionContext.variant
                    );

                    // Decrypt header
                    const header = await artifactEncryption.decryptHeader(artifact.header);

                    const decryptedArtifact = {
                        id: artifact.id,
                        title: header?.title || null,
                        type: header?.type,          // Include type from header
                        sessions: header?.sessions,  // Include sessions from header
                        draft: header?.draft,        // Include draft flag from header
                        body: undefined, // Body not loaded in list
                        headerVersion: artifact.headerVersion,
                        bodyVersion: artifact.bodyVersion,
                        seq: artifact.seq,
                        createdAt: artifact.createdAt,
                        updatedAt: artifact.updatedAt,
                        isDecrypted: !!header,
                    };

                    decryptedArtifacts.push(decryptedArtifact);
                } catch (err) {
                    console.error(`Failed to decrypt artifact ${artifact.id}:`, err);
                    inaccessibleArtifacts.push({
                        id: artifact.id,
                        stage: 'artifact-body-or-header',
                        reason: err instanceof Error ? err.message : String(err),
                    });
                }
            }

            if (inaccessibleArtifacts.length > 0) {
                log.log(`📦 fetchArtifactsList: Preserving ${inaccessibleArtifacts.length} inaccessible artifacts for investigation`);
            }

            log.log(`📦 fetchArtifactsList: Successfully decrypted ${decryptedArtifacts.length} artifacts (preserved ${inaccessibleArtifacts.length} inaccessible)`);

            // MIGRATION: Fix artifacts with undefined type by checking their body content
            // This is a one-time fix for artifacts created before the type field was properly saved
            const artifactsNeedingTypeFix = decryptedArtifacts.filter(a => a.isDecrypted && !a.type);
            if (artifactsNeedingTypeFix.length > 0) {
                log.log(`[Migration] Found ${artifactsNeedingTypeFix.length} artifacts without type, migrating...`);

                const fixedArtifacts = new Map<string, DecryptedArtifact>();
                let migratedCount = 0;

                try {
                    for (const artifact of artifactsNeedingTypeFix) {
                        try {
                            // Heuristic: If artifact has sessions array, likely a team
                            const likelyTeam = artifact.sessions && artifact.sessions.length >= 1;

                            const fullArtifact = await this.fetchArtifactWithBody(artifact.id);
                            if (fullArtifact && fullArtifact.body) {
                                try {
                                    const bodyData = JSON.parse(fullArtifact.body);
                                    if (bodyData.team && Array.isArray(bodyData.team.members)) {
                                        fixedArtifacts.set(artifact.id, { ...fullArtifact, type: 'team' });
                                        await this.updateArtifact(artifact.id, fullArtifact.title, fullArtifact.body, fullArtifact.sessions, fullArtifact.draft, 'team');
                                        migratedCount++;
                                    } else {
                                        if (likelyTeam) {
                                            fixedArtifacts.set(artifact.id, { ...fullArtifact, type: 'team' });
                                            await this.updateArtifact(artifact.id, fullArtifact.title, fullArtifact.body, fullArtifact.sessions, fullArtifact.draft, 'team');
                                            migratedCount++;
                                        }
                                    }
                                } catch (parseError) {
                                    if (likelyTeam) {
                                        fixedArtifacts.set(artifact.id, { ...fullArtifact, type: 'team' });
                                        await this.updateArtifact(artifact.id, fullArtifact.title, fullArtifact.body, fullArtifact.sessions, fullArtifact.draft, 'team');
                                        migratedCount++;
                                    }
                                }
                            } else {
                                if (likelyTeam) {
                                    const minimalTeam = { ...artifact, type: 'team' as const };
                                    fixedArtifacts.set(artifact.id, minimalTeam);
                                    await this.updateArtifact(artifact.id, artifact.title, artifact.body || null, artifact.sessions, artifact.draft, 'team');
                                    migratedCount++;
                                }
                            }
                        } catch (error) {
                            console.error(`[Migration] Failed to migrate artifact ${artifact.id}:`, error);
                        }
                    }

                    // Update the decryptedArtifacts array with fixed artifacts
                    decryptedArtifacts = decryptedArtifacts.map(artifact => {
                        const fixedArtifact = fixedArtifacts.get(artifact.id);
                        return fixedArtifact || artifact;
                    });

                    log.log(`[Migration] Successfully migrated ${migratedCount} artifacts`);
                } catch (migrationError) {
                    console.error('[Migration] Migration process encountered error, continuing with current artifacts:', migrationError);
                }
            }

            storage.getState().applyArtifacts(decryptedArtifacts);
            log.log('📦 fetchArtifactsList: Artifacts applied to storage');
            // Rebuild deduplication cache from fetched artifacts instead of clearing.
            // Clearing would allow syncSessionToTeam to re-add already-synced members,
            // creating a feedback loop: addTeamMember → broadcast → fetchArtifactsList → clear → addTeamMember again.
            this.syncedSessionTeams.clear();
            for (const artifact of decryptedArtifacts) {
                if (artifact.type === 'team' && artifact.body) {
                    try {
                        const board = JSON.parse(artifact.body);
                        if (board.team && Array.isArray(board.team.members)) {
                            for (const member of board.team.members) {
                                if (member.sessionId) {
                                    this.syncedSessionTeams.add(`${artifact.id}:${member.sessionId}`);
                                }
                            }
                        }
                    } catch {
                        // Ignore parse errors during dedup rebuild
                    }
                }
            }
        } catch (error) {
            log.log(`📦 fetchArtifactsList: Error fetching artifacts: ${error}`);
            console.error('Failed to fetch artifacts:', error);
            throw error;
        } finally {
            this._isFetchingArtifactsList = false;
        }
    }

    public async fetchArtifactWithBody(artifactId: string): Promise<DecryptedArtifact | null> {
        if (!this.credentials) return null;

        try {
            const artifact = await fetchArtifact(this.credentials, artifactId);

            const plaintextTeamArtifact = resolvePlaintextTeamArtifact(artifact);
            if (plaintextTeamArtifact) {
                log.log(`📦 fetchArtifactWithBody: Artifact ${artifactId} uses plaintext artifact compatibility path`);

                const bodyText = plaintextTeamArtifact.body?.body || null;
                const decryptedArtifact = {
                    id: artifact.id,
                    title: plaintextTeamArtifact.header?.title || null,
                    type: plaintextTeamArtifact.header?.type,
                    sessions: plaintextTeamArtifact.header?.sessions,
                    draft: plaintextTeamArtifact.header?.draft,
                    body: bodyText,
                    headerVersion: artifact.headerVersion,
                    bodyVersion: artifact.bodyVersion,
                    seq: artifact.seq,
                    createdAt: artifact.createdAt,
                    updatedAt: artifact.updatedAt,
                    isDecrypted: true,
                };

                storage.getState().applyArtifacts([decryptedArtifact]);
                return decryptedArtifact;
            }

            // Decrypt the data encryption key
            const encryptionContext = await this.encryption.decryptEncryptionKeyWithVariant(artifact.dataEncryptionKey);
            if (!encryptionContext) {
                console.error(`Failed to decrypt key for artifact ${artifactId}`, {
                    stage: 'dataEncryptionKey',
                    compatibilityPathChecked: true,
                    keyPreview: decodeArtifactBase64Text(artifact.dataEncryptionKey)?.slice(0, 32) ?? 'non-text',
                    likelyCause: 'unsupported legacy wrapper, corrupt key envelope, or wrong account secret',
                });
                return null;
            }

            // Store the decrypted key in memory
            this.artifactEncryptionContexts.set(artifact.id, encryptionContext);

            // Create artifact encryption instance
            const artifactEncryption = new ArtifactEncryption(
                encryptionContext.key,
                encryptionContext.variant
            );

            // Decrypt header and body
            const header = await artifactEncryption.decryptHeader(artifact.header);
            const body = artifact.body ? await artifactEncryption.decryptBody(artifact.body) : null;
            const bodyText = body?.body || null;
            const resolvedType = header?.type ?? inferArtifactTypeFromBody(bodyText);

            const decryptedArtifact = {
                id: artifact.id,
                title: header?.title || null,
                type: resolvedType,          // Include type from header or infer from body
                sessions: header?.sessions,  // Include sessions from header
                draft: header?.draft,        // Include draft flag from header
                body: bodyText,
                headerVersion: artifact.headerVersion,
                bodyVersion: artifact.bodyVersion,
                seq: artifact.seq,
                createdAt: artifact.createdAt,
                updatedAt: artifact.updatedAt,
                isDecrypted: !!header,
            };

            // Apply to storage to ensure UI updates and prevent infinite loops
            storage.getState().applyArtifacts([decryptedArtifact]);

            return decryptedArtifact;
        } catch (error) {
            console.error(`Failed to fetch artifact ${artifactId}:`, error);
            const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
            if (message.includes('artifact not found')) {
                console.warn(`Artifact ${artifactId} not found on server (404). Deleting locally.`);
                storage.getState().deleteArtifact(artifactId);
            }
            return null;
        }
    }

    public async createArtifact(
        title: string | null,
        body: string | null,
        sessions?: string[],
        draft?: boolean,
        type?: ArtifactKind,
        existingId?: string  // Optional: use existing ID instead of generating new one
    ): Promise<string> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }

        try {
            // Use provided ID or generate new unique artifact ID
            const artifactId = existingId || this.encryption.generateId();

            // Generate data encryption key
            const dataEncryptionKey = ArtifactEncryption.generateDataEncryptionKey();

            // Store the decrypted key in memory
            this.artifactEncryptionContexts.set(artifactId, {
                key: dataEncryptionKey,
                variant: 'dataKey',
                wrapper: 'boxed-v0',
            });

            // Encrypt the data encryption key with user's key
            const encryptedKey = await this.encryption.encryptEncryptionKey(dataEncryptionKey);

            const artifactEncryption = new ArtifactEncryption(dataEncryptionKey);

            // Encrypt header
            const encryptedHeader = await artifactEncryption.encryptHeader({ title, sessions, draft, type });

            // For team artifacts, store body as base64-encoded plaintext (no encryption)
            // This allows Happy-CLI to read team context without shared encryption keys
            let encryptedBody: string;
            if (type === 'team') {
                // Store as plaintext JSON (base64 encoded)
                const plainBody = JSON.stringify({ body });
                encryptedBody = encodeBase64(new TextEncoder().encode(plainBody), 'base64');
                console.log('📝 Creating team artifact with plaintext body for cross-client access');
            } else {
                // Normal encryption for non-team artifacts
                encryptedBody = await artifactEncryption.encryptBody({ body });
            }

            // Create the request
            const request: ArtifactCreateRequest = {
                id: artifactId,
                header: encryptedHeader,
                body: encryptedBody,
                dataEncryptionKey: encodeBase64(encryptedKey, 'base64'),
            };

            // Send to server
            const artifact = await createArtifact(this.credentials, request);

            // Add to local storage
            const decryptedArtifact: DecryptedArtifact = {
                id: artifact.id,
                title,
                type,
                sessions,
                draft,
                body,
                headerVersion: artifact.headerVersion,
                bodyVersion: artifact.bodyVersion,
                seq: artifact.seq,
                createdAt: artifact.createdAt,
                updatedAt: artifact.updatedAt,
                isDecrypted: true,
            };

            storage.getState().addArtifact(decryptedArtifact);
            console.log(`✅ Created artifact ${artifactId} with type: ${type}, title: ${title}`);
            console.log(`📦 Total artifacts in storage: ${Object.keys(storage.getState().artifacts).length}`);

            return artifactId;
        } catch (error) {
            console.error('Failed to create artifact:', error);
            throw error;
        }
    }

    private buildArtifactUpdateDedupeKey(
        artifactId: string,
        title: string | null,
        body: string | null,
        sessions?: string[],
        draft?: boolean,
        type?: ArtifactKind,
    ): string {
        return JSON.stringify({
            artifactId,
            title,
            body,
            sessions: sessions ?? null,
            draft: draft ?? null,
            type: type ?? null,
        });
    }

    public async updateArtifact(
        artifactId: string,
        title: string | null,
        body: string | null,
        sessions?: string[],
        draft?: boolean,
        type?: ArtifactKind,
        _retryCount: number = 0  // Internal: track retry attempts
    ): Promise<void> {
        if (_retryCount === 0) {
            const dedupeKey = this.buildArtifactUpdateDedupeKey(artifactId, title, body, sessions, draft, type);
            const inFlightUpdate = this.inFlightArtifactUpdates.get(dedupeKey);
            if (inFlightUpdate) {
                console.log(`↩️ updateArtifact: Reusing in-flight write for ${artifactId}`);
                return inFlightUpdate;
            }

            const promise = this.updateArtifactInternal(artifactId, title, body, sessions, draft, type, _retryCount)
                .finally(() => {
                    if (this.inFlightArtifactUpdates.get(dedupeKey) === promise) {
                        this.inFlightArtifactUpdates.delete(dedupeKey);
                    }
                });
            this.inFlightArtifactUpdates.set(dedupeKey, promise);
            return promise;
        }

        return this.updateArtifactInternal(artifactId, title, body, sessions, draft, type, _retryCount);
    }

    private async updateArtifactInternal(
        artifactId: string,
        title: string | null,
        body: string | null,
        sessions?: string[],
        draft?: boolean,
        type?: ArtifactKind,
        _retryCount: number = 0  // Internal: track retry attempts
    ): Promise<void> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }

        try {
            // Get current artifact to get versions and encryption key
            const currentArtifact = storage.getState().artifacts[artifactId];
            if (!currentArtifact) {
                throw new Error('Artifact not found');
            }

            // Get the data encryption key from memory or fetch it
            let artifactEncryptionContext = this.artifactEncryptionContexts.get(artifactId);
            let usePlaintextTeamCompatibility = false;

            // Fetch full artifact if we don't have version info or encryption key
            let headerVersion = currentArtifact.headerVersion;
            let bodyVersion = currentArtifact.bodyVersion;

            if (headerVersion === undefined || bodyVersion === undefined || !artifactEncryptionContext) {
                const fullArtifact = await fetchArtifact(this.credentials, artifactId);
                headerVersion = fullArtifact.headerVersion;
                bodyVersion = fullArtifact.bodyVersion;

                const plaintextTeamArtifact = resolvePlaintextTeamArtifact(fullArtifact);
                if (plaintextTeamArtifact) {
                    usePlaintextTeamCompatibility = true;
                }

                // Decrypt and store the data encryption key if we don't have it
                if (!artifactEncryptionContext && !usePlaintextTeamCompatibility) {
                    const decryptedKeyContext = await this.encryption.decryptEncryptionKeyWithVariant(fullArtifact.dataEncryptionKey);
                    if (!decryptedKeyContext) {
                        throw new Error('Failed to decrypt encryption key');
                    }
                    this.artifactEncryptionContexts.set(artifactId, decryptedKeyContext);
                    artifactEncryptionContext = decryptedKeyContext;
                }
            }

            // Create artifact encryption instance
            const artifactEncryption = artifactEncryptionContext
                ? new ArtifactEncryption(
                    artifactEncryptionContext.key,
                    artifactEncryptionContext.variant
                )
                : null;

            const inferredType = inferArtifactTypeFromBody(body);
            const resolvedType = type ?? currentArtifact.type ?? inferredType;

            // Prepare update request
            const updateRequest: ArtifactUpdateRequest = {};

            // Check if header needs updating (title, sessions, or draft changed)
            const shouldUpdateHeader = title !== currentArtifact.title ||
                JSON.stringify(sessions) !== JSON.stringify(currentArtifact.sessions) ||
                draft !== currentArtifact.draft ||
                resolvedType !== currentArtifact.type;

            if (shouldUpdateHeader) {
                if (usePlaintextTeamCompatibility && resolvedType === 'team') {
                    const plainHeader = JSON.stringify({
                        title,
                        sessions,
                        draft,
                        type: resolvedType
                    });
                    updateRequest.header = encodeBase64(new TextEncoder().encode(plainHeader));
                } else {
                    if (!artifactEncryption) {
                        throw new Error(`Missing artifact encryption key for non-team artifact ${artifactId}`);
                    }
                    const encryptedHeader = await artifactEncryption.encryptHeader({
                        title,
                        sessions,
                        draft,
                        type: resolvedType
                    });
                    updateRequest.header = encryptedHeader;
                }
                updateRequest.expectedHeaderVersion = headerVersion;
            }

            // Only update body if it changed
            const shouldUpdateBody = body !== currentArtifact.body ||
                (resolvedType === 'team' && currentArtifact.type !== 'team');

            if (shouldUpdateBody) {
                // For team artifacts, store body as base64-encoded plaintext (no encryption)
                let encryptedBody: string;
                if (resolvedType === 'team') {
                    const plainBody = JSON.stringify({ body });
                    encryptedBody = encodeBase64(new TextEncoder().encode(plainBody), 'base64');
                } else {
                    if (!artifactEncryption) {
                        throw new Error(`Missing artifact encryption key for non-team artifact ${artifactId}`);
                    }
                    encryptedBody = await artifactEncryption.encryptBody({ body });
                }
                updateRequest.body = encryptedBody;
                updateRequest.expectedBodyVersion = bodyVersion;
            }

            // Skip if no changes
            if (Object.keys(updateRequest).length === 0) {
                return;
            }

            // Send update to server
            const response = await updateArtifact(this.credentials, artifactId, updateRequest);

            if (!response.success && response.error === 'version-mismatch') {
                console.log('⚠️ updateArtifact: Version mismatch detected, updating local state from server response');

                // Decrypt server version if provided
                if (response.currentHeader || response.currentBody) {
                    try {
                        if (!artifactEncryptionContext) {
                            throw new Error(`Missing artifact encryption context for ${artifactId}`);
                        }
                        const artifactEncryption = new ArtifactEncryption(
                            artifactEncryptionContext.key,
                            artifactEncryptionContext.variant
                        );

                        let serverHeader = undefined;
                        let serverBody = undefined;

                        if (response.currentHeader) {
                            serverHeader = await artifactEncryption.decryptHeader(response.currentHeader);
                        }

                        if (response.currentBody) {
                            // Handle team artifact plaintext body or encrypted body
                            if (resolvedType === 'team') {
                                try {
                                    // Try to parse as plaintext base64 first
                                    const plainText = new TextDecoder().decode(decodeBase64(response.currentBody));
                                    const jsonBody = JSON.parse(plainText);
                                    serverBody = { body: jsonBody.body };
                                } catch (e) {
                                    // Fallback to encrypted
                                    serverBody = await artifactEncryption.decryptBody(response.currentBody);
                                }
                            } else {
                                serverBody = await artifactEncryption.decryptBody(response.currentBody);
                            }
                        }

                        // Update local storage with server version
                        const serverArtifact: DecryptedArtifact = {
                            ...currentArtifact,
                            ...(serverHeader && {
                                title: serverHeader.title || null,
                                type: serverHeader.type ?? resolvedType ?? currentArtifact.type,
                                sessions: serverHeader.sessions,
                                draft: serverHeader.draft,
                            }),
                            ...(serverBody && {
                                body: serverBody.body
                            }),
                            headerVersion: response.currentHeaderVersion ?? headerVersion,
                            bodyVersion: response.currentBodyVersion ?? bodyVersion,
                            // We don't have updatedAt from response, so we keep current or update?
                            // Ideally we should start a fresh fetch, but this is a quick sync.
                            // Let's just update versions to allow next save to proceed if user insists.
                        };

                        storage.getState().updateArtifact(serverArtifact);
                        console.log('✅ updateArtifact: Local state updated to match server version');

                        // Auto-retry up to 3 times after syncing local state (handles high-concurrency multi-agent scenarios)
                        if (_retryCount < 3) {
                            console.log(`🔄 updateArtifact: Auto-retrying after version sync (attempt ${_retryCount + 1}/3)...`);
                            // Add small delay to reduce collision probability
                            await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
                            return this.updateArtifact(artifactId, title, body, sessions, draft, resolvedType, _retryCount + 1);
                        }
                    } catch (decryptError) {
                        console.error('Failed to decrypt server version during mismatch handling:', decryptError);
                        // Fallback to invalidation
                        this.fetchArtifactsList().catch(e => console.error(e));
                    }
                }

                // Only throw if we've exhausted retries
                if (_retryCount >= 3) {
                    throw new Error('Artifact was updated by another device. Local state has been refreshed. Please try again.');
                }

                // Refresh and retry
                await this.fetchArtifactsList();
                // Add small delay to reduce collision probability
                await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
                return this.updateArtifact(artifactId, title, body, sessions, draft, resolvedType, _retryCount + 1);
            }

            if (!response.success) {
                // If other error
                throw new Error('Failed to update artifact: ' + (response as any).error);
            }

            // Update local storage
            const updatedArtifact: DecryptedArtifact = {
                ...currentArtifact,
                title,
                type: resolvedType,
                sessions,
                draft,
                body,
                headerVersion: response.headerVersion !== undefined ? response.headerVersion : headerVersion,
                bodyVersion: response.bodyVersion !== undefined ? response.bodyVersion : bodyVersion,
                updatedAt: Date.now(),
            };

            storage.getState().updateArtifact(updatedArtifact);
        } catch (error) {
            console.error('Failed to update artifact:', error);
            throw error;
        }
    }

    public async deleteArtifact(artifactId: string): Promise<void> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }

        try {
            await deleteArtifact(this.credentials, artifactId);
            storage.getState().deleteArtifact(artifactId);
        } catch (error) {
            console.error('Failed to delete artifact:', error);
            throw error;
        }
    }

    private fetchMachines = async () => {
        if (!this.credentials) return;

        console.log('📊 Sync: Fetching machines...');
        const API_ENDPOINT = getServerUrl();
        const response = await fetch(`${API_ENDPOINT}/v1/machines`, {
            headers: {
                'Authorization': `Bearer ${this.credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error(`Failed to fetch machines: ${response.status}`);
            return;
        }

        const data = await response.json();
        console.log(`📊 Sync: Fetched ${Array.isArray(data) ? data.length : 0} machines from server`);
        const machines = data as Array<{
            id: string;
            metadata: string;
            metadataVersion: number;
            daemonState?: string | null;
            daemonStateVersion?: number;
            dataEncryptionKey?: string | null; // Add support for per-machine encryption keys
            seq: number;
            active: boolean;
            activeAt: number;  // Changed from lastActiveAt
            createdAt: number;
            updatedAt: number;
        }>;

        // First, collect and decrypt encryption keys for all machines
        const machineKeysMap = new Map<string, Uint8Array | null>();
        for (const machine of machines) {
            if (machine.dataEncryptionKey) {
                const decryptedKey = await this.encryption.decryptEncryptionKey(machine.dataEncryptionKey);
                if (!decryptedKey) {
                    console.error(`Failed to decrypt data encryption key for machine ${machine.id}`);
                    machineKeysMap.set(machine.id, null);
                } else {
                    machineKeysMap.set(machine.id, decryptedKey);
                    this.machineDataKeys.set(machine.id, decryptedKey);
                }
            } else {
                machineKeysMap.set(machine.id, null);
            }
        }

        // Initialize machine encryptions
        await this.encryption.initializeMachines(machineKeysMap);

        // Process all machines first, then update state once
        const decryptedMachines: Machine[] = [];

        for (const machine of machines) {
            // Get machine-specific encryption (might exist from previous initialization)
            const machineEncryption = this.encryption.getMachineEncryption(machine.id);
            if (!machineEncryption) {
                console.error(`Machine encryption not found for ${machine.id} - this should never happen`);
                continue;
            }

            try {

                // Use machine-specific encryption (which handles fallback internally)
                const metadata = machine.metadata
                    ? await machineEncryption.decryptMetadata(machine.metadataVersion, machine.metadata)
                    : null;

                const daemonState = machine.daemonState
                    ? await machineEncryption.decryptDaemonState(machine.daemonStateVersion || 0, machine.daemonState)
                    : null;

                decryptedMachines.push({
                    id: machine.id,
                    seq: machine.seq,
                    createdAt: machine.createdAt,
                    updatedAt: machine.updatedAt,
                    active: machine.active,
                    activeAt: machine.activeAt,
                    metadata,
                    metadataVersion: machine.metadataVersion,
                    daemonState,
                    daemonStateVersion: machine.daemonStateVersion || 0
                });
            } catch (error) {
                console.error(`Failed to decrypt machine ${machine.id}:`, error);
                // Still add the machine with null metadata
                decryptedMachines.push({
                    id: machine.id,
                    seq: machine.seq,
                    createdAt: machine.createdAt,
                    updatedAt: machine.updatedAt,
                    active: machine.active,
                    activeAt: machine.activeAt,
                    metadata: null,
                    metadataVersion: machine.metadataVersion,
                    daemonState: null,
                    daemonStateVersion: 0
                });
            }
        }

        // Replace entire machine state with fetched machines
        storage.getState().applyMachines(decryptedMachines, true);
        log.log(`🖥️ fetchMachines completed - processed ${decryptedMachines.length} machines`);
    }

    private fetchFriends = async () => {
        if (!this.credentials) return;

        try {
            log.log('👥 Fetching friends list...');
            const friendsList = await getFriendsList(this.credentials);
            storage.getState().applyFriends(friendsList);
            log.log(`👥 fetchFriends completed - processed ${friendsList.length} friends`);
        } catch (error) {
            console.error('Failed to fetch friends:', error);
            // Silently handle error - UI will show appropriate state
        }
    }

    private fetchFriendRequests = async () => {
        // Friend requests are now included in the friends list with status='pending'
        // This method is kept for backward compatibility but does nothing
        log.log('👥 fetchFriendRequests called - now handled by fetchFriends');
    }

    private fetchTodos = async () => {
        if (!this.credentials) return;

        try {
            log.log('📝 Fetching todos...');
            await initializeTodoSync(this.credentials);
            log.log('📝 Todos loaded');
        } catch (error) {
            log.log('📝 Failed to fetch todos:');
        }
    }

    private applyTodoSocketUpdates = async (changes: any[]) => {
        if (!this.credentials || !this.encryption) return;

        const currentState = storage.getState();
        const todoState = currentState.todoState;
        if (!todoState) {
            // No todo state yet, just refetch
            this.todosSync.invalidate();
            return;
        }

        const { todos, undoneOrder, doneOrder, versions } = todoState;
        let updatedTodos = { ...todos };
        let updatedVersions = { ...versions };
        let indexUpdated = false;
        let newUndoneOrder = undoneOrder;
        let newDoneOrder = doneOrder;

        // Process each change
        for (const change of changes) {
            try {
                const key = change.key;
                const version = change.version;

                // Update version tracking
                updatedVersions[key] = version;

                if (change.value === null) {
                    // Item was deleted
                    if (key.startsWith('todo.') && key !== 'todo.index') {
                        const todoId = key.substring(5); // Remove 'todo.' prefix
                        delete updatedTodos[todoId];
                        newUndoneOrder = newUndoneOrder.filter(id => id !== todoId);
                        newDoneOrder = newDoneOrder.filter(id => id !== todoId);
                    }
                } else {
                    // Item was added or updated
                    const decrypted = await this.encryption.decryptRaw(change.value);

                    if (key === 'todo.index') {
                        // Update the index
                        const index = decrypted as any;
                        newUndoneOrder = index.undoneOrder || [];
                        newDoneOrder = index.completedOrder || []; // Map completedOrder to doneOrder
                        indexUpdated = true;
                    } else if (key.startsWith('todo.')) {
                        // Update a todo item
                        const todoId = key.substring(5);
                        if (todoId && todoId !== 'index') {
                            updatedTodos[todoId] = decrypted as any;
                        }
                    }
                }
            } catch (error) {
                console.error(`Failed to process todo change for key ${change.key}:`, error);
            }
        }

        // Apply the updated state
        storage.getState().applyTodos({
            todos: updatedTodos,
            undoneOrder: newUndoneOrder,
            doneOrder: newDoneOrder,
            versions: updatedVersions
        });

        log.log('📝 Applied todo socket updates successfully');
    }

    private fetchFeed = async () => {
        if (!this.credentials) return;

        try {
            log.log('📰 Fetching feed...');
            const state = storage.getState();
            const existingItems = state.feedItems;
            const head = state.feedHead;

            // Load feed items - if we have a head, load newer items
            let allItems: FeedItem[] = [];
            let hasMore = true;
            let cursor = head ? { after: head } : undefined;
            let loadedCount = 0;
            const maxItems = 500;

            // Keep loading until we reach known items or hit max limit
            while (hasMore && loadedCount < maxItems) {
                const response = await fetchFeed(this.credentials, {
                    limit: 100,
                    ...cursor
                });

                // Check if we reached known items (O(1) lookup using Set)
                const existingItemIds = new Set(existingItems.map(e => e.id));
                const foundKnown = response.items.some(item => existingItemIds.has(item.id));

                allItems.push(...response.items);
                loadedCount += response.items.length;
                hasMore = response.hasMore && !foundKnown;

                // Update cursor for next page
                if (response.items.length > 0) {
                    const lastItem = response.items[response.items.length - 1];
                    cursor = { after: lastItem.cursor };
                }
            }

            // If this is initial load (no head), also load older items
            if (!head && allItems.length < 100) {
                const response = await fetchFeed(this.credentials, {
                    limit: 100
                });
                allItems.push(...response.items);
            }

            // Collect user IDs from friend-related feed items
            const userIds = new Set<string>();
            allItems.forEach(item => {
                if (item.body && (item.body.kind === 'friend_request' || item.body.kind === 'friend_accepted')) {
                    userIds.add(item.body.uid);
                }
            });

            // Fetch missing users
            if (userIds.size > 0) {
                await this.assumeUsers(Array.from(userIds));
            }

            // Filter out items where user is not found (404)
            const users = storage.getState().users;
            const compatibleItems = allItems.filter(item => {
                // Keep text items
                if (item.body.kind === 'text') return true;

                // For friend-related items, check if user exists and is not null (404)
                if (item.body.kind === 'friend_request' || item.body.kind === 'friend_accepted') {
                    const userProfile = users[item.body.uid];
                    // Keep item only if user exists and is not null
                    return userProfile !== null && userProfile !== undefined;
                }

                return true;
            });

            // Apply only compatible items to storage
            storage.getState().applyFeedItems(compatibleItems);
            log.log(`📰 fetchFeed completed - loaded ${compatibleItems.length} compatible items (${allItems.length - compatibleItems.length} filtered)`);
        } catch (error) {
            console.error('Failed to fetch feed:', error);
        }
    }

    private syncSettings = async () => {
        if (!this.credentials) return;

        const API_ENDPOINT = getServerUrl();
        // Apply pending settings
        if (Object.keys(this.pendingSettings).length > 0) {

            while (true) {
                let version = storage.getState().settingsVersion;
                let settings = applySettings(storage.getState().settings, this.pendingSettings);
                const response = await fetch(`${API_ENDPOINT}/v1/account/settings`, {
                    method: 'POST',
                    body: JSON.stringify({
                        settings: await this.encryption.encryptRaw(settings),
                        expectedVersion: version ?? 0
                    }),
                    headers: {
                        'Authorization': `Bearer ${this.credentials.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json() as {
                    success: false,
                    error: string,
                    currentVersion: number,
                    currentSettings: string | null
                } | {
                    success: true
                };
                if (data.success) {
                    break;
                }
                if (data.error === 'version-mismatch') {
                    let parsedSettings: Settings;
                    if (data.currentSettings) {
                        parsedSettings = settingsParse(await this.encryption.decryptRaw(data.currentSettings));
                    } else {
                        parsedSettings = { ...settingsDefaults };
                    }

                    // Apply settings to storage
                    storage.getState().applySettings(parsedSettings, data.currentVersion);

                    // Clear pending
                    savePendingSettings({});

                    // Sync PostHog opt-out state with settings
                    if (tracking) {
                        if (parsedSettings.analyticsOptOut) {
                            tracking.optOut();
                        } else {
                            tracking.optIn();
                        }
                    }

                } else {
                    throw new Error(`Failed to sync settings: ${data.error}`);
                }

                // Wait 1 second
                await new Promise(resolve => setTimeout(resolve, 1000));
                break;
            }
        }

        // Run request
        const response = await fetch(`${API_ENDPOINT}/v1/account/settings`, {
            headers: {
                'Authorization': `Bearer ${this.credentials.token}`,
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch settings: ${response.status}`);
        }
        const data = await response.json() as {
            settings: string | null,
            settingsVersion: number
        };

        // Parse response
        let parsedSettings: Settings;
        if (data.settings) {
            parsedSettings = settingsParse(await this.encryption.decryptRaw(data.settings));
        } else {
            parsedSettings = { ...settingsDefaults };
        }

        // Apply settings to storage
        storage.getState().applySettings(parsedSettings, data.settingsVersion);

        // Sync PostHog opt-out state with settings
        if (tracking) {
            if (parsedSettings.analyticsOptOut) {
                tracking.optOut();
            } else {
                tracking.optIn();
            }
        }
    }

    private fetchProfile = async () => {
        if (!this.credentials) return;

        const API_ENDPOINT = getServerUrl();
        const response = await fetch(`${API_ENDPOINT}/v1/account/profile`, {
            headers: {
                'Authorization': `Bearer ${this.credentials.token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch profile: ${response.status}`);
        }

        const data = await response.json();
        const parsedProfile = profileParse(data);

        // Apply profile to storage
        storage.getState().applyProfile(parsedProfile);
    }

    public async updateSessionMetadata(sessionId: string, metadata: any): Promise<void> {
        if (!this.credentials) return;

        try {
            // Get session encryption
            const sessionEncryption = this.encryption.getSessionEncryption(sessionId);
            if (!sessionEncryption) {
                throw new Error('Session encryption not found');
            }

            // Get current session to get version
            const session = storage.getState().sessions[sessionId];
            if (!session) {
                throw new Error('Session not found');
            }

            // Encrypt metadata
            const encryptedMetadata = await sessionEncryption.encryptMetadata(metadata);

            // Send update to server
            const API_ENDPOINT = getServerUrl();
            const response = await fetch(`${API_ENDPOINT}/v1/sessions/${sessionId}/metadata`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.credentials.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    metadata: encryptedMetadata,
                    expectedVersion: session.metadataVersion
                })
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`Session ${sessionId} not found on server (404). Deleting locally.`);
                    storage.getState().deleteSession(sessionId);
                    return;
                }
                throw new Error(`Failed to update session metadata: ${response.status}`);
            }

            const data = await response.json();

            // Update local storage
            storage.getState().updateSessionMetadata(sessionId, metadata, data.version);
        } catch (error) {
            console.error('Failed to update session metadata:', error);
            throw error;
        }
    }

    /**
     * Sync session to team using Server API (avoids version conflicts)
     * Called when session metadata contains teamId/role information
     */
    private isTeamNotFoundError(error: unknown): boolean {
        const message = error instanceof Error ? error.message : String(error);
        const normalized = message.toLowerCase();
        return normalized.includes('team not found') || normalized.includes('artifact not found');
    }

    private getTeamMembersFromSessions(teamId: string): KanbanTeamMember[] {
        const members: KanbanTeamMember[] = [];
        const sessions = storage.getState().sessions;
        for (const session of Object.values(sessions)) {
            if (!session.metadata) {
                continue;
            }
            let metadata: any = session.metadata;
            if (typeof metadata === 'string') {
                try {
                    metadata = JSON.parse(metadata);
                } catch {
                    continue;
                }
            }
            if (metadata?.teamId !== teamId) {
                continue;
            }
            members.push({
                sessionId: session.id,
                roleId: metadata.role || 'member',
                displayName: metadata.displayName
            });
        }
        return members;
    }

    private async ensureTeamArtifact(teamId: string): Promise<boolean> {
        if (!this.credentials) {
            return false;
        }

        try {
            await fetchArtifact(this.credentials, teamId);
            return false;
        } catch (error) {
            if (!this.isTeamNotFoundError(error)) {
                throw error;
            }
        }

        const localArtifact = storage.getState().artifacts[teamId];
        const title = localArtifact?.title ?? 'Team';
        let body = localArtifact?.body ?? null;

        if (!body) {
            const members = this.getTeamMembersFromSessions(teamId);
            const baseTeam = DEFAULT_KANBAN_BOARD.team
                ? { ...DEFAULT_KANBAN_BOARD.team, members: members.length > 0 ? members : [...DEFAULT_KANBAN_BOARD.team.members] }
                : undefined;
            const fallbackBoard: KanbanBoard = {
                ...DEFAULT_KANBAN_BOARD,
                tasks: [...DEFAULT_KANBAN_BOARD.tasks],
                team: baseTeam
            };
            body = JSON.stringify(fallbackBoard, null, 2);
        }

        let parsedBoard: KanbanBoard | undefined;
        try {
            parsedBoard = body ? JSON.parse(body) as KanbanBoard : undefined;
        } catch {
            parsedBoard = undefined;
        }

        await this.registerTeam({
            id: teamId,
            name: title,
            ...(parsedBoard?.description ? { description: parsedBoard.description } : {}),
            ...(parsedBoard ? { board: parsedBoard } : {}),
        });
        await this.fetchArtifactWithBody(teamId);
        return true;
    }

    private async withTeamRecovery<T>(teamId: string, action: () => Promise<T>): Promise<T> {
        try {
            return await action();
        } catch (error) {
            if (!this.isTeamNotFoundError(error)) {
                throw error;
            }
        }

        const recreated = await this.ensureTeamArtifact(teamId);
        if (!recreated) {
            throw new Error('Team not found');
        }
        return await action();
    }

    private syncSessionToTeam = async (sessionId: string, sessionMetadata: any): Promise<void> => {
        if (!sessionMetadata) {
            return;
        }

        // Handle case where metadata is JSON string
        let metadata = sessionMetadata;
        if (typeof sessionMetadata === 'string') {
            try {
                metadata = JSON.parse(sessionMetadata);
            } catch (e) {
                console.error(`[syncSessionToTeam] Failed to parse metadata string:`, e);
                return;
            }
        }

        const teamId = metadata.teamId;
        const role = metadata.role;

        // Only sync if session has both teamId and role
        if (!teamId || !role) {
            return;
        }

        // Deduplicate: only call addTeamMember once per (sessionId, teamId) combination.
        // Without this, every agentState update triggers addTeamMember → DB write + broadcast storm.
        const dedupeKey = `${teamId}:${sessionId}`;
        if (this.syncedSessionTeams.has(dedupeKey)) {
            return;
        }

        try {
            await this.addTeamMember(teamId, sessionId, role);
            this.syncedSessionTeams.add(dedupeKey);
        } catch (error) {
            // Log but don't throw - member may already exist
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[syncSessionToTeam] Failed to add member to team: ${errorMsg}`);
        }
    }

    private removeSessionFromTeams = async (sessionId: string): Promise<void> => {
        try {
            // Get all artifacts
            const artifacts = storage.getState().artifacts;

            // Filter for team artifacts
            const teamArtifacts = Object.values(artifacts).filter(a => a.type === 'team' && a.body);

            for (const teamArtifact of teamArtifacts) {
                let board: any;
                try {
                    board = JSON.parse(teamArtifact.body!);
                } catch (e) {
                    continue;
                }

                // Check if team structure exists and has members
                if (!board.team || !Array.isArray(board.team.members)) {
                    continue;
                }

                // Check if session is in members
                const memberIndex = board.team.members.findIndex((m: any) => m.sessionId === sessionId);

                if (memberIndex !== -1) {
                    console.log(`[removeSessionFromTeams] Removing ${sessionId} from team ${teamArtifact.id}`);

                    // Remove member from array
                    board.team.members.splice(memberIndex, 1);

                    // Update artifact
                    const updatedBody = JSON.stringify(board, null, 2);
                    const allMemberIds = board.team.members
                        .map((m: any) => m.sessionId)
                        .filter((id: string) => id && id.length > 0);

                    await this.updateArtifact(teamArtifact.id, teamArtifact.title || teamArtifact.id, updatedBody, allMemberIds, false, 'team');

                    console.log(`[removeSessionFromTeams] Successfully removed ${sessionId} from team ${teamArtifact.id}`);
                }
            }
        } catch (error) {
            console.error(`[removeSessionFromTeams] Failed to remove session from teams:`, error);
        }
    }

    private fetchNativeUpdate = async () => {
        try {
            // Skip in development
            if ((Platform.OS !== 'android' && Platform.OS !== 'ios') || !Constants.expoConfig?.version) {
                return;
            }
            if (Platform.OS === 'ios' && !Constants.expoConfig?.ios?.bundleIdentifier) {
                return;
            }
            if (Platform.OS === 'android' && !Constants.expoConfig?.android?.package) {
                return;
            }

            const serverUrl = getServerUrl();

            // Get platform and app identifiers
            const platform = Platform.OS;
            const version = Constants.expoConfig?.version!;
            const appId = (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.bundleIdentifier! : Constants.expoConfig?.android?.package!);

            const response = await fetch(`${serverUrl}/v1/version`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    platform,
                    version,
                    app_id: appId,
                }),
            });

            if (!response.ok) {
                console.log(`[fetchNativeUpdate] Request failed: ${response.status}`);
                return;
            }

            const data = await response.json();
            console.log('[fetchNativeUpdate] Data:', data);

            // Apply update status to storage
            if (data.update_required && data.update_url) {
                storage.getState().applyNativeUpdateStatus({
                    available: true,
                    updateUrl: data.update_url
                });
            } else {
                storage.getState().applyNativeUpdateStatus({
                    available: false
                });
            }
        } catch (error) {
            console.log('[fetchNativeUpdate] Error:', error);
            storage.getState().applyNativeUpdateStatus(null);
        }
    }

    private syncPurchases = async () => {
        try {
            // Initialize RevenueCat if not already done
            if (!this.revenueCatInitialized) {
                // Get the appropriate API key based on platform
                let apiKey: string | undefined;

                if (Platform.OS === 'ios') {
                    apiKey = config.revenueCatAppleKey;
                } else if (Platform.OS === 'android') {
                    apiKey = config.revenueCatGoogleKey;
                } else if (Platform.OS === 'web') {
                    apiKey = config.revenueCatStripeKey;
                }

                if (!apiKey) {
                    console.log(`RevenueCat: No API key found for platform ${Platform.OS}`);
                    return;
                }

                // Configure RevenueCat
                if (__DEV__) {
                    RevenueCat.setLogLevel(LogLevel.DEBUG);
                }

                // Initialize with the public ID as user ID
                RevenueCat.configure({
                    apiKey,
                    appUserID: this.serverID, // In server this is a CUID, which we can assume is globaly unique even between servers
                    useAmazon: false,
                });

                this.revenueCatInitialized = true;
                console.log('RevenueCat initialized successfully');
            }

            // Sync purchases
            await RevenueCat.syncPurchases();

            // Fetch customer info
            const customerInfo = await RevenueCat.getCustomerInfo();

            // Apply to storage (storage handles the transformation)
            storage.getState().applyPurchases(customerInfo);

        } catch (error) {
            console.error('Failed to sync purchases:', error);
            // Don't throw - purchases are optional
        }
    }

    private fetchMessages = async (sessionId: string) => {
        log.log(`💬 fetchMessages starting for session ${sessionId} - acquiring lock`);

        // Get encryption
        const encryption = this.encryption.getSessionEncryption(sessionId);
        if (!encryption) { // Should never happen
            console.error(`Session ${sessionId} not found`);
            return;
        }

        // Request
        const response = await apiSocket.request(`/v1/sessions/${sessionId}/messages`);
        const data = await response.json();
        const persistedMessageCount = typeof data.totalCount === 'number' ? data.totalCount : undefined;

        // Collect existing messages
        let eixstingMessages = this.sessionReceivedMessages.get(sessionId);
        if (!eixstingMessages) {
            eixstingMessages = new Set<string>();
            this.sessionReceivedMessages.set(sessionId, eixstingMessages);
        }

        // Decrypt and normalize messages
        let start = Date.now();
        let normalizedMessages: NormalizedMessage[] = [];

        // Filter out existing messages and prepare for batch decryption
        const messagesToDecrypt: ApiMessage[] = [];
        for (const msg of [...data.messages as ApiMessage[]].reverse()) {
            if (!eixstingMessages.has(msg.id)) {
                messagesToDecrypt.push(msg);
            }
        }

        // Batch decrypt all messages at once
        const decryptedMessages = await encryption.decryptMessages(messagesToDecrypt);

        // Process decrypted messages
        for (let i = 0; i < decryptedMessages.length; i++) {
            const decrypted = decryptedMessages[i];
            if (decrypted && decrypted.content !== null) {
                eixstingMessages.add(decrypted.id);
                // Normalize the decrypted message
                let normalized = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.content);
                if (normalized) {
                    normalizedMessages.push(normalized);
                }
            }
        }
        log.log(`💬 fetchMessages decrypted ${normalizedMessages.length} messages in ${Date.now() - start}ms`);

        // Apply to storage
        this.applyMessages(sessionId, normalizedMessages);
        storage.getState().setSessionRawMessageCount(sessionId, eixstingMessages.size);
        if (persistedMessageCount !== undefined) {
            storage.getState().setSessionPersistedMessageCount(sessionId, persistedMessageCount);
        }
        log.log(`💬 fetchMessages completed for session ${sessionId} - processed ${normalizedMessages.length} messages`);
    }

    private registerPushToken = async () => {
        log.log('registerPushToken');
        // Only register on mobile platforms
        if (Platform.OS === 'web') {
            return;
        }

        // Request permission
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        log.log('existingStatus: ' + JSON.stringify(existingStatus));

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        log.log('finalStatus: ' + JSON.stringify(finalStatus));

        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return;
        }

        // Get push token
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
        log.log('tokenData: ' + JSON.stringify(tokenData));

        // Register with server
        try {
            await registerPushToken(this.credentials, tokenData.data);
            log.log('Push token registered successfully');
        } catch (error) {
            log.log('Failed to register push token: ' + JSON.stringify(error));
        }
    }

    public async createSession(tag: string, metadata: any): Promise<string> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }

        try {
            // Generate session ID locally
            const sessionId = this.encryption.generateId();

            // Generate data encryption key
            const dataEncryptionKey = ArtifactEncryption.generateDataEncryptionKey();

            // Encrypt the data encryption key with user's key
            const encryptedKey = await this.encryption.encryptEncryptionKey(dataEncryptionKey);

            // Create encryptor for the session
            const encryptor = await this.encryption.openEncryption(dataEncryptionKey);

            // Create temporary SessionEncryption to encrypt metadata
            const sessionEncryption = new SessionEncryption(sessionId, encryptor, this.encryptionCache);

            // Encrypt metadata
            const encryptedMetadata = await sessionEncryption.encryptMetadata(metadata);

            // Send to server
            const API_ENDPOINT = getServerUrl();
            const response = await fetch(`${API_ENDPOINT}/v1/sessions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.credentials.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tag,
                    metadata: encryptedMetadata,
                    dataEncryptionKey: encodeBase64(encryptedKey, 'base64')
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to create session: ${response.status} - ${text}`);
            }

            const data = await response.json();
            const session = data.session;

            // Initialize session encryption in main encryption instance
            const sessionKeys = new Map<string, Uint8Array | null>();
            sessionKeys.set(session.id, dataEncryptionKey);
            await this.encryption.initializeSessions(sessionKeys);

            // Add to local storage
            const processedSession = {
                id: session.id,
                seq: session.seq,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                active: session.active,
                activeAt: session.activeAt,
                metadata: metadata,
                metadataVersion: session.metadataVersion,
                agentState: session.agentState,
                agentStateVersion: session.agentStateVersion,
                thinking: false,
                thinkingAt: 0
            };

            this.applySessions([processedSession]);

            return session.id;
        } catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    }

    public async spawnSessionOnMachine(machineId: string, params: {
        sessionId?: string;
        directory: string;
        agent: 'claude' | 'codex';
        token?: string;
        sessionTag?: string;
        specId?: string;
        teamId?: string;
        role?: string;
        sessionName?: string;
        sessionPath?: string;
        env?: Record<string, string>;
        // Governance identity fields (Phase 1 — M3)
        runId?: string;
        executionPlane?: 'mainline' | 'bypass';
        parentSessionId?: string;
        parentGenomeId?: string;
        generation?: number;
        triggerEventId?: string;
        bypassProfile?: 'init' | 'periodic' | 'event' | 'reactive';
        lifecycleTokenId?: string;
        ttlSeconds?: number;
    }): Promise<string | null> {
        try {
            if (!this.encryption.getMachineEncryption(machineId)) {
                log.log(`Machine encryption missing for ${machineId}; refreshing machines before spawn`);
                await this.machinesSync.invalidateAndAwait();
            }

            if (!this.encryption.getMachineEncryption(machineId)) {
                throw new Error(`Machine encryption not found for ${machineId} after refresh`);
            }

            let resolvedToken = params.token;
            if (!resolvedToken && this.credentials && params.agent === 'codex') {
                try {
                    const openAiToken = await getServiceToken(this.credentials, 'openai');
                    if (openAiToken) {
                        resolvedToken = typeof openAiToken === 'string'
                            ? openAiToken
                            : JSON.stringify(openAiToken);
                        log.log(`Resolved stored OpenAI token for Codex spawn on machine ${machineId}`);
                    } else {
                        log.log(`No stored OpenAI token found for Codex spawn on machine ${machineId}; relying on machine-local Codex auth`);
                    }
                } catch (error) {
                    log.log(`Failed to resolve stored OpenAI token for Codex spawn on machine ${machineId}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            const rpcParams = {
                ...params,
                machineId,
                approvedNewDirectoryCreation: true,
                token: resolvedToken,
                teamId: params.teamId,
                role: params.role,
                sessionName: params.sessionName,
                sessionPath: params.sessionPath,
                env: params.env
                    ? Object.fromEntries(
                        Object.entries(params.env).filter(([k]) => k.startsWith('AHA_'))
                    )
                    : undefined,
                runId: params.runId,
                executionPlane: params.executionPlane,
                parentSessionId: params.parentSessionId,
                parentGenomeId: params.parentGenomeId,
                generation: params.generation,
                triggerEventId: params.triggerEventId,
                bypassProfile: params.bypassProfile,
                lifecycleTokenId: params.lifecycleTokenId,
                ttlSeconds: params.ttlSeconds,
            };

            let result: any;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    result = await apiSocket.machineRPC<any, any>(machineId, 'spawn-aha-session', rpcParams);
                    break;
                } catch (error) {
                    const shouldRetry =
                        attempt === 0 &&
                        error instanceof Error &&
                        error.message.includes('RPC method not available');

                    if (!shouldRetry) {
                        throw error;
                    }

                    log.log(`Machine ${machineId} daemon RPC not ready yet; refreshing machine state and retrying spawn once`);
                    await this.machinesSync.invalidateAndAwait().catch(() => {
                        // Best effort refresh only; retry once regardless.
                    });
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }
            }
            const sessionId = result?.sessionId || (result?.type === 'success' ? result?.sessionId : null);
            if (result?.type === 'requestToApproveDirectoryCreation') {
                console.warn(`Directory creation approval required for: ${result.directory}`);
            }
            if (sessionId) {
                log.log(`Spawned session ${sessionId} on machine ${machineId}`);
                return sessionId;
            }
            log.log(`Spawn request completed on machine ${machineId} (no sessionId returned)`);
            return null;
        } catch (error) {
            await this.machinesSync.invalidateAndAwait().catch(() => {
                // Best effort refresh so the UI can reflect daemon disconnects after an RPC failure.
            });
            console.error(`Failed to spawn session on machine ${machineId}:`, error);
            if (error instanceof Error && error.message.includes('RPC method not available')) {
                throw new Error(`Machine ${machineId} daemon is not reachable right now. Refresh machine status and retry.`);
            }
            throw error;
        }
    }

    public async requestHelpOnMachine(machineId: string, params: {
        teamId: string;
        sessionId?: string;
        type: string;
        description: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
    }): Promise<{ success: boolean; helpAgentSessionId?: string; error?: string }> {
        try {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    return await apiSocket.machineRPC<{ success: boolean; helpAgentSessionId?: string; error?: string }, typeof params>(
                        machineId,
                        'request-help',
                        params
                    );
                } catch (error) {
                    const shouldRetry =
                        attempt === 0 &&
                        error instanceof Error &&
                        error.message.includes('RPC method not available');

                    if (!shouldRetry) {
                        throw error;
                    }

                    log.log(`Machine ${machineId} help RPC not ready yet; refreshing machine state and retrying once`);
                    await this.machinesSync.invalidateAndAwait().catch(() => {
                        // Best effort refresh only; retry once regardless.
                    });
                    await new Promise((resolve) => setTimeout(resolve, 1500));
                }
            }
            throw new Error(`Machine ${machineId} request-help RPC failed after retry`);
        } catch (error) {
            console.error(`Failed to request help on machine ${machineId}:`, error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to request help',
            };
        }
    }



    private subscribeToUpdates = () => {
        // Subscribe to message updates
        apiSocket.onMessage('update', this.handleUpdate.bind(this));
        apiSocket.onMessage('ephemeral', this.handleEphemeralUpdate.bind(this));

        // Subscribe to connection state changes
        apiSocket.onReconnected(() => {
            log.log('🔌 Socket reconnected');
            this.sessionsSync.invalidate();
            this.machinesSync.invalidate();
            log.log('🔌 Socket reconnected: Invalidating artifacts sync');
            this.artifactsSync.invalidate();
            this.friendsSync.invalidate();
            this.friendRequestsSync.invalidate();
            this.feedSync.invalidate();
            const sessionsData = storage.getState().sessionsData;
            if (sessionsData) {
                for (const item of sessionsData) {
                    if (typeof item !== 'string') {
                        this.messagesSync.get(item.id)?.invalidate();
                        // Also invalidate git status on reconnection
                        gitStatusSync.invalidate(item.id);
                    }
                }
            }
        });
    }

    private handleUpdate = async (update: unknown) => {
        let validatedUpdate;
        try {
            validatedUpdate = ApiUpdateContainerSchema.safeParse(update);
        } catch (error) {
            console.error('❌ Sync: Schema validation crashed:', error);
            return;
        }
        if (!validatedUpdate.success) {
            console.log('❌ Sync: Invalid update received:', validatedUpdate.error);
            return;
        }
        const updateData = validatedUpdate.data;
        if (updateData.body.t === 'new-message') {
            // Get encryption
            const encryption = this.encryption.getSessionEncryption(updateData.body.sid);
            if (!encryption) { // Should never happen
                console.error(`Session ${updateData.body.sid} not found`);
                this.fetchSessions(); // Just fetch sessions again
                return;
            }

            // Decrypt message
            let lastMessage: NormalizedMessage | null = null;
            if (updateData.body.message) {
                let existingMessages = this.sessionReceivedMessages.get(updateData.body.sid);
                if (!existingMessages) {
                    existingMessages = new Set<string>();
                    this.sessionReceivedMessages.set(updateData.body.sid, existingMessages);
                }

                const alreadyReceived = existingMessages.has(updateData.body.message.id);
                const nextPersistedCount = getNextPersistedMessageCount({
                    currentPersistedCount: storage.getState().sessions[updateData.body.sid]?.persistedMessageCount,
                    currentLoadedCount: storage.getState().sessionMessages[updateData.body.sid]?.rawCount ?? 0,
                    alreadyReceived,
                });
                if (nextPersistedCount !== null) {
                    const currentSession = storage.getState().sessions[updateData.body.sid];
                    if (currentSession && nextPersistedCount > (currentSession.persistedMessageCount ?? 0)) {
                        // Persisted count is now applied in the same atomic store update as the
                        // session patch + message append to avoid triple-render cascades.
                    }
                }

                const decrypted = await encryption.decryptMessage(updateData.body.message);
                if (decrypted && decrypted.content !== null) {
                    if (existingMessages.has(decrypted.id)) {
                        log.log(`💬 Skipping duplicate realtime message ${decrypted.id} for session ${updateData.body.sid}`);
                    } else {
                        existingMessages.add(decrypted.id);
                        lastMessage = normalizeRawMessage(decrypted.id, decrypted.localId, decrypted.createdAt, decrypted.content);

                        // Update session
                        const session = storage.getState().sessions[updateData.body.sid];
                        if (session) {
                            if (lastMessage) {
                                storage.getState().applyNewMessageAtomic({
                                    sessionId: updateData.body.sid,
                                    messages: [lastMessage],
                                    rawCount: existingMessages.size,
                                    persistedMessageCount: nextPersistedCount,
                                    sessionPatch: {
                                        updatedAt: updateData.createdAt,
                                        seq: updateData.seq,
                                    },
                                });
                            }
                        } else {
                            // Fetch sessions again if we don't have this session
                            this.fetchSessions();
                        }

                        // Update messages
                        if (lastMessage) {
                            let hasMutableTool = false;
                            if (lastMessage.role === 'agent' && lastMessage.content[0] && lastMessage.content[0].type === 'tool-result') {
                                hasMutableTool = storage.getState().isMutableToolCall(updateData.body.sid, lastMessage.content[0].tool_use_id);
                            }
                            if (hasMutableTool) {
                                gitStatusSync.invalidate(updateData.body.sid);
                            }
                        }
                    }
                }
            }

            // Ping session
            this.onSessionVisible(updateData.body.sid);

        } else if (updateData.body.t === 'team-message') {
            const { teamId, message } = updateData.body;
            console.log(`🔄 Sync: Received team message for team ${teamId}: ${message.id}`);

            // Update cache
            const currentMessages = this.teamMessagesCache.get(teamId) || [];
            // Check for duplicates
            const isDuplicate = currentMessages.find(m => m.id === message.id);

            if (!isDuplicate) {
                // Cap in-memory cache at 500 (same bound as sessionStorage)
                const updated = [...currentMessages, message as any].slice(-500);
                this.teamMessagesCache.set(teamId, updated);
                // Persist to sessionStorage so messages survive reconnects (not localStorage — too large)
                try {
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.setItem(`team_msgs_${teamId}`, JSON.stringify(updated));
                    }
                } catch { /* storage full — skip */ }

                // Only notify subscribers for new messages
                const subscribers = this.teamMessageSubscriptions.get(teamId);
                if (subscribers) {
                    subscribers.forEach(callback => callback(message as any));
                }
            } else {
                console.log(`🔄 Sync: Duplicate message ${message.id}, skipping notification`);
            }

            // === Task Events (Server-Driven Task Orchestration) ===
        } else if (updateData.body.t === 'task-created' || updateData.body.t === 'task-updated' || updateData.body.t === 'task-deleted') {
            const { teamId, taskId, task } = updateData.body as { teamId: string; taskId: string; task?: any };
            console.log(`🔄 Sync: Received ${updateData.body.t} for team ${teamId}, task ${taskId}`);

            // CRITICAL FIX: Fetch full artifact with body to update the Board UI
            // artifactsSync.invalidate() only refreshes headers, not body content
            // Board component needs artifact.body to display tasks
            this.fetchArtifactWithBody(teamId).catch(err => {
                console.error(`Failed to fetch artifact body for team ${teamId}:`, err);
            });

            // Also invalidate the list (for header updates like title changes)
            this.artifactsSync.invalidate();

            // Notify task event subscribers
            const taskSubscribers = this.taskEventSubscriptions.get(teamId);
            if (taskSubscribers) {
                taskSubscribers.forEach(callback => callback({
                    type: updateData.body.t as 'task-created' | 'task-updated' | 'task-deleted',
                    teamId,
                    taskId,
                    task
                }));
            }

            // === Team Update Events (Team Management) ===
        } else if (updateData.body.t === 'team-update') {
            const { teamId, eventType, details } = updateData.body as { teamId: string; eventType: string; details: any };
            log.log(`🏢 Team update received: ${eventType} for team ${teamId}`);

            // Handle different team events
            switch (eventType) {
                case 'member-added':
                case 'member-removed':
                    // CRITICAL: Fetch full artifact with body to get updated members list
                    // The members are stored in the artifact body, not header
                    // Just invalidating artifacts sync only refreshes headers, not bodies
                    this.fetchArtifactWithBody(teamId).catch(err => {
                        console.error(`Failed to fetch artifact for member update ${teamId}:`, err);
                    });
                    this.artifactsSync.invalidate();
                    break;
                case 'team-archived':
                case 'team-deleted':
                    // Remove team artifact from local storage
                    storage.getState().deleteArtifact(teamId);
                    // Refresh sessions list (sessions may have been archived/deleted)
                    this.sessionsSync.invalidate();
                    break;
                case 'team-unarchived':
                    // Re-fetch the restored team artifact and refresh sessions
                    this.fetchArtifactWithBody(teamId).catch(err => {
                        console.error(`Failed to fetch artifact for team unarchive ${teamId}:`, err);
                    });
                    this.artifactsSync.invalidate();
                    this.sessionsSync.invalidate();
                    break;
                case 'team-renamed':
                    // Fetch full artifact with body to get updated name
                    // Note: Server updates name in body, not header title
                    // So we need fetchArtifactWithBody, not just artifactsSync.invalidate()
                    this.fetchArtifactWithBody(teamId).catch(err => {
                        console.error(`Failed to fetch artifact for team rename ${teamId}:`, err);
                    });
                    this.artifactsSync.invalidate();
                    break;
            }

            // === Session Update Events (Session Management) ===
        } else if (updateData.body.t === 'session-update') {
            const { sessionId, eventType, details } = updateData.body as { sessionId: string; eventType: string; details?: any };
            log.log(`📋 Session update received: ${eventType} for session ${sessionId}`);

            // Handle different session events
            switch (eventType) {
                case 'session-archived':
                case 'session-deleted':
                    // Remove session from storage
                    storage.getState().deleteSession(sessionId);
                    // Remove encryption keys from memory
                    this.encryption.removeSessionEncryption(sessionId);
                    // Remove from project manager
                    projectManager.removeSession(sessionId);
                    // Clear any cached git status
                    gitStatusSync.clearForSession(sessionId);
                    break;
                case 'session-unarchived':
                    // Refresh sessions list to reload the restored session
                    this.sessionsSync.invalidate();
                    break;
                case 'session-renamed':
                    // Refresh sessions list to get updated name
                    this.sessionsSync.invalidate();
                    break;
            }

        } else if (updateData.body.t === 'new-session') {
            log.log('🆕 New session update received');
            this.sessionsSync.invalidate();
        } else if (updateData.body.t === 'delete-session') {
            log.log('🗑️ Delete session update received');
            const sessionId = updateData.body.sid;

            // Remove session from storage
            storage.getState().deleteSession(sessionId);

            // Remove encryption keys from memory
            this.encryption.removeSessionEncryption(sessionId);

            // Remove from project manager
            projectManager.removeSession(sessionId);

            // Clear any cached git status
            gitStatusSync.clearForSession(sessionId);

            // Remove session from all teams it belongs to
            this.removeSessionFromTeams(sessionId);

            log.log(`🗑️ Session ${sessionId} deleted from local storage`);
        } else if (updateData.body.t === 'update-session') {
            const session = storage.getState().sessions[updateData.body.id];
            if (session) {
                // Get session encryption
                const sessionEncryption = this.encryption.getSessionEncryption(updateData.body.id);
                if (!sessionEncryption) {
                    console.error(`Session encryption not found for ${updateData.body.id} - this should never happen`);
                    return;
                }

                const agentState = updateData.body.agentState && sessionEncryption
                    ? await sessionEncryption.decryptAgentState(updateData.body.agentState.version, updateData.body.agentState.value)
                    : session.agentState;
                const metadata = updateData.body.metadata && sessionEncryption
                    ? await sessionEncryption.decryptMetadata(updateData.body.metadata.version, updateData.body.metadata.value)
                    : session.metadata;

                this.applySessions([{
                    ...session,
                    agentState,
                    agentStateVersion: updateData.body.agentState
                        ? updateData.body.agentState.version
                        : session.agentStateVersion,
                    metadata,
                    metadataVersion: updateData.body.metadata
                        ? updateData.body.metadata.version
                        : session.metadataVersion,
                    updatedAt: updateData.createdAt,
                    seq: updateData.seq
                }]);

                // Invalidate git status when agent state changes (files may have been modified)
                if (updateData.body.agentState) {
                    gitStatusSync.invalidate(updateData.body.id);

                }

                // Auto-sync session metadata to team artifact if session has team information
                this.syncSessionToTeam(updateData.body.id, metadata);
            }
        } else if (updateData.body.t === 'update-account') {
            const accountUpdate = updateData.body;
            const currentProfile = storage.getState().profile;

            // Build updated profile with new data
            const updatedProfile: Profile = {
                ...currentProfile,
                firstName: accountUpdate.firstName !== undefined ? accountUpdate.firstName : currentProfile.firstName,
                lastName: accountUpdate.lastName !== undefined ? accountUpdate.lastName : currentProfile.lastName,
                avatar: accountUpdate.avatar !== undefined ? accountUpdate.avatar : currentProfile.avatar,
                github: accountUpdate.github !== undefined ? accountUpdate.github : currentProfile.github,
                timestamp: updateData.createdAt // Update timestamp to latest
            };

            // Apply the updated profile to storage
            storage.getState().applyProfile(updatedProfile);
        } else if (updateData.body.t === 'update-machine') {
            const machineUpdate = updateData.body;
            const machineId = machineUpdate.machineId;  // Changed from .id to .machineId
            const machine = storage.getState().machines[machineId];

            // Create or update machine with all required fields
            const updatedMachine: Machine = {
                id: machineId,
                seq: updateData.seq,
                createdAt: machine?.createdAt ?? updateData.createdAt,
                updatedAt: updateData.createdAt,
                active: machineUpdate.active ?? true,
                activeAt: machineUpdate.activeAt ?? updateData.createdAt,
                metadata: machine?.metadata ?? null,
                metadataVersion: machine?.metadataVersion ?? 0,
                daemonState: machine?.daemonState ?? null,
                daemonStateVersion: machine?.daemonStateVersion ?? 0
            };

            // Get machine-specific encryption (might not exist if machine wasn't initialized)
            // Get machine-specific encryption (might not exist if machine wasn't initialized)
            const machineEncryption = this.encryption.getMachineEncryption(machineId);
            if (!machineEncryption) {
                // This is normal for machines we haven't paired with yet
                // We can still update basic status like active/activeAt
                console.log(`Machine encryption not found for ${machineId} - skipping decryption of updates`);
            }

            // If metadata is provided, decrypt and update it
            const metadataUpdate = machineUpdate.metadata;
            if (metadataUpdate && machineEncryption) {
                try {
                    const metadata = await machineEncryption.decryptMetadata(metadataUpdate.version, metadataUpdate.value);
                    updatedMachine.metadata = metadata;
                    updatedMachine.metadataVersion = metadataUpdate.version;
                } catch (error) {
                    console.error(`Failed to decrypt machine metadata for ${machineId}:`, error);
                }
            }

            // If daemonState is provided, decrypt and update it
            const daemonStateUpdate = machineUpdate.daemonState;
            if (daemonStateUpdate && machineEncryption) {
                try {
                    const daemonState = await machineEncryption.decryptDaemonState(daemonStateUpdate.version, daemonStateUpdate.value);
                    updatedMachine.daemonState = daemonState;
                    updatedMachine.daemonStateVersion = daemonStateUpdate.version;
                } catch (error) {
                    console.error(`Failed to decrypt machine daemonState for ${machineId}:`, error);
                }
            }

            // Update storage using applyMachines which rebuilds sessionListViewData
            storage.getState().applyMachines([updatedMachine]);
        } else if (updateData.body.t === 'new-machine') {
            log.log('💻 Received new-machine update');
            // We invalidate machines sync to fetch the new machine
            // Note: We might not have the key for this machine yet if it wasn't paired
            this.machinesSync.invalidate();
        } else if (updateData.body.t === 'relationship-updated') {
            log.log('👥 Received relationship-updated update');
            const relationshipUpdate = updateData.body;

            // Apply the relationship update to storage
            storage.getState().applyRelationshipUpdate({
                fromUserId: relationshipUpdate.fromUserId,
                toUserId: relationshipUpdate.toUserId,
                status: relationshipUpdate.status,
                action: relationshipUpdate.action,
                fromUser: relationshipUpdate.fromUser,
                toUser: relationshipUpdate.toUser,
                timestamp: relationshipUpdate.timestamp
            });

            // Invalidate friends data to refresh with latest changes
            this.friendsSync.invalidate();
            this.friendRequestsSync.invalidate();
            this.feedSync.invalidate();
        } else if (updateData.body.t === 'new-artifact') {
            log.log('📦 Received new-artifact update');
            const artifactUpdate = updateData.body;
            const artifactId = artifactUpdate.artifactId;

            try {
                const plaintextTeamArtifact = resolvePlaintextTeamArtifact({
                    id: artifactId,
                    header: artifactUpdate.header,
                    body: artifactUpdate.body,
                    dataEncryptionKey: artifactUpdate.dataEncryptionKey,
                });
                if (plaintextTeamArtifact) {
                    log.log(`📦 Received new-artifact plaintext team compatibility path for ${artifactId}`);

                    const decryptedArtifact: DecryptedArtifact = {
                        id: artifactId,
                        title: plaintextTeamArtifact.header?.title || null,
                        type: plaintextTeamArtifact.header?.type,
                        sessions: plaintextTeamArtifact.header?.sessions,
                        draft: plaintextTeamArtifact.header?.draft,
                        body: plaintextTeamArtifact.body?.body,
                        headerVersion: artifactUpdate.headerVersion,
                        bodyVersion: artifactUpdate.bodyVersion,
                        seq: artifactUpdate.seq,
                        createdAt: artifactUpdate.createdAt,
                        updatedAt: artifactUpdate.updatedAt,
                        isDecrypted: true,
                    };

                    storage.getState().applyArtifacts([decryptedArtifact]);
                    return;
                }

                // Decrypt the data encryption key
                const encryptionContext = await this.encryption.decryptEncryptionKeyWithVariant(artifactUpdate.dataEncryptionKey);
                if (!encryptionContext) {
                    console.error(`Failed to decrypt key for new artifact ${artifactId}`, {
                        stage: 'dataEncryptionKey',
                        compatibilityPathChecked: true,
                        keyPreview: decodeArtifactBase64Text(artifactUpdate.dataEncryptionKey)?.slice(0, 32) ?? 'non-text',
                        likelyCause: 'unsupported legacy wrapper, corrupt key envelope, or wrong account secret',
                    });
                    return;
                }

                // Store the decrypted key in memory
                this.artifactEncryptionContexts.set(artifactId, encryptionContext);

                // Create artifact encryption instance
                const artifactEncryption = new ArtifactEncryption(
                    encryptionContext.key,
                    encryptionContext.variant
                );

                // Decrypt header
                const header = await artifactEncryption.decryptHeader(artifactUpdate.header);

                // Decrypt body if provided
                let decryptedBody: string | null | undefined = undefined;
                if (artifactUpdate.body && artifactUpdate.bodyVersion !== undefined) {
                    const body = await artifactEncryption.decryptBody(artifactUpdate.body);
                    decryptedBody = body?.body || null;
                }

                // Add to storage
                const decryptedArtifact: DecryptedArtifact = {
                    id: artifactId,
                    title: header?.title || null,
                    type: header?.type,
                    sessions: header?.sessions,
                    draft: header?.draft,
                    body: decryptedBody,
                    headerVersion: artifactUpdate.headerVersion,
                    bodyVersion: artifactUpdate.bodyVersion,
                    seq: artifactUpdate.seq,
                    createdAt: artifactUpdate.createdAt,
                    updatedAt: artifactUpdate.updatedAt,
                    isDecrypted: !!header,
                };

                storage.getState().addArtifact(decryptedArtifact);
                log.log(`📦 Added new artifact ${artifactId} to storage`);
            } catch (error) {
                console.error(`Failed to process new artifact ${artifactId}:`, error);
            }
        } else if (updateData.body.t === 'update-artifact') {
            log.log('📦 Received update-artifact update');
            const artifactUpdate = updateData.body;
            const artifactId = artifactUpdate.artifactId;

            // Get existing artifact
            const existingArtifact = storage.getState().artifacts[artifactId];
            if (!existingArtifact) {
                console.error(`Artifact ${artifactId} not found in storage`);
                // Fetch all artifacts to sync
                this.artifactsSync.invalidate();
                return;
            }

            try {
                // Get the data encryption key from memory
                let artifactEncryptionContext = this.artifactEncryptionContexts.get(artifactId);
                if (!artifactEncryptionContext) {
                    console.error(`Encryption key not found for artifact ${artifactId}, fetching artifacts`);
                    this.artifactsSync.invalidate();
                    return;
                }

                // Create artifact encryption instance
                const artifactEncryption = new ArtifactEncryption(
                    artifactEncryptionContext.key,
                    artifactEncryptionContext.variant
                );

                // Update artifact with new data  
                const updatedArtifact: DecryptedArtifact = {
                    ...existingArtifact,
                    seq: updateData.seq,
                    updatedAt: updateData.createdAt,
                };

                // Decrypt and update header if provided
                if (artifactUpdate.header) {
                    const header = await artifactEncryption.decryptHeader(artifactUpdate.header.value);
                    updatedArtifact.title = header?.title || null;
                    updatedArtifact.type = header?.type;
                    updatedArtifact.sessions = header?.sessions;
                    updatedArtifact.draft = header?.draft;
                    updatedArtifact.headerVersion = artifactUpdate.header.version;

                    // If sessions list changed or role assignments might have happened, refresh sessions
                    // This ensures that if a role was assigned in the artifact, the session metadata reflects it
                    if (header?.sessions) {
                        this.sessionsSync.invalidate();
                    }
                }

                // Decrypt and update body if provided
                if (artifactUpdate.body) {
                    const body = await artifactEncryption.decryptBody(artifactUpdate.body.value);
                    updatedArtifact.body = body?.body || null;
                    updatedArtifact.bodyVersion = artifactUpdate.body.version;
                }

                storage.getState().updateArtifact(updatedArtifact);
                log.log(`📦 Updated artifact ${artifactId} in storage`);
            } catch (error) {
                console.error(`Failed to process artifact update ${artifactId}:`, error);
            }
        } else if (updateData.body.t === 'delete-artifact') {
            log.log('📦 Received delete-artifact update');
            const artifactUpdate = updateData.body;
            const artifactId = artifactUpdate.artifactId;

            // Remove from storage
            storage.getState().deleteArtifact(artifactId);

            // Remove encryption key from memory
            this.artifactEncryptionContexts.delete(artifactId);
        } else if (updateData.body.t === 'new-feed-post') {
            log.log('📰 Received new-feed-post update');
            const feedUpdate = updateData.body;

            // Convert to FeedItem with counter from cursor
            const feedItem: FeedItem = {
                id: feedUpdate.id,
                body: feedUpdate.body,
                cursor: feedUpdate.cursor,
                createdAt: feedUpdate.createdAt,
                repeatKey: feedUpdate.repeatKey,
                counter: parseInt(feedUpdate.cursor.substring(2), 10)
            };

            // Check if we need to fetch user for friend-related items
            if (feedItem.body && (feedItem.body.kind === 'friend_request' || feedItem.body.kind === 'friend_accepted')) {
                await this.assumeUsers([feedItem.body.uid]);

                // Check if user fetch failed (404) - don't store item if user not found
                const users = storage.getState().users;
                const userProfile = users[feedItem.body.uid];
                if (userProfile === null || userProfile === undefined) {
                    // User was not found or 404, don't store this item
                    log.log(`📰 Skipping feed item ${feedItem.id} - user ${feedItem.body.uid} not found`);
                    return;
                }
            }

            // Apply to storage (will handle repeatKey replacement)
            storage.getState().applyFeedItems([feedItem]);
        } else if (updateData.body.t === 'kv-batch-update') {
            log.log('📝 Received kv-batch-update');
            const kvUpdate = updateData.body;

            // Process KV changes for todos
            if (kvUpdate.changes && Array.isArray(kvUpdate.changes)) {
                const todoChanges = kvUpdate.changes.filter(change =>
                    change.key && change.key.startsWith('todo.')
                );

                if (todoChanges.length > 0) {
                    log.log(`📝 Processing ${todoChanges.length} todo KV changes from socket`);

                    // Apply the changes directly to avoid unnecessary refetch
                    try {
                        await this.applyTodoSocketUpdates(todoChanges);
                    } catch (error) {
                        console.error('Failed to apply todo socket updates:', error);
                        // Fallback to refetch on error
                        this.todosSync.invalidate();
                    }
                }
            }
        }
    }

    private flushActivityUpdates = (updates: Map<string, ApiEphemeralActivityUpdate>) => {
        // log.log(`🔄 Flushing activity updates for ${updates.size} sessions - acquiring lock`);


        const sessions: Session[] = [];

        for (const [sessionId, update] of updates) {
            const session = storage.getState().sessions[sessionId];
            if (session) {
                sessions.push({
                    ...session,
                    active: update.active,
                    activeAt: update.activeAt,
                    thinking: update.thinking ?? false,
                    thinkingAt: update.activeAt // Always use activeAt for consistency
                });
            }
        }

        if (sessions.length > 0) {
            // console.log('flushing activity updates ' + sessions.length);
            this.applySessions(sessions);
            // log.log(`🔄 Activity updates flushed - updated ${sessions.length} sessions`);
        }
    }

    private flushMachineActivityUpdates = (updates: Map<string, Extract<ApiEphemeralUpdate, { type: 'machine-activity' }>>) => {
        const machines: Machine[] = [];

        for (const [machineId, update] of updates) {
            const machine = storage.getState().machines[machineId];
            if (machine) {
                machines.push({
                    ...machine,
                    active: update.active,
                    activeAt: update.activeAt,
                });
            }
        }

        if (machines.length > 0) {
            storage.getState().applyMachines(machines);
        }
    }

    private handleEphemeralUpdate = (update: unknown) => {
        const validatedUpdate = ApiEphemeralUpdateSchema.safeParse(update);
        if (!validatedUpdate.success) {
            console.log('Invalid ephemeral update received:', validatedUpdate.error);
            console.error('Invalid ephemeral update received:', update);
            return;
        } else {
            // console.log('Ephemeral update received:', update);
        }
        const updateData = validatedUpdate.data;

        // Process activity updates through smart debounce accumulator
        if (updateData.type === 'activity') {
            // console.log('adding activity update ' + updateData.id);
            this.activityAccumulator.addUpdate(updateData);
        }

        // Handle machine activity updates
        if (updateData.type === 'machine-activity') {
            this.machineActivityAccumulator.addUpdate(updateData);
        }

        // daemon-status ephemeral updates are deprecated, machine status is handled via machine-activity

        // Track token usage events
        if (updateData.type === 'usage') {
            trackSessionTokenUsage(
                updateData.tokens.input,
                updateData.tokens.output,
                updateData.cost.total,
            );
        }
    }

    //
    // Apply store
    //

    private applyMessages = (sessionId: string, messages: NormalizedMessage[]) => {
        const result = storage.getState().applyMessages(sessionId, messages);
        let m: Message[] = [];
        for (let messageId of result.changed) {
            const message = storage.getState().sessionMessages[sessionId].messagesMap[messageId];
            if (message) {
                m.push(message);
            }
        }
    }

    private applySessions = (sessions: (Omit<Session, "presence"> & {
        presence?: "online" | number;
    })[]) => {
        const active = storage.getState().getActiveSessions();
        storage.getState().applySessions(sessions);
        const newActive = storage.getState().getActiveSessions();
        this.applySessionDiff(active, newActive);
    }

    private applySessionDiff = (active: Session[], newActive: Session[]) => {
        let wasActive = new Set(active.map(s => s.id));
        let isActive = new Set(newActive.map(s => s.id));
    }

    //
    // Team Messaging
    //

    /**
     * 获取团队消息列表
     */
    async getTeamMessages(teamId: string): Promise<import('@/sync/teamMessageTypes').TeamMessageListResponse> {
        // 先检查内存缓存
        const cached = this.teamMessagesCache.get(teamId);
        if (cached && cached.length > 0) {
            return {
                messages: cached,
                hasMore: false
            };
        }

        // Restore from sessionStorage if available (survives page refresh, not app close)
        try {
            if (typeof sessionStorage !== 'undefined') {
                const stored = sessionStorage.getItem(`team_msgs_${teamId}`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        this.teamMessagesCache.set(teamId, parsed);
                        return { messages: parsed, hasMore: false };
                    }
                }
            }
        } catch { /* ignore */ }

        try {
            const fetchMessages = async () => {
                const response = await apiSocket.request(`/v1/teams/${teamId}/messages`);

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Failed to fetch team messages: ${response.status} - ${text}`);
                }

                const data = await response.json();
                return data.messages || [];
            };

            const messages = await this.withTeamRecovery(teamId, fetchMessages);

            this.teamMessagesCache.set(teamId, messages);

            return {
                messages,
                hasMore: false
            };
        } catch (error) {
            console.error('Failed to fetch team messages:', error);
            return {
                messages: [],
                hasMore: false
            };
        }
    }

    /**
     * 发送团队消息
     */
    async sendTeamMessage(request: import('@/sync/teamMessageTypes').SendTeamMessageRequest): Promise<void> {
        try {
            const serverUrl = getServerUrl();

            // 获取当前 session 信息
            const state = storage.getState();
            const sessions = Object.values(state.sessions);
            const fromSessionId = request.fromSessionId;

            // Resolve session metadata only when we have a session ID
            const sendingSession = fromSessionId
                ? sessions.find((session) => session.id === fromSessionId)
                : undefined;

            const teamArtifact = state.artifacts[request.teamId] ?? null;
            const mentionCandidates = buildTeamMentionCandidates(request.teamId, sessions, teamArtifact);
            const canonicalMentions = canonicalizeTeamMentions(request.mentions, mentionCandidates);
            if (request.mentions && canonicalMentions.length !== request.mentions.length) {
                log.log(`[sendTeamMessage] Dropped unresolved or ambiguous mentions for team ${request.teamId}: ${JSON.stringify(request.mentions)}`);
            }

            const fromRole = request.fromRole ?? (sendingSession?.metadata?.role);
            const fromDisplayName = request.fromDisplayName ?? (sendingSession?.metadata?.name || sendingSession?.metadata?.path);

            const messageId = request.id ?? randomUUID();
            const message: import('@/sync/teamMessageTypes').TeamMessage = {
                id: messageId,
                teamId: request.teamId,
                ...(fromSessionId ? { fromSessionId } : {}),
                ...(fromRole ? { fromRole } : {}),
                ...(fromDisplayName ? { fromDisplayName } : {}),
                content: request.content.slice(0, 48000), // guard against server 50K limit
                type: request.type || 'chat',
                ...(canonicalMentions.length > 0 ? { mentions: canonicalMentions } : {}),
                timestamp: Date.now(),
                ...(request.metadata ? { metadata: request.metadata } : {})
            };

            const sendToServer = async () => {
                const response = await apiSocket.request(`/v1/teams/${request.teamId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(message)
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Failed to send team message: ${response.status} - ${text}`);
                }
            };

            await this.withTeamRecovery(request.teamId, sendToServer);

            // 立即更新本地缓存（cap at 500）
            const cached = this.teamMessagesCache.get(request.teamId) || [];
            this.teamMessagesCache.set(request.teamId, [...cached, message].slice(-500));

            // 触发本地订阅者
            const subscribers = this.teamMessageSubscriptions.get(request.teamId);
            if (subscribers) {
                subscribers.forEach(callback => callback(message));
            }
        } catch (error) {
            console.error('Failed to send team message:', error);
            throw error;
        }
    }

    /**
     * 订阅团队消息
     * NOTE: 同步实现，不使用 Mutex。JS 单线程特性确保 Map/Set 操作是原子的。
     * 使用异步 Mutex 会导致 callback 注册延迟，从而丢失在注册完成前到达的消息。
     */
    subscribeToTeamMessages(
        teamId: string,
        callback: (message: import('@/sync/teamMessageTypes').TeamMessage) => void
    ): () => void {
        let subscribers = this.teamMessageSubscriptions.get(teamId);
        if (!subscribers) {
            subscribers = new Set();
            this.teamMessageSubscriptions.set(teamId, subscribers);
        }

        subscribers.add(callback);

        // 返回取消订阅函数
        return () => {
            const subs = this.teamMessageSubscriptions.get(teamId);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    this.teamMessageSubscriptions.delete(teamId);
                }
            }
        };
    }

    /**
     * Subscribe to task events for a team (Server-Driven Task Orchestration)
     * Events are pushed from server via WebSocket when tasks are created/updated/deleted
     */
    subscribeToTaskEvents(
        teamId: string,
        callback: (event: { type: 'task-created' | 'task-updated' | 'task-deleted'; teamId: string; taskId: string; task?: any }) => void
    ): () => void {
        let subscribers = this.taskEventSubscriptions.get(teamId);
        if (!subscribers) {
            subscribers = new Set();
            this.taskEventSubscriptions.set(teamId, subscribers);
        }

        subscribers.add(callback);

        // Return unsubscribe function
        return () => {
            const subs = this.taskEventSubscriptions.get(teamId);
            if (subs) {
                subs.delete(callback);
                if (subs.size === 0) {
                    this.taskEventSubscriptions.delete(teamId);
                }
            }
        };
    }

    // === Team Management API Methods ===

    /**
     * Add a member to a team
     */
    public async addTeamMember(
        teamId: string,
        sessionId: string,
        roleId?: string,
        displayName?: string,
        opts?: {
            memberId?: string;
            sessionTag?: string;
            candidateId?: string;
            specId?: string;
            customPrompt?: string;
            parentSessionId?: string;
            executionPlane?: string;
            runtimeType?: string;
            authorities?: string[];
            teamOverlay?: Record<string, unknown>;
        }
    ): Promise<import('./apiTeamManagement').TeamMemberResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { addTeamMember } = await import('./apiTeamManagement');
        return this.withTeamRecovery(teamId, () => addTeamMember(this.credentials, teamId, sessionId, roleId, displayName, opts));
    }

    /**
     * Remove a member from a team
     */
    public async removeTeamMember(teamId: string, sessionId: string): Promise<{ success: boolean }> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { removeTeamMember } = await import('./apiTeamManagement');
        return this.withTeamRecovery(teamId, () => removeTeamMember(this.credentials, teamId, sessionId));
    }

    /**
     * Register a team on the server using the canonical /v1/teams path.
     */
    public async registerTeam(params: { id?: string; name: string; description?: string; board?: KanbanBoard }): Promise<import('./apiTeamManagement').TeamSummary> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { createTeam } = await import('./apiTeamManagement');
        return await createTeam(this.credentials, params);
    }

    /**
     * Archive a team and all its sessions
     * @param sessionIds - Session IDs to archive (passed to server since body is encrypted)
     */
    public async archiveTeam(teamId: string, sessionIds: string[] = []): Promise<import('./apiTeamManagement').TeamArchiveResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { archiveTeam } = await import('./apiTeamManagement');
        try {
            const result = await archiveTeam(this.credentials, teamId, sessionIds);
            if (result.success) {
                storage.getState().deleteArtifact(teamId);
                this.sessionsSync.invalidate();
            }
            return result;
        } catch (error) {
            if (this.isTeamNotFoundError(error)) {
                storage.getState().deleteArtifact(teamId);
                return { success: true, archivedSessions: 0 };
            }
            throw error;
        }
    }

    /**
     * Unarchive (restore) a team and all its sessions
     * @param sessionIds - Session IDs to restore (passed to server since body is encrypted)
     */
    public async unarchiveTeam(teamId: string, sessionIds: string[] = []): Promise<import('./apiTeamManagement').TeamUnarchiveResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { unarchiveTeam } = await import('./apiTeamManagement');
        const result = await unarchiveTeam(this.credentials, teamId, sessionIds);
        if (result.success) {
            this.artifactsSync.invalidate();
            this.sessionsSync.invalidate();
            this.fetchArtifactWithBody(teamId).catch(err => {
                console.error(`Failed to fetch artifact after unarchive for team ${teamId}:`, err);
            });
        }
        return result;
    }

    /**
     * Batch unarchive (restore) multiple sessions
     */
    public async batchUnarchiveSessions(sessionIds: string[]): Promise<import('./apiTeamManagement').BatchUnarchiveSessionsResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { batchUnarchiveSessions } = await import('./apiTeamManagement');
        const result = await batchUnarchiveSessions(this.credentials, sessionIds);
        if (result.restored > 0) {
            this.sessionsSync.invalidate();
        }
        return result;
    }

    /**
     * Delete a team and all its sessions
     * @param sessionIds - Session IDs to delete (passed to server since body is encrypted)
     */
    public async deleteTeam(teamId: string, sessionIds: string[] = []): Promise<import('./apiTeamManagement').TeamDeleteResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { deleteTeam } = await import('./apiTeamManagement');
        try {
            const result = await deleteTeam(this.credentials, teamId, sessionIds);
            if (result.success) {
                storage.getState().deleteArtifact(teamId);
                this.sessionsSync.invalidate();
            }
            return result;
        } catch (error) {
            if (this.isTeamNotFoundError(error)) {
                storage.getState().deleteArtifact(teamId);
                return { success: true, deletedSessions: 0 };
            }
            throw error;
        }
    }

    /**
     * Rename a team
     */
    public async renameTeam(teamId: string, newName: string): Promise<import('./apiTeamManagement').TeamRenameResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { renameTeam } = await import('./apiTeamManagement');
        const result = await this.withTeamRecovery(teamId, () => renameTeam(this.credentials, teamId, newName));

        const currentArtifact = storage.getState().artifacts[teamId];
        if (currentArtifact) {
            let nextBody = currentArtifact.body;
            if (currentArtifact.body) {
                try {
                    const parsed = JSON.parse(currentArtifact.body) as KanbanBoard;
                    parsed.name = newName;
                    if (parsed.team) {
                        parsed.team.name = newName;
                    }
                    nextBody = JSON.stringify(parsed, null, 2);
                } catch {
                    // Best effort: keep existing body if local parse fails.
                }
            }

            storage.getState().updateArtifact({
                ...currentArtifact,
                title: newName,
                body: nextBody,
                updatedAt: Date.now(),
            });
        }

        return result;
    }

    /**
     * Batch archive multiple sessions
     */
    public async batchArchiveSessions(sessionIds: string[]): Promise<import('./apiTeamManagement').BatchArchiveSessionsResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { batchArchiveSessions } = await import('./apiTeamManagement');
        return batchArchiveSessions(this.credentials, sessionIds);
    }

    /**
     * Batch delete multiple sessions
     */
    public async batchDeleteSessions(sessionIds: string[]): Promise<import('./apiTeamManagement').BatchDeleteSessionsResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { batchDeleteSessions } = await import('./apiTeamManagement');
        return batchDeleteSessions(this.credentials, sessionIds);
    }

    /**
     * Rename a session
     */
    public async renameSession(sessionId: string, newName: string): Promise<import('./apiTeamManagement').SessionRenameResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { renameSession } = await import('./apiTeamManagement');
        return renameSession(this.credentials, sessionId, newName);
    }

    /**
     * Batch archive multiple teams
     */
    public async batchArchiveTeams(teamIds: string[]): Promise<import('./apiTeamManagement').BatchArchiveTeamsResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { batchArchiveTeams } = await import('./apiTeamManagement');
        const result = await batchArchiveTeams(this.credentials, teamIds);
        result.results
            .filter((entry) => entry.success)
            .forEach((entry) => storage.getState().deleteArtifact(entry.teamId));
        this.sessionsSync.invalidate();
        return result;
    }

    /**
     * Batch delete multiple teams
     */
    public async batchDeleteTeams(teamIds: string[]): Promise<import('./apiTeamManagement').BatchDeleteTeamsResponse> {
        if (!this.credentials) {
            throw new Error('Not authenticated');
        }
        const { batchDeleteTeams } = await import('./apiTeamManagement');
        const result = await batchDeleteTeams(this.credentials, teamIds);
        result.results
            .filter((entry) => entry.success)
            .forEach((entry) => storage.getState().deleteArtifact(entry.teamId));
        this.sessionsSync.invalidate();
        return result;
    }
}

// Global singleton instance
export const sync = new Sync();

//
// Init sequence
//

let isInitialized = false;
export async function syncCreate(credentials: AuthCredentials) {
    if (isInitialized) {
        console.warn('Sync already initialized: ignoring');
        return;
    }
    isInitialized = true;
    await syncInit(credentials, false);
}

export async function syncRestore(credentials: AuthCredentials) {
    if (isInitialized) {
        console.warn('Sync already initialized: ignoring');
        return;
    }
    isInitialized = true;
    await syncInit(credentials, true);
}

/**
 * Force reinitialize sync with new credentials.
 * Used when credentials change (e.g. terminal/connect re-auth).
 * Tears down existing socket and creates fresh encryption + connection.
 */
export async function syncReinitialize(credentials: AuthCredentials) {
    console.log('🔄 Sync: Reinitializing with new credentials');
    try {
        apiSocket.disconnect();
    } catch (e) {
        console.warn('Failed to disconnect socket during reinit:', e);
    }
    isInitialized = true;
    await syncInit(credentials, false);
}

async function syncInit(credentials: AuthCredentials, restore: boolean) {

    // Initialize sync engine
    const secretKey = decodeBase64(credentials.secret, 'base64url');
    if (secretKey.length !== 32) {
        throw new Error(`Invalid secret key length: ${secretKey.length}, expected 32`);
    }
    const encryption = await Encryption.create(secretKey);

    // Initialize tracking
    initializeTracking(encryption.anonID);

    // Initialize socket connection
    const API_ENDPOINT = getServerUrl();
    apiSocket.initialize({ endpoint: API_ENDPOINT, token: credentials.token }, encryption);

    // Wire socket status to storage
    apiSocket.onStatusChange((status) => {
        storage.getState().setSocketStatus(status);
    });

    // Initialize sessions engine
    if (restore) {
        await sync.restore(credentials, encryption);
    } else {
        await sync.create(credentials, encryption);
    }
}
