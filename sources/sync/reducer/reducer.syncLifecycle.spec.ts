import { describe, expect, it } from 'vitest';
import { createReducer, reducer } from './reducer';
import type { NormalizedMessage } from '../typesRaw';

const TODO_SEED = [
    { content: 'Reconnect socket', status: 'pending' as const, priority: 'high' as const, id: 'todo-1' },
];

const TODO_RESULT = [
    { content: 'Refresh roster', status: 'completed' as const, priority: 'medium' as const, id: 'todo-2' },
];

function makeAgentTextMessage(
    id: string,
    createdAt: number,
    text: string,
    usage?: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        service_tier?: string | null;
    }
): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt,
        role: 'agent',
        isSidechain: false,
        usage,
        content: [
            {
                type: 'text',
                text,
                uuid: `${id}-uuid`,
                parentUUID: null,
            },
        ],
    };
}

describe('reducer sync lifecycle regressions', () => {
    it('should surface ready events without creating a visible message', () => {
        const state = createReducer();

        const result = reducer(state, [
            {
                id: 'ready-1',
                localId: null,
                createdAt: 1000,
                role: 'event',
                content: { type: 'ready' },
                isSidechain: false,
            },
        ]);

        expect(result.messages).toHaveLength(0);
        expect(result.hasReadyEvent).toBe(true);
        expect(state.messageIds.get('ready-1')).toBe('ready-1');
    });

    it('should reset todos and usage on context reset while keeping the reset event visible', () => {
        const state = createReducer();
        state.latestTodos = { todos: TODO_SEED, timestamp: 500 };
        state.latestUsage = {
            inputTokens: 11,
            outputTokens: 7,
            cacheCreation: 5,
            cacheRead: 3,
            contextSize: 19,
            timestamp: 500,
        };

        const result = reducer(state, [
            {
                id: 'evt-reset',
                localId: null,
                createdAt: 1200,
                role: 'event',
                content: { type: 'message', message: 'Context was reset' },
                isSidechain: false,
            },
        ]);

        expect(result.todos).toEqual([]);
        expect(result.usage).toEqual({
            inputTokens: 0,
            outputTokens: 0,
            cacheCreation: 0,
            cacheRead: 0,
            contextSize: 0,
        });
        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            kind: 'agent-event',
            event: { type: 'message', message: 'Context was reset' },
        });
    });

    it('should keep todos but clear usage on compaction completed', () => {
        const state = createReducer();
        state.latestTodos = { todos: TODO_SEED, timestamp: 500 };
        state.latestUsage = {
            inputTokens: 9,
            outputTokens: 4,
            cacheCreation: 2,
            cacheRead: 1,
            contextSize: 12,
            timestamp: 500,
        };

        const result = reducer(state, [
            {
                id: 'evt-compact',
                localId: null,
                createdAt: 1300,
                role: 'event',
                content: { type: 'message', message: 'Compaction completed' },
                isSidechain: false,
            },
        ]);

        expect(result.todos).toEqual(TODO_SEED);
        expect(result.usage).toEqual({
            inputTokens: 0,
            outputTokens: 0,
            cacheCreation: 0,
            cacheRead: 0,
            contextSize: 0,
        });
    });

    it('should convert title change tool calls into agent events', () => {
        const state = createReducer();

        const result = reducer(state, [
            {
                id: 'title-1',
                localId: null,
                createdAt: 1400,
                role: 'agent',
                isSidechain: false,
                content: [
                    {
                        type: 'tool-call',
                        id: 'tool-title',
                        name: 'mcp__happy__change_title',
                        input: { title: 'Reconnect fixed' },
                        description: null,
                        uuid: 'title-uuid',
                        parentUUID: null,
                    },
                ],
            },
        ]);

        expect(result.messages).toHaveLength(1);
        expect(result.messages[0]).toMatchObject({
            kind: 'agent-event',
            event: { type: 'message', message: 'Title changed to "Reconnect fixed"' },
        });
    });

    it('should keep the newest usage snapshot when older usage arrives later', () => {
        const state = createReducer();

        reducer(state, [
            makeAgentTextMessage('usage-new', 2000, 'new usage', {
                input_tokens: 10,
                output_tokens: 4,
                cache_creation_input_tokens: 3,
                cache_read_input_tokens: 2,
                service_tier: null,
            }),
        ]);

        const result = reducer(state, [
            makeAgentTextMessage('usage-old', 1500, 'old usage', {
                input_tokens: 1,
                output_tokens: 1,
                cache_creation_input_tokens: 1,
                cache_read_input_tokens: 1,
                service_tier: null,
            }),
        ]);

        expect(result.usage).toEqual({
            inputTokens: 10,
            outputTokens: 4,
            cacheCreation: 3,
            cacheRead: 2,
            contextSize: 15,
        });
        expect(state.latestUsage?.timestamp).toBe(2000);
    });

    it('should update latest todos from TodoWrite results without changing the original tool timestamp', () => {
        const state = createReducer();

        const firstResult = reducer(state, [
            {
                id: 'tool-msg',
                localId: null,
                createdAt: 3000,
                role: 'agent',
                isSidechain: false,
                content: [
                    {
                        type: 'tool-call',
                        id: 'todo-tool',
                        name: 'TodoWrite',
                        input: { todos: TODO_SEED },
                        description: 'write todos',
                        uuid: 'todo-uuid',
                        parentUUID: null,
                    },
                ],
            },
        ]);

        expect(firstResult.todos).toEqual(TODO_SEED);

        const secondResult = reducer(state, [
            {
                id: 'tool-result-msg',
                localId: null,
                createdAt: 3500,
                role: 'agent',
                isSidechain: false,
                content: [
                    {
                        type: 'tool-result',
                        tool_use_id: 'todo-tool',
                        content: { newTodos: TODO_RESULT },
                        is_error: false,
                        uuid: 'todo-result-uuid',
                        parentUUID: null,
                    },
                ],
            },
        ]);

        expect(secondResult.todos).toEqual(TODO_RESULT);
        expect(secondResult.messages).toHaveLength(1);
        expect(secondResult.messages[0]).toMatchObject({
            kind: 'tool-call',
            createdAt: 3000,
        });
        if (secondResult.messages[0]?.kind === 'tool-call') {
            expect(secondResult.messages[0].tool.state).toBe('completed');
        }
    });
});
