/**
 * Genome Hub API client — talks to the standalone marketplace server.
 * Base URL can be provided via EXPO_PUBLIC_GENOME_HUB_URL; otherwise it is
 * derived from the active Aha server URL so web deployments follow their
 * configured origin instead of a build-time production default.
 * All requests are authenticated with a user-scoped token obtained via
 * `getHubToken()` from `@/utils/hubToken`. On 401 we retry once with a
 * freshly minted token.
 */

import { getHubToken, invalidateHubToken } from '@/utils/hubToken';
import { getCurrentAuth } from '@/auth/AuthContext';
import { getServerUrl } from '@/sync/serverConfig';

function isLoopbackOrPrivateHost(hostname: string): boolean {
    return hostname === 'localhost'
        || hostname === '127.0.0.1'
        || hostname.startsWith('192.168.')
        || hostname.startsWith('10.')
        || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
}

function normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
}

function deriveGenomeHubUrl(serverUrl: string): string {
    try {
        const parsed = new URL(serverUrl);
        const port = parsed.port ? Number(parsed.port) : null;
        const path = parsed.pathname.replace(/\/+$/, '');

        parsed.search = '';
        parsed.hash = '';

        if (path === '/api') {
            parsed.pathname = '/genome';
            return normalizeBaseUrl(parsed.toString());
        }

        if (isLoopbackOrPrivateHost(parsed.hostname) && port !== null && Number.isFinite(port)) {
            parsed.port = String(port + 1);
            parsed.pathname = '';
            return normalizeBaseUrl(parsed.toString());
        }

        parsed.pathname = '/genome';
        return normalizeBaseUrl(parsed.toString());
    } catch {
        return normalizeBaseUrl(serverUrl);
    }
}

function getBase(): string {
    const explicitHubUrl = process.env.EXPO_PUBLIC_GENOME_HUB_URL?.trim();
    if (explicitHubUrl) {
        return normalizeBaseUrl(explicitHubUrl);
    }
    return deriveGenomeHubUrl(getServerUrl());
}

export class HubUnauthorizedError extends Error {
    constructor(message = 'hub_unauthorized') {
        super(message);
        this.name = 'HubUnauthorizedError';
    }
}

class HubRateLimitedError extends Error {
    constructor() {
        super('hub_rate_limited');
        this.name = 'HubRateLimitedError';
    }
}

function applyHubAuth(init: RequestInit | undefined, token: string): RequestInit {
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    headers.set('Authorization', `Bearer ${token}`);
    return { ...init, headers };
}

async function hubFetchOnce(path: string, init?: RequestInit): Promise<Response> {
    const token = await getHubToken();
    return fetch(`${getBase()}${path}`, applyHubAuth(init, token));
}

export async function hubFetch(path: string, init?: RequestInit): Promise<Response> {
    let response = await hubFetchOnce(path, init);
    if (response.status === 401) {
        // Token may have expired mid-session — mint once more and retry.
        invalidateHubToken();
        response = await hubFetchOnce(path, init);
        if (response.status === 401) {
            throw new HubUnauthorizedError();
        }
    }
    return response;
}

const HUB_READ_SUCCESS_TTL_MS = 2 * 60_000;
const HUB_READ_MISS_TTL_MS = 5 * 60_000;   // 5 min: avoid hammering missing genomes every 30s
const HUB_RATE_LIMIT_COOLDOWN_MS = 60_000; // 1 min: prevent 429 retry storm

type HubReadCacheEntry<T> = {
    expiresAt: number;
    promise: Promise<T>;
    resolved?: T;
};

const genomeByNameCache = new Map<string, HubReadCacheEntry<GenomeRecord | null>>();
const genomeByIdCache = new Map<string, HubReadCacheEntry<GenomeRecord | null>>();
const genomeByLooseRefCache = new Map<string, HubReadCacheEntry<GenomeRecord | null>>();
let hubReadCooldownUntil = 0;

const OFFICIAL_GENOME_ALIASES: Record<string, string> = {
    architect: 'researcher',
    'solution-architect': 'researcher',
    framer: 'researcher',
    builder: 'implementer',
    member: 'implementer',
    reviewer: 'qa-engineer',
    qa: 'qa-engineer',
    scout: 'researcher',
    observer: 'researcher',
    orchestrator: 'master',
    'project-manager': 'master',
    'product-owner': 'master',
    'business-analyst': 'researcher',
    'product-designer': 'researcher',
    'ux-designer': 'researcher',
    'ux-researcher': 'researcher',
    scribe: 'researcher',
    'technical-writer': 'researcher',
    'spec-writer': 'researcher',
    storyteller: 'researcher',
    'researcher-angle-a': 'researcher',
    'researcher-angle-b': 'researcher',
    'methodology-designer': 'researcher',
    'paper-writer': 'researcher',
    'academic-editor': 'researcher',
    'source-scout': 'researcher',
    'stats-analyzer': 'researcher',
    'case-analyst': 'researcher',
    'citation-manager': 'researcher',
    'quant-researcher': 'researcher',
    brand: 'gstack-product-strategist',
    'product-strategist': 'gstack-product-strategist',
    'strategy-analyst': 'gstack-product-strategist',
    'quant-strategy-analyst': 'gstack-product-strategist',
    'engineering-reviewer': 'gstack-engineering-reviewer',
    'fullstack-builder': 'gstack-fullstack-builder',
    'data-engineer': 'gstack-fullstack-builder',
    'quant-data-engineer': 'gstack-fullstack-builder',
    'code-engineer': 'gstack-fullstack-builder',
    'qa-commander': 'gstack-qa-commander',
    'chart-designer': 'gstack-design-architect',
    'image-prompt': 'gstack-design-architect',
    'design-architect': 'gstack-design-architect',
    'design-lead': 'gstack-design-architect',
    'risk-engineer': 'gstack-security-officer',
    'security-officer': 'gstack-security-officer',
    'quant-risk-manager': 'gstack-security-officer',
    'release-engineer': 'gstack-release-engineer',
    'format-checker': 'gstack-qa-commander',
    'plagiarism-checker': 'gstack-qa-commander',
    'test-quant-agent': 'gstack-qa-commander',
    'retro-analyst': 'gstack-retro-analyst',
    'run-analyst': 'gstack-retro-analyst',
};

