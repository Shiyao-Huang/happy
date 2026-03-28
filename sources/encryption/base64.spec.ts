import { describe, expect, it } from 'vitest';

if (typeof globalThis.atob !== 'function') {
    globalThis.atob = ((input: string) => Buffer.from(input, 'base64').toString('binary')) as typeof atob;
}

if (typeof globalThis.btoa !== 'function') {
    globalThis.btoa = ((input: string) => Buffer.from(input, 'binary').toString('base64')) as typeof btoa;
}

import { decodeBase64, encodeBase64 } from './base64';

describe('base64 web implementation', () => {
    it('round-trips empty buffers in standard base64', () => {
        const input = new Uint8Array([]);

        expect(encodeBase64(input)).toBe('');
        expect(decodeBase64('')).toEqual(input);
    });

    it('round-trips unicode text in standard base64', () => {
        const text = 'Hello, 世界! 🌍';
        const input = new TextEncoder().encode(text);

        const encoded = encodeBase64(input);
        const decoded = decodeBase64(encoded);

        expect(new TextDecoder().decode(decoded)).toBe(text);
    });

    it('encodes and decodes url-safe base64 without padding', () => {
        const input = new Uint8Array([252, 253, 254, 255]);

        const encoded = encodeBase64(input, 'base64url');

        expect(encoded).toBe('_P3-_w');
        expect(decodeBase64(encoded, 'base64url')).toEqual(input);
    });

    it('restores missing padding when decoding base64url', () => {
        expect(decodeBase64('SGVsbG8', 'base64url')).toEqual(
            new TextEncoder().encode('Hello'),
        );
    });

    it('encodes large buffers without overflowing the call stack', () => {
        const input = new Uint8Array(300_000);
        for (let i = 0; i < input.length; i += 1) {
            input[i] = i % 251;
        }

        const encoded = encodeBase64(input);
        const decoded = decodeBase64(encoded);

        expect(decoded).toEqual(input);
    });
});
