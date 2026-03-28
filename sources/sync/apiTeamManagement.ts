import type { AuthCredentials } from '@/auth/tokenStorage';
import { backoff, NonRetryableError } from '@/utils/time';
import { checkAuth } from '@/utils/handleResponse';
import { getServerUrl } from './serverConfig';
import type { WorkspaceOverviewSnapshot } from './workspaceOverviewTypes';
import type { KanbanBoard } from './kanbanTypes';

// === Response Types ===

export interface TeamMemberResponse {
    success: boolean;
    member: {
        memberId?: string;
        sessionId: string;
        sessionTag?: string;
        role?: string;
        joinedAt: number;
        authorities?: string[];
        teamOverlay?: Record<string, unknown>;
    };
}

export interface TeamArchiveResponse {
    success: boolean;
    archivedSessions: number;
}

export interface TeamDeleteResponse {
    success: boolean;
    deletedSessions: number;
}

export interface TeamRenameResponse {
    success: boolean;
    team: {
        id: string;
        name: string;
    };
}

export interface BatchArchiveSessionsResponse {
    success: boolean;
    archived: number;
    results: Array<{ sessionId: string; success: boolean; error?: string }>;
}

export interface BatchDeleteSessionsResponse {
    success: boolean;
    deleted: number;
    results: Array<{ sessionId: string; success: boolean; error?: string }>;
}

export interface SessionRenameResponse {
    success: boolean;
    session: {
        id: string;
        name: string;
    };
}

export interface BatchArchiveTeamsResponse {
    success: boolean;
    archived: number;
    results: Array<{ teamId: string; success: boolean; archivedSessions?: number; error?: string }>;
}

export interface TeamUnarchiveResponse {
    success: boolean;
    restoredSessions: number;
}

export interface BatchUnarchiveSessionsResponse {
    success: boolean;
    restored: number;
    results: Array<{ sessionId: string; success: boolean; error?: string }>;
}

export interface BatchDeleteTeamsResponse {
    success: boolean;
    deleted: number;
    results: Array<{ teamId: string; success: boolean; deletedSessions?: number; error?: string }>;
}

export interface TeamSummary {
    id: string;
    name: string;
    memberCount: number;
    taskCount: number;
    createdAt: number;
    updatedAt: number;
}

async function throwTeamManagementHttpError(response: Response, fallbackMessage: string): Promise<never> {
    let serverMessage: string | null = null;

    try {
        const body = await response.json() as { error?: unknown; message?: unknown };
        if (typeof body.error === 'string' && body.error.trim()) {
            serverMessage = body.error;
        } else if (typeof body.message === 'string' && body.message.trim()) {
            serverMessage = body.message;
        }
    } catch {
        // Ignore malformed or empty error bodies and fall back to the provided message.
    }

    const message = serverMessage ?? fallbackMessage;
    const isClientError = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;

    if (isClientError) {
        throw new NonRetryableError(message);
    }

    throw new Error(message);
}

export async function fetchWorkspaceOverview(
    credentials: AuthCredentials,
): Promise<WorkspaceOverviewSnapshot> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/overview`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
            },
        });
        checkAuth(response, credentials.token);

        if (!response.ok) {
            throw new Error(`Failed to fetch workspace overview: ${response.status}`);
        }

        const data = await response.json() as { overview: WorkspaceOverviewSnapshot };
        return data.overview;
    });
}

// === API Functions ===

/**
 * Create a new team
 */
export async function createTeam(
    credentials: AuthCredentials,
    params: { id?: string; name: string; description?: string; board?: KanbanBoard },
): Promise<TeamSummary> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params),
        });
        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to create team: ${response.status}`);
        }

        const data = await response.json() as { team: TeamSummary };
        return data.team;
    });
}

/**
 * Add a member to a team
 */
export async function addTeamMember(
    credentials: AuthCredentials,
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
): Promise<TeamMemberResponse> {
    const API_ENDPOINT = getServerUrl();
    const candidateId = opts?.candidateId ?? (opts?.specId ? `spec:${opts.specId}` : undefined);

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/members`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId,
                roleId: roleId || 'member',
                displayName,
                ...(opts?.memberId !== undefined ? { memberId: opts.memberId } : {}),
                ...(opts?.sessionTag !== undefined ? { sessionTag: opts.sessionTag } : {}),
                ...(candidateId !== undefined ? { candidateId } : {}),
                ...(opts?.specId !== undefined ? { specId: opts.specId } : {}),
                ...(opts?.customPrompt !== undefined ? { customPrompt: opts.customPrompt } : {}),
                ...(opts?.parentSessionId !== undefined ? { parentSessionId: opts.parentSessionId } : {}),
                ...(opts?.executionPlane !== undefined ? { executionPlane: opts.executionPlane } : {}),
                ...(opts?.runtimeType !== undefined ? { runtimeType: opts.runtimeType } : {}),
                ...(opts?.authorities !== undefined ? { authorities: opts.authorities } : {}),
                ...(opts?.teamOverlay !== undefined ? { teamOverlay: opts.teamOverlay } : {}),
            })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to add team member: ${response.status}`);
        }

        return await response.json() as TeamMemberResponse;
    });
}