const KNOWN_OFFICIAL_ROLE_LOOKUPS = new Set<string>([
    'supervisor',
    'help-agent',
    'org-manager',
    'master',
    'agent-builder',
    'agent-builder-codex',
    'implementer',
    'qa-engineer',
    'researcher',
    'gstack-product-strategist',
    'gstack-engineering-reviewer',
    'gstack-fullstack-builder',
    'gstack-qa-commander',
    'gstack-design-architect',
    'gstack-security-officer',
    'gstack-release-engineer',
    'gstack-retro-analyst',
]);

function activateHubReadCooldown(): void {
    hubReadCooldownUntil = Math.max(hubReadCooldownUntil, Date.now() + HUB_RATE_LIMIT_COOLDOWN_MS);
}

function isHubReadCoolingDown(): boolean {
    return hubReadCooldownUntil > Date.now();
}

async function readThroughHubCache<T>(
    cache: Map<string, HubReadCacheEntry<T>>,
    key: string,
    fallbackValue: T,
    loader: () => Promise<T>,
    options?: {
        successTtlMs?: number;
        missTtlMs?: number;
        isMiss?: (value: T) => boolean;
    },
): Promise<T> {
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
        return cached.promise;
    }

    if (isHubReadCoolingDown()) {
        if (cached?.resolved !== undefined) {
            return cached.resolved;
        }
        return fallbackValue;
    }

    const staleValue = cached?.resolved;
    const request = (async () => {
        try {
            return await loader();
        } catch (error) {
            if (error instanceof HubRateLimitedError) {
                activateHubReadCooldown();
                return staleValue !== undefined ? staleValue : fallbackValue;
            }
            if (staleValue !== undefined) {
                return staleValue;
            }
            throw error;
        }
    })();

    const entry: HubReadCacheEntry<T> = {
        expiresAt: now + (options?.successTtlMs ?? HUB_READ_SUCCESS_TTL_MS),
        promise: request,
        resolved: staleValue,
    };
    cache.set(key, entry);

    try {
        const value = await request;
        entry.resolved = value;
        entry.promise = Promise.resolve(value);
        entry.expiresAt = Date.now() + (
            options?.isMiss?.(value)
                ? (options?.missTtlMs ?? HUB_READ_MISS_TTL_MS)
                : (options?.successTtlMs ?? HUB_READ_SUCCESS_TTL_MS)
        );
        return value;
    } catch (error) {
        if (cache.get(key) === entry) {
            cache.delete(key);
        }
        throw error;
    }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const trimmed = value?.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }

    return result;
}

interface ParsedGenomeRef {
    namespace: string;
    name: string;
    version: number | null;
}

function normalizeGenomeLookupValue(value: string): string {
    const trimmed = value.trim();
    const withoutSpecPrefix = trimmed.startsWith('spec:') ? trimmed.slice(5).trim() : trimmed;

    try {
        return decodeURIComponent(withoutSpecPrefix);
    } catch {
        return withoutSpecPrefix;
    }
}

function parseGenomeRef(value: string): ParsedGenomeRef | null {
    const normalized = normalizeGenomeLookupValue(value);
    const match = normalized.match(/^(@[^/\s]+)\/([^:\s/]+)(?::(\d+))?$/);
    if (!match) {
        return null;
    }

    return {
        namespace: match[1],
        name: match[2],
        version: match[3] ? Number(match[3]) : null,
    };
}

