import { describe, expect, it } from 'vitest';

import { resolveTeamChatComposerKeyAction } from './teamChatComposer';

describe('teamChatComposer', () => {
    it('sends on Enter when there is sendable content on web', () => {
        expect(resolveTeamChatComposerKeyAction({
            key: 'Enter',
            shiftKey: false,
            mentionSuggestionsCount: 0,
            mentionSelectedIndex: -1,
            hasSendableContent: true,
            isWeb: true,
        })).toBe('send');
    });

    it('does not send on Shift+Enter', () => {
        expect(resolveTeamChatComposerKeyAction({
            key: 'Enter',
            shiftKey: true,
            mentionSuggestionsCount: 0,
            mentionSelectedIndex: -1,
            hasSendableContent: true,
            isWeb: true,
        })).toBe('none');
    });

    it('prioritizes mention selection on Enter when autocomplete is active', () => {
        expect(resolveTeamChatComposerKeyAction({
            key: 'Enter',
            shiftKey: false,
            mentionSuggestionsCount: 3,
            mentionSelectedIndex: 1,
            hasSendableContent: true,
            isWeb: true,
        })).toBe('mention-select');
    });

    it('ignores Enter on non-web platforms', () => {
        expect(resolveTeamChatComposerKeyAction({
            key: 'Enter',
            shiftKey: false,
            mentionSuggestionsCount: 0,
            mentionSelectedIndex: -1,
            hasSendableContent: true,
            isWeb: false,
        })).toBe('none');
    });
});
