import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { HappyError } from '@/utils/errors';

const mockModal = vi.hoisted(() => ({
    alert: vi.fn(),
}));

vi.mock('@/modal', () => ({
    Modal: mockModal,
}));

import { useHappyAction } from './useHappyAction';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderHook<Result>(hook: () => Result) {
    const result: { current: Result } = { current: undefined as unknown as Result };
    let renderer: ReturnType<typeof create>;

    function Wrapper() {
        result.current = hook();
        return null;
    }

    act(() => {
        renderer = create(React.createElement(Wrapper));
    });

    return {
        result,
        unmount: () => {
            act(() => {
                renderer.unmount();
            });
        },
    };
}

describe('useHappyAction', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        mockModal.alert.mockReset();
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: any) => {
            if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) {
                return;
            }
        });
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('should return loading=false initially', () => {
        const action = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useHappyAction(action));
        const [loading] = result.current;
        expect(loading).toBe(false);
    });

    it('should set loading=true during action execution', async () => {
        let resolveAction!: () => void;
        const action = vi.fn().mockReturnValue(
            new Promise<void>(resolve => { resolveAction = resolve; })
        );
        const { result } = renderHook(() => useHappyAction(action));

        act(() => {
            result.current[1](); // doAction
        });

        expect(result.current[0]).toBe(true);

        // Cleanup: let the action complete
        await act(async () => {
            resolveAction();
        });
    });

    it('should reset loading=false after action completes', async () => {
        const action = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHook(() => useHappyAction(action));

        act(() => {
            result.current[1](); // doAction — setLoading(true) is called synchronously
        });

        expect(result.current[0]).toBe(true);

        // Flush the async IIFE to completion (action() resolves immediately)
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current[0]).toBe(false);
    });

    it('should prevent concurrent executions', async () => {
        let resolveAction!: () => void;
        const action = vi.fn().mockReturnValue(
            new Promise<void>(resolve => { resolveAction = resolve; })
        );
        const { result } = renderHook(() => useHappyAction(action));

        act(() => { result.current[1](); }); // first call — starts loading
        act(() => { result.current[1](); }); // second call — should be ignored

        expect(action).toHaveBeenCalledTimes(1);

        // Cleanup
        await act(async () => {
            resolveAction();
        });
    });

    it('should show Modal.alert with HappyError message on HappyError', async () => {
        const error = new HappyError('something went wrong', false);
        const action = vi.fn().mockRejectedValue(error);
        const { result } = renderHook(() => useHappyAction(action));

        act(() => { result.current[1](); });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mockModal.alert).toHaveBeenCalledWith(
            'Error',
            'something went wrong',
            [{ text: 'OK', style: 'cancel' }]
        );
        expect(result.current[0]).toBe(false);
    });

    it('should show Modal.alert with "Unknown error" for non-HappyError', async () => {
        const action = vi.fn().mockRejectedValue(new Error('unexpected failure'));
        const { result } = renderHook(() => useHappyAction(action));

        act(() => { result.current[1](); });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mockModal.alert).toHaveBeenCalledWith(
            'Error',
            'Unknown error',
            [{ text: 'OK', style: 'cancel' }]
        );
        expect(result.current[0]).toBe(false);
    });

    it('should reset loading=false after an error', async () => {
        const action = vi.fn().mockRejectedValue(new Error('fail'));
        const { result } = renderHook(() => useHappyAction(action));

        act(() => { result.current[1](); });

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current[0]).toBe(false);
    });

    it('should allow another execution after the first completes', async () => {
        let callCount = 0;
        const action = vi.fn().mockImplementation(async () => { callCount++; });
        const { result } = renderHook(() => useHappyAction(action));

        // First execution
        act(() => { result.current[1](); });
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(result.current[0]).toBe(false);

        // Second execution should be allowed
        act(() => { result.current[1](); });
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(action).toHaveBeenCalledTimes(2);
        expect(callCount).toBe(2);
    });
});