function normalizeGenomeLookupName(name: string): string {
    return name.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function normalizeRuntimeType(
    value: string | null | undefined,
): NonNullable<AgentImage['runtimeType']> | null {
    const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (normalized === 'claude' || normalized === 'codex' || normalized === 'open-code') {
        return normalized as NonNullable<AgentImage['runtimeType']>;
    }
    return null;
}

function looksLikeOpaqueGenomeId(value: string): boolean {
    const normalized = normalizeGenomeLookupValue(value);
    return (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
        || /^[a-z][a-z0-9]{20,}$/i.test(normalized)
    );
}

function looksLikeLooseGenomeName(value: string): boolean {
    const normalized = normalizeGenomeLookupValue(value);
    return /^[a-z0-9][a-z0-9-]{2,}$/i.test(normalized);
}

function getLocalAuthHeaders(): HeadersInit | null {
    const token = getCurrentAuth()?.credentials?.token?.trim();
    if (!token) {
        return null;
    }
    return {
        Authorization: `Bearer ${token}`,
    };
}

async function localGenomeFetch(path: string): Promise<Response | null> {
    const headers = getLocalAuthHeaders();
    if (!headers) {
        return null;
    }

    try {
        return await fetch(`${getServerUrl()}${path}`, { headers });
    } catch {
        return null;
    }
}

async function fetchLocalGenomeById(id: string): Promise<GenomeRecord | null | undefined> {
    const normalized = encodeURIComponent(normalizeGenomeLookupValue(id));
    const res = await localGenomeFetch(`/v1/genomes/${normalized}`);
    if (!res) {
        return undefined;
    }
    if (!res.ok) {
        return null;
    }
    const data = await res.json() as { genome?: GenomeRecord };
    return data.genome ?? null;
}

async function fetchHubGenomeByName(
    namespace: string,
    name: string,
): Promise<GenomeRecord | null | undefined> {
    try {
        const encodedNs = encodeURIComponent(namespace);
        const res = await hubFetch(`/genomes/${encodedNs}/${encodeURIComponent(name)}`);
        if (res.status === 429) {
            activateHubReadCooldown();
            return undefined;
        }
        if (res.status === 404) {
            return null;
        }
        if (!res.ok) {
            return undefined;
        }
        const data = await res.json() as { genome?: GenomeRecord };
        return data.genome ?? null;
    } catch {
        return undefined;
    }
}

async function fetchHubGenomeById(id: string): Promise<GenomeRecord | null | undefined> {
    try {
        const res = await hubFetch(`/genomes/id/${encodeURIComponent(id)}`);
        if (res.status === 429) {
            activateHubReadCooldown();
            return undefined;
        }
        if (res.status === 404) {
            return null;
        }
        if (!res.ok) {
            return undefined;
        }
        const data = await res.json() as { genome?: GenomeRecord };
        return data.genome ?? null;
    } catch {
        return undefined;
    }
}

async function fetchLocalGenomeByName(
    namespace: string,
    name: string,
    version?: number | null,
): Promise<GenomeRecord | null | undefined> {
    const encodedNs = encodeURIComponent(namespace);
    const encodedName = encodeURIComponent(resolveCanonicalGenomeName(namespace, name));
    const path = version
        ? `/v1/genomes/${encodedNs}/${encodedName}/${encodeURIComponent(String(version))}`
        : `/v1/genomes/${encodedNs}/${encodedName}/latest`;
    const res = await localGenomeFetch(path);
    if (!res) {
        return undefined;
    }
    if (!res.ok) {
        return null;
    }
    const data = await res.json() as { genome?: GenomeRecord };
    return data.genome ?? null;
}

async function searchVisibleLocalGenomeByExactName(name: string): Promise<GenomeRecord | null | undefined> {
    const res = await localGenomeFetch('/v1/genomes?limit=200');
    if (!res) {
        return undefined;
    }
    if (!res.ok) {
        return null;
    }
    const data = await res.json() as { genomes?: GenomeRecord[] };
    const normalized = normalizeGenomeLookupValue(name).toLowerCase();
    const candidates = data.genomes ?? [];
    return candidates.find((genome) => genome.name.toLowerCase() === normalized) ?? null;
}

export function resolveCanonicalGenomeName(namespace: string, name: string): string {
    const trimmedName = name.trim();
    const normalizedName = normalizeGenomeLookupName(name);
    if (namespace.trim().toLowerCase() !== '@official') {
        return trimmedName;
    }
    return OFFICIAL_GENOME_ALIASES[normalizedName] ?? normalizedName;
}

export function resolveOfficialRoleGenomeName(name: string): string | null {
    const normalizedName = normalizeGenomeLookupName(name);
    if (!normalizedName) {
        return null;
    }

    const resolvedName = OFFICIAL_GENOME_ALIASES[normalizedName] ?? normalizedName;
    return KNOWN_OFFICIAL_ROLE_LOOKUPS.has(resolvedName) ? resolvedName : null;
}

export interface AgentVerdict {
    evaluationCount: number;
    avgScore: number;
    sessionScore?: {
        taskCompletion: number;
        codeQuality: number;
        collaboration: number;
        overall: number;
    };
    dimensions: {
        delivery: number;
        integrity: number;
        efficiency: number;
        collaboration: number;
        reliability: number;
    };
    distribution: { excellent: number; good: number; fair: number; poor: number };
    suggestions: string[];
    latestAction: string;
}

export interface GenomeRecord {
    id: string;
    kind?: 'agent' | 'legion';           // evolution: entity type (absent on pre-migration records)
    namespace: string | null;
    name: string;
    version: number;
    status: 'draft' | 'unverified' | 'verified' | 'official' | 'archived';
    description: string | null;
    seed?: string | null;                  // evolution: original v1 spec (absent on pre-migration records)
    spec: string;
    tags: string | null;
    category: string | null;
    isPublic: boolean;
    spawnCount: number;
    downloadCount: number;
    starCount: number;
    feedbackData: string | null;
    publisherId: string | null;
    parentId: string | null;
    runtimeType?: string | null;           // evolution: kernel extraction (absent on pre-migration)
    executionPlane?: string | null;         // evolution: kernel extraction
    permissionMode?: string | null;         // evolution: kernel extraction
    lifecycle: 'experimental' | 'active' | 'deprecated' | null;
    createdAt: string;
    updatedAt: string;
}

// ── Evolution types (from genome-hub) ──────────────────────────────

export interface AgentPlugRecord {
    id: string;
    genomeId: string;
    version: number;
    description: string;
    verdictRefs: string | null;
    changes: string;
    strategy: string | null;
    authorRole: string | null;
    createdAt: string;
}

export type AgentPlug = AgentPlugRecord;
export type GenomeDiffRecord = AgentPlugRecord;

export interface DiffLedgerEntry {
    id: string;
    genomeId: string;
    version: number;
    seqNo: number;
    timestamp: string;
    diffType: 'kv' | 'string' | 'narrative';
    path?: string | null;
    op?: string | null;
    oldValue?: string | null;
    newValue?: string | null;
    content?: string | null;
}

export interface TrialRecord {
    id: string;
    hubEntityId: string;
    entityVersion: number;
    teamId: string | null;
    sessionId: string | null;
    contextNarrative: string | null;
    logRefs: string | null;
    startedAt: string;
    endedAt: string | null;
}

export interface AgentVerdictRecord {
    id: string;
    trialId: string;
    readerRole: string;
    readerSessionId: string | null;
    content: string;
    score: number | null;
    action: string | null;
    dimensions: string | null;
    createdAt: string;
}

export type VerdictRecord = AgentVerdictRecord;
export type GenomeFeedback = AgentVerdict;

export function parseAgentVerdict(feedbackData: string | null): AgentVerdict | null {
    if (!feedbackData) return null;
    try {
        return JSON.parse(feedbackData) as AgentVerdict;
    } catch {
        return null;
    }
}

export const parseFeedback = parseAgentVerdict;

export interface SearchResult {
    genomes: GenomeRecord[];
    total: number;
}

export interface SearchParams {
    q?: string;
    namespace?: string;
    category?: string;
    kind?: 'agent' | 'legion';
    runtimeType?: AgentImage['runtimeType'];
    sortBy?: 'updatedAt' | 'spawnCount' | 'score';
    limit?: number;
    offset?: number;
}

interface SearchAllParams extends Omit<SearchParams, 'limit' | 'offset'> {
    pageLimit?: number;
}

export async function searchGenomes(params: SearchParams = {}): Promise<SearchResult> {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.namespace) query.set('namespace', params.namespace);
    if (params.category) query.set('category', params.category);
    if (params.kind) query.set('kind', params.kind);
    if (params.runtimeType) query.set('runtimeType', params.runtimeType);
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.limit != null) query.set('limit', String(params.limit));
    if (params.offset != null) query.set('offset', String(params.offset));

    const qs = query.toString();
    const res = await hubFetch(`/genomes${qs ? `?${qs}` : ''}`);
    if (res.status === 429) {
        throw new HubRateLimitedError();
    }
    if (!res.ok) throw new Error(`Genome Hub error: ${res.status}`);
    return res.json() as Promise<SearchResult>;
}

