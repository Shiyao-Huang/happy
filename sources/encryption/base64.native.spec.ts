import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeBase64State = vi.hoisted(() => ({
    fromByteArray: vi.fn((buffer: Uint8Array, urlSafe: boolean) => (
        urlSafe ? `url:${buffer.length}` : `std:${buffer.length}`
    )),
    toByteArray: vi.fn((input: string, urlSafe: boolean) => new Uint8Array([
        input.length,
        urlSafe ? 1 : 0,
    ])),
}));

vi.mock('react-native-quick-base64', () => ({
    fromByteArray: nativeBase64State.fromByteArray,
    toByteArray: nativeBase64State.toByteArray,
}));

import { decodeBase64, encodeBase64 } from './base64.native';

describe('base64 native implementation', () => {
    beforeEach(() => {
        nativeBase64State.fromByteArray.mockClear();
        nativeBase64State.toByteArray.mockClear();
    });

    it('delegates standard encoding to react-native-quick-base64', () => {
        const input = new Uint8Array([1, 2, 3]);

        expect(encodeBase64(input, 'base64')).toBe('std:3');
        expect(nativeBase64State.fromByteArray).toHaveBeenCalledWith(input, false);
    });

    it('delegates base64url encoding to react-native-quick-base64 with the url-safe flag', () => {
        const input = new Uint8Array([1, 2, 3]);

        expect(encodeBase64(input, 'base64url')).toBe('url:3');
        expect(nativeBase64State.fromByteArray).toHaveBeenCalledWith(input, true);
    });

    it('decodes standard base64 through the native helper', () => {
        expect(decodeBase64('abcd', 'base64')).toEqual(new Uint8Array([4, 1]));
        expect(nativeBase64State.toByteArray).toHaveBeenCalledTimes(1);
    });

    it('decodes base64url through the native helper', () => {
        expect(decodeBase64('abc', 'base64url')).toEqual(new Uint8Array([3, 1]));
        expect(nativeBase64State.toByteArray).toHaveBeenCalledWith('abc', true);
    });
});
