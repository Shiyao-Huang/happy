import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { AgentRoster } from '@/components/team/AgentRoster';
import { stylesheet } from '@/app/(app)/teams/teamStyles';
import { t } from '@/text';
import { formatReviewDate, type TeamScorecard, type TeamPublicReview } from '@/utils/teamUtils';
import type { KanbanBoard, KanbanTeamAgreement } from '@/sync/kanbanTypes';

type RosterEntry = {
    member: {
        sessionId: string;
        roleId?: string;
        displayName?: string;
        executionPlane?: string;
        runtimeType?: string;
    };
    session?: {
        metadata?: {
            role?: string;
            name?: string;
            executionPlane?: string;
            flavor?: string | null;
        } | null;
    } | null;
    role?: { id?: string; title?: string };
};

interface TeamInfoSectionProps {
    roster: RosterEntry[];
    agentRosterSessions: Map<string, { active: boolean; activeAt: number }>;
    setSelectedAgentId: (id: string) => void;
    teamPromptLines: string[];
    teamPromptTitle: string;
    teamPromptBody: string[];
    teamBootObjective: string | undefined;
    kanbanData: KanbanBoard;
    teamReviewLoading: boolean;
    teamScorecard: TeamScorecard | null;
    teamPublicReviews: TeamPublicReview[];
    systemRoster: RosterEntry[];
    agreements: KanbanTeamAgreement;
}