export async function searchAllGenomes(params: SearchAllParams = {}): Promise<SearchResult> {
    const pageLimit = Math.max(1, Math.min(params.pageLimit ?? 100, 100));
    const genomes: GenomeRecord[] = [];
    let total = 0;
    let offset = 0;

    while (true) {
        const page = await searchGenomes({
            ...params,
            limit: pageLimit,
            offset,
        });

        total = page.total;
        genomes.push(...page.genomes);

        if (page.genomes.length === 0 || page.genomes.length < pageLimit || genomes.length >= total) {
            break;
        }

        offset += page.genomes.length;
    }

    return {
        genomes,
        total,
    };
}

/** Fetch a genome by namespace + name (latest version). Returns null if not found. */
export async function fetchGenomeByName(namespace: string, name: string): Promise<GenomeRecord | null> {
    const lookupName = resolveCanonicalGenomeName(namespace, name);
    const cacheKey = `${namespace}::${lookupName}`;
    try {
        return await readThroughHubCache(
            genomeByNameCache,
            cacheKey,
            null,
            async () => {
                const hubGenome = await fetchHubGenomeByName(namespace, lookupName);
                if (hubGenome) {
                    return hubGenome;
                }

                const hubSearchGenome = hubGenome === null
                    ? await searchOfficialGenomeByLookupName(namespace, lookupName)
                    : undefined;
                if (hubSearchGenome) {
                    return hubSearchGenome;
                }

                const serverGenome = await fetchLocalGenomeByName(namespace, lookupName);
                if (serverGenome !== undefined) {
                    return serverGenome;
                }

                return hubSearchGenome ?? hubGenome ?? null;
            },
            {
                isMiss: (value) => value === null,
            },
        );
    } catch {
        return null;
    }
}

export function getPreferredOfficialGenomeNames(
    name: string,
    runtimeType: NonNullable<AgentImage['runtimeType']>,
): string[] {
    const normalizedName = name.trim().toLowerCase().replace(/[\s_]+/g, '-');
    const canonicalName = resolveCanonicalGenomeName('@official', normalizedName);
    const builderVariants = canonicalName === 'agent-builder'
        ? runtimeType === 'codex'
            ? ['agent-builder-codex-r2', 'agent-builder-codex', 'agent-builder']
            : ['agent-builder-r2', 'agent-builder', 'agent-builder-portable']
        : [];

    return uniqueStrings([
        ...builderVariants,
        normalizedName,
        canonicalName,
    ]);
}

function searchMatchesRole(genome: GenomeRecord, roleNames: string[]): boolean {
    const lookupNames = getGenomeLookupNames(genome);

    return roleNames.some((roleName) => {
        const normalizedRole = roleName.toLowerCase();
        return lookupNames.includes(normalizedRole);
    });
}

function parseGenomeSpec(specJson: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(specJson);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null;
    } catch {
        return null;
    }
}

function collectStringArray(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map((entry) => String(entry).trim()).filter(Boolean)
        : [];
}

function getGenomeLookupNames(genome: GenomeRecord): string[] {
    const spec = parseGenomeSpec(genome.spec);
    const meta = spec?.meta as Record<string, unknown> | undefined;
    const agentImage = meta?.agentImage as Record<string, unknown> | undefined;

    return uniqueStrings([
        genome.name,
        ...parseTags(genome.tags),
        ...(spec?.baseRoleId ? [String(spec.baseRoleId)] : []),
        ...(spec?.teamRole ? [String(spec.teamRole)] : []),
        ...collectStringArray(spec?.aliases),
        ...collectStringArray(agentImage?.retiredAliases),
    ]).map((entry) => entry.toLowerCase());
}

