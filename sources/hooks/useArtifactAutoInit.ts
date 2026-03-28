import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { sync } from '@/sync/sync';
import {
    KanbanBoard,
    DEFAULT_KANBAN_BOARD,
    DEFAULT_TEAM_ROLES,
    DEFAULT_TEAM_AGREEMENTS,
} from '@/sync/kanbanTypes';
import type { DecryptedArtifact } from '@/sync/artifactTypes';

type RouterLike = {
    replace: (href: string | { pathname: string; params?: Record<string, unknown> }) => void;
};

/**
 * Manages team artifact loading, auto-initialization, and availability
 * redirect logic for non-desktop (mobile/web) sessions.
 *
 * Scout warning: all effects here are guarded by `if (desktopBridge) return`
 * — keeping them together in one hook prevents accidental desktop-mode
 * activation if the guard is removed in isolation.
 */
export function useArtifactAutoInit({
    teamId,
    artifact,
    isAuthenticated,
    desktopBridge,
    hasLocalTeamSessions,
    isDataReady,
    isLoading,
    setIsLoading,
    router,
}: {
    teamId: string;
    artifact: DecryptedArtifact | null | undefined;
    isAuthenticated: boolean;
    desktopBridge: unknown;
    hasLocalTeamSessions: boolean;
    isDataReady: boolean;
    isLoading: boolean;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    router: RouterLike;
}): {
    autoInitAttempted: boolean;
    redirectUnavailableTeam: () => void;
} {
    const [autoInitAttempted, setAutoInitAttempted] = React.useState(false);
    const unavailableTeamMissesRef = React.useRef(0);
    const unavailableTeamRedirectedRef = React.useRef(false);

    const redirectUnavailableTeam = React.useCallback(() => {
        if (desktopBridge || unavailableTeamRedirectedRef.current) {
            return;
        }

        unavailableTeamRedirectedRef.current = true;
        console.warn(`Redirecting away from unavailable team ${teamId}`);
        router.replace('/teams');
    }, [desktopBridge, router, teamId]);

    const refreshTeamArtifact = React.useCallback(async () => {
        if (desktopBridge || !teamId || !isAuthenticated) {
            return;
        }

        try {
            const refreshedArtifact = await sync.fetchArtifactWithBody(teamId);
            if (refreshedArtifact) {
                unavailableTeamMissesRef.current = 0;
                return;
            }

            if (autoInitAttempted && !hasLocalTeamSessions) {
                unavailableTeamMissesRef.current += 1;
                if (unavailableTeamMissesRef.current >= 2) {
                    redirectUnavailableTeam();
                }
            }
        } catch (error) {
            console.error(`Failed to refresh team artifact ${teamId}:`, error);
        }
    }, [autoInitAttempted, desktopBridge, hasLocalTeamSessions, isAuthenticated, redirectUnavailableTeam, teamId]);

    useFocusEffect(
        React.useCallback(() => {
            if (desktopBridge || !teamId || !isAuthenticated) {
                return undefined;
            }

            void refreshTeamArtifact();

            const interval = setInterval(() => {
                void refreshTeamArtifact();
            }, 5000);

            return () => clearInterval(interval);
        }, [desktopBridge, isAuthenticated, refreshTeamArtifact, teamId]),
    );

    React.useEffect(() => {
        if (desktopBridge) {
            return;
        }
        if (artifact && artifact.body === undefined && !isLoading) {
            setIsLoading(true);
            sync.fetchArtifactWithBody(artifact.id)
                .finally(() => setIsLoading(false));
        }
    }, [artifact, isLoading, desktopBridge, setIsLoading]);

    // Auto-initialize Board if artifact doesn't exist (CLI-created teams)
    React.useEffect(() => {
        // Wait for data to be ready before auto-initializing
        if (desktopBridge || isLoading || autoInitAttempted || !isDataReady || !isAuthenticated) {
            return;
        }
        // If artifact is null (data loaded but artifact doesn't exist), auto-initialize
        if (artifact === null) {
            setAutoInitAttempted(true);
            setIsLoading(true);

            sync.fetchArtifactWithBody(teamId)
                .then((existingArtifact) => {
                    if (existingArtifact) {
                        return;
                    }

                    const initialBoard: KanbanBoard = {
                        ...DEFAULT_KANBAN_BOARD,
                        tasks: [],
                        team: {
                            roles: DEFAULT_TEAM_ROLES,
                            agreements: DEFAULT_TEAM_AGREEMENTS,
                            members: []
                        }
                    };

                    return sync.createArtifact(
                        'Team',
                        JSON.stringify(initialBoard, null, 2),
                        [],
                        false,
                        'team',
                        teamId
                    ).then(() => {
                        return sync.fetchArtifactWithBody(teamId);
                    }).then((createdArtifact) => {
                        if (createdArtifact) {
                            unavailableTeamMissesRef.current = 0;
                        }
                    });
                })
                .catch((error) => {
                    console.error('Failed to ensure Board exists:', error);
                    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
                    if (message.includes('already exists') || message.includes('failed to create artifact: 409')) {
                        redirectUnavailableTeam();
                    }
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    }, [artifact, teamId, desktopBridge, isLoading, autoInitAttempted, isAuthenticated, isDataReady, redirectUnavailableTeam, setIsLoading]);

    return { autoInitAttempted, redirectUnavailableTeam };
}
