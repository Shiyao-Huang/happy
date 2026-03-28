import { beforeEach, describe, expect, it, vi } from 'vitest';

const aesMockState = vi.hoisted(() => ({
    counter: 0,
}));

vi.mock('rn-encryption', () => ({
    encryptAsyncAES: vi.fn(async (data: string, key64: string) => {
        aesMockState.counter += 1;
        return Buffer.from(JSON.stringify({
            key64,
            data,
            nonce: aesMockState.counter,
        }), 'utf8').toString('base64');
    }),
    decryptAsyncAES: vi.fn(async (ciphertext: string, key64: string) => {
        try {
            const payload = JSON.parse(Buffer.from(ciphertext, 'base64').toString('utf8')) as {
                key64: string;
                data: string;
            };

            return payload.key64 === key64 ? payload.data : null;
        } catch {
            return null;
        }
    }),
}));

import {
    decryptAESGCM,
    decryptAESGCMString,
    encryptAESGCM,
    encryptAESGCMString,
} from './aes';

function createKey(offset = 0): string {
    const bytes = new Uint8Array(32);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = (offset + index) & 0xff;
    }
    return Buffer.from(bytes).toString('base64');
}

describe('aes', () => {
    beforeEach(() => {
        aesMockState.counter = 0;
    });

    it('round-trips encrypted strings', async () => {
        const key = createKey();
        const plaintext = JSON.stringify('Hello, World!');

        const encrypted = await encryptAESGCMString(plaintext, key);
        const decrypted = await decryptAESGCMString(encrypted, key);

        expect(typeof encrypted).toBe('string');
        expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertext for the same plaintext because IV/nonce should vary', async () => {
        const key = createKey();
        const plaintext = 'same input';

        const first = await encryptAESGCMString(plaintext, key);
        const second = await encryptAESGCMString(plaintext, key);

        expect(first).not.toBe(second);
    });

    it('returns null when decrypting with the wrong key', async () => {
        const encrypted = await encryptAESGCMString('top secret', createKey(1));

        await expect(decryptAESGCMString(encrypted, createKey(2))).resolves.toBeNull();
    });

    it('preserves empty strings instead of coercing them to null', async () => {
        const key = createKey();

        const encrypted = await encryptAESGCMString('', key);

        await expect(decryptAESGCMString(encrypted, key)).resolves.toBe('');
    });

    it('preserves leading and trailing whitespace in decrypted strings', async () => {
        const key = createKey();
        const plaintext = '  keep surrounding whitespace  \n';

        const encrypted = await encryptAESGCMString(plaintext, key);

        await expect(decryptAESGCMString(encrypted, key)).resolves.toBe(plaintext);
    });

    it('round-trips arbitrary binary payloads', async () => {
        const key = createKey();
        const plaintext = new Uint8Array([0xff, 0x00, 0xfe, 0x61, 0x62, 0x80]);

        const encrypted = await encryptAESGCM(plaintext, key);
        const decrypted = await decryptAESGCM(encrypted, key);

        expect(decrypted).toEqual(plaintext);
    });

    it('returns null for binary payloads decrypted with the wrong key', async () => {
        const encrypted = await encryptAESGCM(new Uint8Array([1, 2, 3, 4]), createKey(3));

        await expect(decryptAESGCM(encrypted, createKey(4))).resolves.toBeNull();
    });

    it('round-trips empty byte arrays', async () => {
        const key = createKey();

        const encrypted = await encryptAESGCM(new Uint8Array([]), key);
        const decrypted = await decryptAESGCM(encrypted, key);

        expect(decrypted).toEqual(new Uint8Array([]));
    });
});