async function searchOfficialGenomeByLookupName(
    namespace: string,
    name: string,
): Promise<GenomeRecord | null | undefined> {
    if (namespace.trim().toLowerCase() !== '@official') {
        return null;
    }

    const normalizedName = resolveCanonicalGenomeName(namespace, name);
    try {
        const result = await searchGenomes({
            q: normalizedName,
            namespace: '@official',
            sortBy: 'score',
            limit: 20,
        });
        return result.genomes.find((genome) => searchMatchesRole(genome, [normalizedName])) ?? null;
    } catch (error) {
        if (error instanceof HubRateLimitedError) {
            activateHubReadCooldown();
        }
        return undefined;
    }
}

export async function fetchPreferredGenomeByName(
    namespace: string,
    name: string,
    runtimeType?: NonNullable<AgentImage['runtimeType']>,
): Promise<GenomeRecord | null> {
    if (!runtimeType || namespace.trim().toLowerCase() !== '@official') {
        return fetchGenomeByName(namespace, name);
    }

    for (const candidateName of getPreferredOfficialGenomeNames(name, runtimeType)) {
        const genome = await fetchGenomeByName(namespace, candidateName);
        if (!genome) {
            continue;
        }
        if (genome.runtimeType === runtimeType) {
            return genome;
        }
    }

    return null;
}

export async function fetchOfficialGenomeByRoleKey(roleKey: string): Promise<GenomeRecord | null> {
    const resolvedName = resolveOfficialRoleGenomeName(roleKey);
    if (!resolvedName) {
        return null;
    }
    return fetchGenomeByName('@official', resolvedName);
}

export async function fetchGenomeWithOfficialFallback(input: {
    specId?: string | null;
    roleId?: string | null;
    runtimeType?: string | null;
}): Promise<GenomeRecord | null> {
    const roleKey = typeof input.roleId === 'string' ? input.roleId.trim() : '';
    const specId = typeof input.specId === 'string' ? input.specId.trim() : '';
    const runtimeType = normalizeRuntimeType(input.runtimeType);
    const parsedSpecRef = specId ? parseGenomeRef(specId) : null;
    const isUnknownOfficialSpecRef = Boolean(
        parsedSpecRef
        && parsedSpecRef.namespace.trim().toLowerCase() === '@official'
        && !resolveOfficialRoleGenomeName(parsedSpecRef.name),
    );

    if (roleKey && resolveOfficialRoleGenomeName(roleKey)) {
        if (runtimeType) {
            const preferred = await fetchPreferredGenomeByName('@official', roleKey, runtimeType);
            if (preferred) {
                return preferred;
            }
        }

        const fallback = await fetchOfficialGenomeByRoleKey(roleKey);
        if (fallback) {
            return fallback;
        }

        // If the current member/session metadata already points at an official role,
        // do not churn the network with stale opaque spec ids after the official
        // lineage lookup has already failed.
        if (looksLikeOpaqueGenomeId(specId)) {
            return null;
        }
    }

    if (isUnknownOfficialSpecRef) {
        return null;
    }

    if (!specId) {
        return null;
    }

    return fetchGenomeById(specId);
}

export async function resolvePreferredGenomeForRole(
    roleId: string,
    runtimeType: NonNullable<AgentImage['runtimeType']>,
): Promise<GenomeRecord | null> {
    const officialGenome = await fetchPreferredGenomeByName('@official', roleId, runtimeType);
    if (officialGenome) {
        return officialGenome;
    }

    const roleNames = getPreferredOfficialGenomeNames(roleId, runtimeType);
    const candidateMap = new Map<string, GenomeRecord>();

    await Promise.all(roleNames.map(async (queryName) => {
        try {
            const result = await searchGenomes({
                q: queryName,
                runtimeType,
                limit: 20,
                sortBy: 'score',
            });

            for (const genome of result.genomes) {
                if (genome.runtimeType !== runtimeType) {
                    continue;
                }
                if (!searchMatchesRole(genome, roleNames)) {
                    continue;
                }
                candidateMap.set(genome.id, genome);
            }
        } catch {
            // Ignore marketplace lookup failures and keep trying other aliases.
        }
    }));

    const candidates = Array.from(candidateMap.values());
    if (candidates.length === 0) {
        return null;
    }

    return candidates.sort((left, right) => {
        const leftFeedback = parseAgentVerdict(left.feedbackData ?? null);
        const rightFeedback = parseAgentVerdict(right.feedbackData ?? null);
        const leftOfficial = Number((left.namespace ?? '').toLowerCase() === '@official');
        const rightOfficial = Number((right.namespace ?? '').toLowerCase() === '@official');
        const leftExact = Number(roleNames.some((roleName) => left.name.toLowerCase() === roleName.toLowerCase()));
        const rightExact = Number(roleNames.some((roleName) => right.name.toLowerCase() === roleName.toLowerCase()));
        const leftScore = leftFeedback?.avgScore ?? 0;
        const rightScore = rightFeedback?.avgScore ?? 0;
        const leftEvalCount = leftFeedback?.evaluationCount ?? 0;
        const rightEvalCount = rightFeedback?.evaluationCount ?? 0;

        return (
            rightOfficial - leftOfficial
            || rightScore - leftScore
            || rightEvalCount - leftEvalCount
            || (right.spawnCount ?? 0) - (left.spawnCount ?? 0)
            || rightExact - leftExact
        );
    })[0] ?? null;
}

