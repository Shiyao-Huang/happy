import React from 'react';
import { sync } from '@/sync/sync';
import { getServerUrl } from '@/sync/serverConfig';
import type { TeamScorecard, TeamPublicReview } from '@/utils/teamUtils';

export function useTeamReviews(
    teamId: string,
    isAuthenticated: boolean,
): {
    teamScorecard: TeamScorecard | null;
    teamPublicReviews: TeamPublicReview[];
    teamReviewLoading: boolean;
} {
    const [teamScorecard, setTeamScorecard] = React.useState<TeamScorecard | null>(null);
    const [teamPublicReviews, setTeamPublicReviews] = React.useState<TeamPublicReview[]>([]);
    const [teamReviewLoading, setTeamReviewLoading] = React.useState(false);

    React.useEffect(() => {
        const credentials = sync.getCredentials();
        if (!teamId || !credentials?.token || !isAuthenticated) {
            setTeamScorecard(null);
            setTeamPublicReviews([]);
            setTeamReviewLoading(false);
            return;
        }

        let cancelled = false;
        const headers = {
            Authorization: `Bearer ${credentials.token}`,
            'Content-Type': 'application/json',
        };
        const encodedTeamId = encodeURIComponent(teamId);

        async function loadTeamReviews() {
            setTeamReviewLoading(true);
            const [scoreResult, reviewsResult] = await Promise.allSettled([
                fetch(`${getServerUrl()}/v1/teams/${encodedTeamId}/score`, { headers }),
                fetch(`${getServerUrl()}/v1/teams/${encodedTeamId}/reviews?limit=3`, { headers }),
            ]);

            if (cancelled) return;

            const nextScore = scoreResult.status === 'fulfilled' && scoreResult.value.ok
                ? await scoreResult.value.json() as TeamScorecard
                : null;
            const nextReviews = reviewsResult.status === 'fulfilled' && reviewsResult.value.ok
                ? ((await reviewsResult.value.json()) as { reviews?: TeamPublicReview[] }).reviews ?? []
                : [];

            setTeamScorecard(nextScore);
            setTeamPublicReviews(nextReviews);
            setTeamReviewLoading(false);
        }

        loadTeamReviews().catch(() => {
            if (cancelled) return;
            setTeamScorecard(null);
            setTeamPublicReviews([]);
            setTeamReviewLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [isAuthenticated, teamId]);

    return { teamScorecard, teamPublicReviews, teamReviewLoading };
}