/**
 * Remove a member from a team
 */
export async function removeTeamMember(
    credentials: AuthCredentials,
    teamId: string,
    sessionId: string
): Promise<{ success: boolean }> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/members/${sessionId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`
            }
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to remove team member: ${response.status}`);
        }

        return await response.json() as { success: boolean };
    });
}

/**
 * Archive a team and all its sessions
 * @param sessionIds - Session IDs to archive (required since body is encrypted)
 */
export async function archiveTeam(
    credentials: AuthCredentials,
    teamId: string,
    sessionIds: string[] = []
): Promise<TeamArchiveResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/archive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to archive team: ${response.status}`);
        }

        return await response.json() as TeamArchiveResponse;
    });
}

/**
 * Delete a team and all its sessions
 * @param sessionIds - Session IDs to delete (required since body is encrypted)
 */
export async function deleteTeam(
    credentials: AuthCredentials,
    teamId: string,
    sessionIds: string[] = []
): Promise<TeamDeleteResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to delete team: ${response.status}`);
        }

        return await response.json() as TeamDeleteResponse;
    });
}

/**
 * Rename a team
 */
export async function renameTeam(
    credentials: AuthCredentials,
    teamId: string,
    newName: string
): Promise<TeamRenameResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/rename`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to rename team: ${response.status}`);
        }

        return await response.json() as TeamRenameResponse;
    });
}

/**
 * Batch archive multiple sessions
 */
export async function batchArchiveSessions(
    credentials: AuthCredentials,
    sessionIds: string[]
): Promise<BatchArchiveSessionsResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/batch/archive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to batch archive sessions: ${response.status}`);
        }

        return await response.json() as BatchArchiveSessionsResponse;
    });
}

/**
 * Unarchive (restore) a team and all its sessions
 */
export async function unarchiveTeam(
    credentials: AuthCredentials,
    teamId: string,
    sessionIds: string[] = []
): Promise<TeamUnarchiveResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/${teamId}/unarchive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to unarchive team: ${response.status}`);
        }

        return await response.json() as TeamUnarchiveResponse;
    });
}

/**
 * Batch unarchive (restore) multiple sessions
 */
export async function batchUnarchiveSessions(
    credentials: AuthCredentials,
    sessionIds: string[]
): Promise<BatchUnarchiveSessionsResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/batch/unarchive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to batch unarchive sessions: ${response.status}`);
        }

        return await response.json() as BatchUnarchiveSessionsResponse;
    });
}

/**
 * Batch delete multiple sessions
 */
export async function batchDeleteSessions(
    credentials: AuthCredentials,
    sessionIds: string[]
): Promise<BatchDeleteSessionsResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/batch/delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to batch delete sessions: ${response.status}`);
        }

        return await response.json() as BatchDeleteSessionsResponse;
    });
}

/**
 * Rename a session
 */
export async function renameSession(
    credentials: AuthCredentials,
    sessionId: string,
    newName: string
): Promise<SessionRenameResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/sessions/${sessionId}/rename`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to rename session: ${response.status}`);
        }

        return await response.json() as SessionRenameResponse;
    });
}

/**
 * Batch archive multiple teams
 */
export async function batchArchiveTeams(
    credentials: AuthCredentials,
    teamIds: string[]
): Promise<BatchArchiveTeamsResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/batch/archive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ teamIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to batch archive teams: ${response.status}`);
        }

        return await response.json() as BatchArchiveTeamsResponse;
    });
}

/**
 * Batch delete multiple teams
 */
export async function batchDeleteTeams(
    credentials: AuthCredentials,
    teamIds: string[]
): Promise<BatchDeleteTeamsResponse> {
    const API_ENDPOINT = getServerUrl();

    return await backoff(async () => {
        const response = await fetch(`${API_ENDPOINT}/v1/teams/batch/delete`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${credentials.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ teamIds })
        });

        checkAuth(response, credentials.token);

        if (!response.ok) {
            await throwTeamManagementHttpError(response, `Failed to batch delete teams: ${response.status}`);
        }

        return await response.json() as BatchDeleteTeamsResponse;
    });
}