/** Fetch all published versions for a genome lineage from genome-hub. */
export async function fetchGenomeVersions(namespace: string, name: string): Promise<GenomeRecord[]> {
    try {
        const encodedNs = encodeURIComponent(namespace);
        const resolvedName = resolveCanonicalGenomeName(namespace, name);
        const res = await hubFetch(`/genomes/${encodedNs}/${encodeURIComponent(resolvedName)}/versions`);
        if (!res.ok) return [];
        const data = await res.json() as { versions?: GenomeRecord[] };
        return data.versions ?? [];
    } catch {
        return [];
    }
}

/** Fetch a specific immutable published version from genome-hub. */
export async function fetchGenomeVersion(
    namespace: string,
    name: string,
    version: number,
): Promise<GenomeRecord | null> {
    try {
        const serverGenome = await fetchLocalGenomeByName(namespace, name, version);
        if (serverGenome !== undefined) {
            return serverGenome;
        }

        const encodedNs = encodeURIComponent(namespace);
        const resolvedName = resolveCanonicalGenomeName(namespace, name);
        const res = await hubFetch(`/genomes/${encodedNs}/${encodeURIComponent(resolvedName)}/${encodeURIComponent(String(version))}`);
        if (!res.ok) return null;
        const data = await res.json() as { genome?: GenomeRecord };
        return data.genome ?? null;
    } catch {
        return null;
    }
}

