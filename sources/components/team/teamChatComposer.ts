export type TeamChatComposerKeyAction =
    | 'none'
    | 'mention-up'
    | 'mention-down'
    | 'mention-select'
    | 'send';

export function resolveTeamChatComposerKeyAction(args: {
    key?: string;
    shiftKey?: boolean;
    mentionSuggestionsCount: number;
    mentionSelectedIndex: number;
    hasSendableContent: boolean;
    isWeb: boolean;
}): TeamChatComposerKeyAction {
    const {
        key,
        shiftKey = false,
        mentionSuggestionsCount,
        mentionSelectedIndex,
        hasSendableContent,
        isWeb,
    } = args;

    if (!key || !isWeb) {
        return 'none';
    }

    if (mentionSuggestionsCount > 0) {
        if (key === 'ArrowUp') {
            return 'mention-up';
        }
        if (key === 'ArrowDown') {
            return 'mention-down';
        }
        if (key === 'Enter' && mentionSelectedIndex >= 0) {
            return 'mention-select';
        }
    }

    if (key === 'Enter' && !shiftKey && hasSendableContent) {
        return 'send';
    }

    return 'none';
}