export function TeamInfoSection({
    roster,
    agentRosterSessions,
    setSelectedAgentId,
    teamPromptLines,
    teamPromptTitle,
    teamPromptBody,
    teamBootObjective,
    kanbanData,
    teamReviewLoading,
    teamScorecard,
    teamPublicReviews,
    systemRoster,
    agreements,
}: TeamInfoSectionProps) {
    const { theme } = useUnistyles();
    const styles = stylesheet;

    return (
        <ScrollView contentContainerStyle={styles.scrollContent}>
            <AgentRoster
                members={roster.map((entry) => entry.member)}
                sessions={agentRosterSessions}
                onAgentPress={(sessionId) => setSelectedAgentId(sessionId)}
            />
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Team Information</Text>
                {teamPromptLines.length > 0 ? (
                    <View style={styles.showcaseCard}>
                        <Text style={styles.showcaseEyebrow}>Shared team instructions</Text>
                        <Text style={styles.showcaseTitle}>{teamPromptTitle || 'Team System Prompt'}</Text>
                        {teamPromptBody.map((line, index) => (
                            <Text key={`${line}-${index}`} style={styles.promptLine}>
                                {line}
                            </Text>
                        ))}
                        {teamBootObjective ? (
                            <Text style={styles.showcaseLead}>
                                {t('newTeam.teamGoalLabel')}: {teamBootObjective}
                            </Text>
                        ) : null}
                    </View>
                ) : null}
                {!teamPromptLines.length && teamBootObjective ? (
                    <View style={styles.roleCard}>
                        <Text style={styles.roleTitle}>{t('newTeam.teamGoalLabel')}</Text>
                        <Text style={styles.roleSummary}>{teamBootObjective}</Text>
                    </View>
                ) : null}
                <View style={styles.roleCard}>
                    <Text style={styles.roleTitle}>Goal</Text>
                    <Text style={styles.roleSummary}>
                        {(kanbanData.team as any)?.goal || (kanbanData.team as any)?.mission || 'No goal set'}
                    </Text>
                </View>

                {(teamReviewLoading || teamScorecard || teamPublicReviews.length > 0) ? (
                    <>
                        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t('agents.feedbackSection')}</Text>
                        {teamReviewLoading ? (
                            <View style={styles.roleCard}>
                                <Text style={styles.roleSummary}>Loading public team reviews…</Text>
                            </View>
                        ) : null}
                        {teamScorecard ? (
                            <View style={styles.showcaseCard}>
                                <Text style={styles.showcaseEyebrow}>Team reputation</Text>
                                <Text style={styles.showcaseTitle}>Public team review snapshot</Text>
                                <View style={styles.reviewMetricsRow}>
                                    <View style={styles.reviewMetricCard}>
                                        <Text style={styles.reviewMetricLabel}>Average Rating</Text>
                                        <Text style={styles.reviewMetricValue}>
                                            {typeof teamScorecard.averageRating === 'number' ? teamScorecard.averageRating.toFixed(2) : '—'}
                                        </Text>
                                    </View>
                                    <View style={styles.reviewMetricCard}>
                                        <Text style={styles.reviewMetricLabel}>Reviews</Text>
                                        <Text style={styles.reviewMetricValue}>{teamScorecard.reviewCount ?? 0}</Text>
                                    </View>
                                    <View style={styles.reviewMetricCard}>
                                        <Text style={styles.reviewMetricLabel}>Code Total</Text>
                                        <Text style={styles.reviewMetricValue}>{teamScorecard.cumulativeCode ?? '—'}</Text>
                                    </View>
                                    <View style={styles.reviewMetricCard}>
                                        <Text style={styles.reviewMetricLabel}>Quality Total</Text>
                                        <Text style={styles.reviewMetricValue}>{teamScorecard.cumulativeQuality ?? '—'}</Text>
                                    </View>
                                </View>
                                {teamScorecard.sourceScoreTotals ? (
                                    <Text style={styles.reviewMetaText}>
                                        Source totals: user={teamScorecard.sourceScoreTotals.user ?? 0}, master={teamScorecard.sourceScoreTotals.master ?? 0}, system={teamScorecard.sourceScoreTotals.system ?? 0}
                                    </Text>
                                ) : null}
                                {teamScorecard.lastReviewedAt ? (
                                    <Text style={styles.reviewMetaText}>
                                        Last reviewed: {formatReviewDate(teamScorecard.lastReviewedAt)}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}
                        {teamPublicReviews.map((review, index) => {
                            const reviewDate = formatReviewDate(review.createdAt);
                            const headline = review.comment?.trim() || `Review ${index + 1}`;
                            const scoreText = typeof review.rating === 'number' ? `★ ${review.rating.toFixed(1)}` : '—';
                            const secondaryBits = [
                                review.codeScore != null ? `Code ${review.codeScore}` : null,
                                review.qualityScore != null ? `Quality ${review.qualityScore}` : null,
                                review.source ? review.source : null,
                                reviewDate || null,
                            ].filter(Boolean).join(' · ');
                            return (
                                <View key={review.id ?? `review-${index}`} style={styles.reviewItemCard}>
                                    <View style={styles.reviewItemHeader}>
                                        <Text style={styles.reviewItemTitle} numberOfLines={1}>
                                            {headline}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.reviewItemRating,
                                                {
                                                    color: review.rating && review.rating >= 4
                                                        ? '#22c55e'
                                                        : review.rating && review.rating >= 3
                                                            ? '#f59e0b'
                                                            : theme.colors.textSecondary,
                                                },
                                            ]}
                                        >
                                            {scoreText}
                                        </Text>
                                    </View>
                                    {secondaryBits ? (
                                        <Text style={styles.reviewItemComment}>{secondaryBits}</Text>
                                    ) : null}
                                </View>
                            );
                        })}
                    </>
                ) : null}

                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>System Agents</Text>
                {systemRoster.length === 0 ? (
                    <View style={styles.roleCard}>
                        <Text style={styles.roleTitle}>Supervisor</Text>
                        <Text style={styles.roleSummary}>
                            No supervisor has registered to this team yet. Once the daemon spawns a bypass supervisor,
                            it will appear here and in Evolution for health monitoring.
                        </Text>
                    </View>
                ) : (
                    systemRoster.map((entry) => {
                        const roleId = entry.member.roleId || entry.session?.metadata?.role || 'system-agent';
                        const displayName = entry.member.displayName || entry.session?.metadata?.name || roleId;
                        const executionPlane = entry.member.executionPlane || entry.session?.metadata?.executionPlane || 'bypass';
                        const runtime = entry.member.runtimeType || entry.session?.metadata?.flavor || 'claude';

                        return (
                            <View key={entry.member.sessionId} style={styles.roleCard}>
                                <Text style={styles.roleTitle}>{displayName}</Text>
                                <Text style={styles.roleSummary}>
                                    {roleId} · {executionPlane} · {runtime}
                                </Text>
                            </View>
                        );
                    })
                )}

                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Agreements</Text>
                <View style={styles.roleCard}>
                    <Text style={styles.roleTitle}>Status Updates</Text>
                    <Text style={styles.roleSummary}>{agreements.statusUpdates}</Text>
                </View>
                <View style={styles.roleCard}>
                    <Text style={styles.roleTitle}>Handoffs</Text>
                    <Text style={styles.roleSummary}>{agreements.handoffs}</Text>
                </View>
                <View style={styles.roleCard}>
                    <Text style={styles.roleTitle}>Escalation</Text>
                    <Text style={styles.roleSummary}>{agreements.escalation}</Text>
                </View>
                <View style={styles.roleCard}>
                    <Text style={styles.roleTitle}>Definition of Done</Text>
                    <Text style={styles.roleSummary}>{agreements.definitionOfDone}</Text>
                </View>
            </View>
        </ScrollView>
    );
}