export function parseTags(tagsJson: string | null): string[] {
    if (!tagsJson) return [];
    try {
        const arr = JSON.parse(tagsJson);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export type TeamAuthority =
    | 'user.reply'
    | 'message.route'
    | 'task.create'
    | 'task.assign'
    | 'task.update.any'
    | 'task.approve'
    | 'task.start.self'
    | 'task.complete.self'
    | 'agent.spawn';

export interface LegionMemberOverlay {
    promptSuffix?: string;
    messaging?: {
        listenFrom?: string[] | '*';
        receiveUserMessages?: boolean;
        replyMode?: 'proactive' | 'responsive' | 'passive';
    };
    behavior?: {
        onIdle?: 'wait' | 'self-assign' | 'ask';
        onBlocked?: 'report' | 'escalate' | 'retry';
        canSpawnAgents?: boolean;
        requireExplicitAssignment?: boolean;
    };
    authorities?: TeamAuthority[];
}

export type CorpsMemberOverlay = LegionMemberOverlay;

export interface LegionTaskPolicy {
    boardIsSourceOfTruth?: boolean;
    requireTaskForExecution?: boolean;
    forbidChatOnlyExecution?: boolean;
    forbidPeerToPeerRouting?: boolean;
}

export type CorpsTaskPolicy = LegionTaskPolicy;

export interface LegionImage {
    namespace: string;
    name: string;
    version: number;
    description: string;
    tags?: string[];
    category?: string;
    members: {
        genome?: string | null;
        genomeRef?: string | null;
        roleAlias?: string;
        role?: string;
        displayName?: string;
        count?: number;
        required?: boolean;
        overlay?: LegionMemberOverlay;
    }[];
    bootContext?: {
        teamDescription?: string;
        initialObjective?: string;
        sharedContext?: string[];
        commandChain?: string[];
        taskPolicy?: LegionTaskPolicy;
    };
}

export type CorpsSpec = LegionImage;
export type LegionSpec = LegionImage;

export function parseLegionImage(specJson: string): LegionImage | null {
    try {
        return JSON.parse(specJson) as LegionImage;
    } catch {
        return null;
    }
}

export const parseCorpsSpec = parseLegionImage;
export const parseLegionSpec = parseLegionImage;

export function getLegionMemberReference(member: {
    genome?: string | null;
    genomeRef?: string | null;
} | null | undefined): string | null {
    const ref = member?.genome ?? member?.genomeRef;
    return typeof ref === 'string' && ref.trim().length > 0 ? ref.trim() : null;
}

export function getLegionMemberDisplayName(member: {
    roleAlias?: string | null;
    displayName?: string | null;
    role?: string | null;
    genome?: string | null;
    genomeRef?: string | null;
} | null | undefined): string {
    for (const value of [member?.roleAlias, member?.displayName, member?.role]) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }

    const ref = getLegionMemberReference(member);
    if (!ref) {
        return '?';
    }

    const tail = ref.split('/').filter(Boolean).pop() ?? ref;
    const label = tail.split('@')[0]?.trim();
    return label || ref;
}

export interface AgentPackageRef {
    ref: string;
    version: number;
    digest?: string;
    source?: 'hub' | 'server' | 'local-file';
}

export interface RuntimeAdapterSpec {
    runtime: 'claude' | 'codex' | 'open-code';
    entry?: {
        instructionFile?: string;
        bootstrapPrompt?: string;
        workingDirectoryMode?: 'inherit' | 'fixed';
    };
    model?: {
        provider?: 'anthropic' | 'zhipu' | 'openai' | 'local' | string;
        primary?: string;
        fallback?: string;
        preferred?: string;
    };
    tools?: {
        allowed?: string[];
        disallowed?: string[];
        mcpServers?: string[];
        skills?: string[];
        hooks?: {
            preToolUse?: Array<{ matcher: string; command: string; description?: string }>;
            postToolUse?: Array<{ matcher: string; command: string; description?: string }>;
            stop?: Array<{ command: string; description?: string }>;
        };
    };
    sandbox?: {
        permissionMode?: string;
        accessLevel?: string;
        executionPlane?: 'mainline' | 'bypass';
        maxTurns?: number;
    };
    env?: {
        requiredEnv?: string[];
        optionalEnv?: string[];
        secretsPolicy?: string[];
    };
    io?: {
        expects?: string[];
        produces?: string[];
        artifactFormats?: string[];
    };
    evidence?: {
        logKinds?: string[];
        scorecardSchemaVersion?: string;
    };
}

// ─── AgentImage (display-only subset of the canonical spec) ──────────────────

export interface AgentImage {
    // Tier 0 — Identity
    displayName?: string;
    description?: string;
    baseRoleId?: string;
    namespace?: string;
    version?: number;
    tags?: string[];
    category?: string;
    runtimeType?: 'claude' | 'codex' | 'open-code';

    // Tier 1 — Prompt (capabilities only, NOT raw systemPrompt)
    systemPrompt?: string;
    systemPromptSuffix?: string;
    responsibilities?: string[];
    protocol?: string[];
    capabilities?: string[];
    authorities?: TeamAuthority[];

    // Tier 2 — Model
    modelId?: string;
    fallbackModelId?: string;
    modelProvider?: string;

    // Tier 3 — Tool access
    allowedTools?: string[];
    disallowedTools?: string[];
    mcpServers?: string[];

    // Tier 4 — Permissions & execution
    permissionMode?: string;
    accessLevel?: string;
    executionPlane?: string;
    maxTurns?: number;
    contextInjections?: Array<{
        trigger: 'on_join' | 'per_tool_call' | 'on_context_threshold' | 'on_resume';
        threshold?: number;
        content: string;
    }>;
    teamRole?: string;
    handoffProtocol?: string[];

    // Tier 7 — Messaging & behavior
    messaging?: {
        listenFrom?: string[] | '*';
        receiveUserMessages?: boolean;
        replyMode?: 'proactive' | 'responsive' | 'passive';
    };
    behavior?: {
        onIdle?: 'wait' | 'self-assign' | 'ask';
        onBlocked?: 'report' | 'escalate' | 'retry';
        canSpawnAgents?: boolean;
        requireExplicitAssignment?: boolean;
    };
    memory?: {
        type?: 'session' | 'persistent' | 'shared';
        learnings?: string[];
        iterationGuide?: {
            recentChanges?: string[];
            discoveries?: string[];
            improvements?: string[];
        };
        knowledgeBase?: string[];
    };
    scopeOfResponsibility?: {
        ownedPaths?: string[];
        forbiddenPaths?: string[];
        outOfScope?: string[];
    };
    modelScores?: Record<string, number>;
    preferredModel?: string;
    resume?: {
        specialties?: string[];
        workHistory?: Array<{
            project?: string;
            domain?: string;
            tasksCompleted?: number;
            avgScore?: number;
            period?: string;
        }>;
        performanceRating?: number;
        totalSessions?: number;
        reviews?: string[];
    };
    operations?: {
        commonPatterns?: string[];
        recentChanges?: string[];
        runtimeConfig?: string;
    };
    compatibility?: {
        worksWellWith?: string[];
        requiredMcpServers?: string[];
        requiredEnvVars?: string[];
        minContextTokens?: number;
    };
    validation?: {
        smokeTest?: {
            requiredTools?: string[];
            requiredFiles?: string[];
            healthChecks?: string[];
        };
        minVerifiedScore?: number;
        minEvaluations?: number;
    };
    resourceBudget?: {
        estimatedTokensPerTask?: number;
        contextWindowSize?: 'small' | 'medium' | 'large';
        concurrencyCapable?: boolean;
    };

    // Tier 8 — Hooks
    hooks?: {
        preToolUse?: Array<{ matcher: string; command: string; description?: string }>;
        postToolUse?: Array<{ matcher: string; command: string; description?: string }>;
        stop?: Array<{ command: string; description?: string }>;
    };

    // Tier 9 — Skills
    skills?: string[];

    meta?: Record<string, unknown>;
}

export type GenomeSpec = AgentImage;
export type AgentSpec = AgentImage;

export interface CanonicalAgentCard {
    kind: 'aha.agent.v1';
    identity: AgentPackageRef & {
        namespace: string;
        name: string;
        displayName?: string;
        description?: string;
    };
    genome: AgentImage;
    adapters?: {
        claude?: RuntimeAdapterSpec;
        codex?: RuntimeAdapterSpec;
        'open-code'?: RuntimeAdapterSpec;
    };
    market?: {
        category?: string;
        tags?: string[];
        lifecycle?: 'experimental' | 'active' | 'deprecated';
        tagline?: string;
    };
    lineage?: {
        origin?: 'original' | 'forked' | 'mutated';
        parentId?: string;
        variantOf?: string;
        mutationNote?: string;
    };
}

export type AgentPackageManifest = CanonicalAgentCard;

export interface A2AProjectionCard {
    protocolVersion: string;
    name: string;
    description: string;
    url: string;
    version?: string;
    preferredTransport?: string;
    defaultInputModes?: string[];
    defaultOutputModes?: string[];
    capabilities?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
    security?: Array<Record<string, unknown>>;
    skills?: Array<{
        id: string;
        name: string;
        description?: string;
        tags?: string[];
        examples?: string[];
        inputModes?: string[];
        outputModes?: string[];
    }>;
}

export function parseAgentImage(specJson: string): AgentImage | null {
    try {
        return JSON.parse(specJson) as AgentImage;
    } catch {
        return null;
    }
}

export const parseSpec = parseAgentImage;

export interface FavoriteGenomeResponse {
    genomes: GenomeRecord[];
    total: number;
}

export interface GenomeFavoriteRecord {
    id: string;
    genomeId: string;
    actorId: string;
    createdAt: string;
}

export interface GenomeFavoriteStatus {
    genome: GenomeRecord;
    favorite: GenomeFavoriteRecord | null;
    isFavorited: boolean;
}

export async function fetchFavoriteGenomes(actorId: string): Promise<FavoriteGenomeResponse> {
    const res = await hubFetch(`/genomes/favorites?actorId=${encodeURIComponent(actorId)}`);
    if (!res.ok) throw new Error(`Genome Hub error: ${res.status}`);
    return res.json() as Promise<FavoriteGenomeResponse>;
}

export async function fetchGenomeFavoriteStatus(id: string, actorId: string): Promise<GenomeFavoriteStatus | null> {
    try {
        const res = await hubFetch(`/genomes/id/${encodeURIComponent(id)}/favorite/${encodeURIComponent(actorId)}`);
        if (!res.ok) return null;
        return res.json() as Promise<GenomeFavoriteStatus>;
    } catch {
        return null;
    }
}

export async function addGenomeFavorite(id: string, actorId: string): Promise<{ genome: GenomeRecord; favorite: GenomeFavoriteRecord; created: boolean }> {
    const res = await hubFetch(`/genomes/id/${encodeURIComponent(id)}/favorite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId }),
    });
    if (!res.ok) throw new Error(`Genome Hub error: ${res.status}`);
    return res.json() as Promise<{ genome: GenomeRecord; favorite: GenomeFavoriteRecord; created: boolean }>;
}

export async function removeGenomeFavorite(id: string, actorId: string): Promise<{ genome: GenomeRecord; removed: boolean }> {
    const res = await hubFetch(`/genomes/id/${encodeURIComponent(id)}/favorite/${encodeURIComponent(actorId)}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Genome Hub error: ${res.status}`);
    return res.json() as Promise<{ genome: GenomeRecord; removed: boolean }>;
}

/** Fetch a genome by its immutable UUID. Returns null if not found. */
export async function fetchGenomeById(id: string): Promise<GenomeRecord | null> {
    try {
        const normalizedId = normalizeGenomeLookupValue(id);
        const parsedRef = parseGenomeRef(normalizedId);
        if (parsedRef) {
            return parsedRef.version
                ? fetchGenomeVersion(parsedRef.namespace, parsedRef.name, parsedRef.version)
                : fetchGenomeByName(parsedRef.namespace, parsedRef.name);
        }

        if (!looksLikeOpaqueGenomeId(normalizedId)) {
            if (!looksLikeLooseGenomeName(normalizedId)) {
                return null;
            }

            return await readThroughHubCache(
                genomeByLooseRefCache,
                normalizedId,
                null,
                async () => {
                    const localGenome = await searchVisibleLocalGenomeByExactName(normalizedId);
                    if (localGenome) {
                        return localGenome;
                    }

                    const result = await searchGenomes({ q: normalizedId, limit: 20 });
                    const exactHubMatch = result.genomes.find((genome) => genome.name.toLowerCase() === normalizedId.toLowerCase()) ?? null;
                    if (exactHubMatch) {
                        return exactHubMatch;
                    }
                    return null;
                },
                {
                    isMiss: (value) => value === null,
                },
            );
        }

        return await readThroughHubCache(
            genomeByIdCache,
            normalizedId,
            null,
            async () => {
                const hubGenome = await fetchHubGenomeById(normalizedId);
                if (hubGenome) {
                    return hubGenome;
                }

                const serverGenome = await fetchLocalGenomeById(normalizedId);
                if (serverGenome !== undefined) {
                    return serverGenome;
                }

                return hubGenome ?? null;
            },
            {
                isMiss: (value) => value === null,
            },
        );
    } catch {
        return null;
    }
}

// ── Evolution: diff chain + seed ───────────────────────────────────

/** view-diff: Get the ordered diff chain for a genome (evolution history). */
export async function fetchGenomeDiffs(namespace: string, name: string): Promise<AgentPlugRecord[]> {
    try {
        const encodedNs = encodeURIComponent(namespace);
        const resolvedName = resolveCanonicalGenomeName(namespace, name);
        const res = await hubFetch(`/genomes/${encodedNs}/${encodeURIComponent(resolvedName)}/diffs`);
        if (!res.ok) return [];
        const data = await res.json() as { diffs: AgentPlugRecord[] };
        return data.diffs ?? [];
    } catch {
        return [];
    }
}

export const fetchAgentPlugs = fetchGenomeDiffs;

/** view-not-diff: Get the original seed spec. */
export async function fetchGenomeSeed(namespace: string, name: string): Promise<string | null> {
    try {
        const encodedNs = encodeURIComponent(namespace);
        const resolvedName = resolveCanonicalGenomeName(namespace, name);
        const res = await hubFetch(`/genomes/${encodedNs}/${encodeURIComponent(resolvedName)}/seed`);
        if (!res.ok) return null;
        const data = await res.json() as { seed: string };
        return data.seed ?? null;
    } catch {
        return null;
    }
}

export async function fetchGenomeLedger(
    namespace: string,
    name: string,
    version?: number,
): Promise<{ ledger: DiffLedgerEntry[]; replayedSpec: string | null }> {
    try {
        const encodedNs = encodeURIComponent(namespace);
        const resolvedName = resolveCanonicalGenomeName(namespace, name);
        const params = new URLSearchParams();
        if (typeof version === 'number' && Number.isFinite(version)) {
            params.set('version', String(version));
        }
        const query = params.toString();
        const res = await hubFetch(
            `/genomes/${encodedNs}/${encodeURIComponent(resolvedName)}/ledger${query ? `?${query}` : ''}`,
        );
        if (!res.ok) {
            return { ledger: [], replayedSpec: null };
        }
        const data = await res.json() as { ledger?: DiffLedgerEntry[]; replayedSpec?: string | null };
        return {
            ledger: data.ledger ?? [],
            replayedSpec: data.replayedSpec ?? null,
        };
    } catch {
        return { ledger: [], replayedSpec: null };
    }
}
