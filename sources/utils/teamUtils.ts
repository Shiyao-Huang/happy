import Color from 'color';
import type { TeamMessage } from '@/sync/teamMessageTypes';
import type { HumanStatusLock } from '@/sync/kanbanTypes';

export const withAlpha = (color: string, alpha: number): string => {
    try {
        return Color(color).alpha(alpha).rgb().string();
    } catch {
        return color;
    }
};

export const STANDARD_SHELL_TABS = [
    { id: 'chat', label: 'Chat' },
    { id: 'board', label: 'Board' },
    { id: 'info', label: 'Info' },
    { id: 'evolution', label: 'Evolution' },
] as const;

export const SHELL_ROLE_COLORS: Record<string, string> = {
    master: '#007AFF',
    orchestrator: '#007AFF',
    builder: '#FF9500',
    implementer: '#FF9500',
    qa: '#5856D6',
    'qa-engineer': '#5856D6',
    framer: '#34C759',
    architect: '#34C759',
    reviewer: '#8A7F74',
    observer: '#8A7F74',
    // Extended roles
    researcher: '#AF52DE',
    supervisor: '#FF2D55',
    'help-agent': '#FF6B6B',
    'org-manager': '#5AC8FA',
    'agent-builder': '#FFD60A',
    'content-strategist': '#30D158',
    'data-analyst': '#64D2FF',
    'seo-specialist': '#FF9F0A',
};

export const SHELL_CONVERSATION_COLORS = ['#7AA585', '#8F99C1', '#E8845A', '#B89A6F', '#6886A3'];

export function getRoleAccent(roleId?: string): string {
    if (!roleId) {
        return '#8A7F74';
    }

    return SHELL_ROLE_COLORS[roleId.toLowerCase()] ?? '#8A7F74';
}

export function formatShellTime(timestamp: number): string {
    const now = new Date();
    const value = new Date(timestamp);

    if (now.toDateString() === value.toDateString()) {
        return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return value.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

export function getMessagePreview(message: TeamMessage): string {
    const source = (message.shortContent || message.content || '').replace(/\s+/g, ' ').trim();
    if (!source) {
        return 'No recent message';
    }
    return source.length > 42 ? `${source.slice(0, 42)}...` : source;
}

export function splitPromptLines(text: string): string[] {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

export type TeamScorecard = {
    averageRating?: number;
    reviewCount?: number;
    cumulativeCode?: number;
    cumulativeQuality?: number;
    sourceScoreTotals?: {
        user?: number;
        master?: number;
        system?: number;
    };
    lastReviewedAt?: string | number | null;
};

export type TeamPublicReview = {
    id?: string;
    rating?: number;
    codeScore?: number;
    qualityScore?: number;
    source?: string;
    roleIds?: string[];
    comment?: string;
    createdAt?: string | number;
};

export function formatReviewDate(value?: string | number): string {
    if (value == null) return '';
    try {
        return new Date(value).toLocaleDateString();
    } catch {
        return '';
    }
}

export function getHumanStatusLockLabel(lock?: HumanStatusLock | null): string | null {
    if (!lock) return null;
    const lockedBy = lock.lockedByDisplayName || lock.lockedBySessionId || 'Human';
    if (lock.mode === 'manual-status') {
        return `${lockedBy} manually locked status`;
    }
    if (lock.mode === 'editing') {
        return `${lockedBy} is editing`;
    }
    return `${lockedBy} is viewing`;
}
