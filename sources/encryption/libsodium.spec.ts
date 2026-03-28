import { beforeEach, describe, expect, it, vi } from 'vitest';

const libsodiumState = vi.hoisted(() => ({
    nonceSeed: 0,
}));

vi.mock('expo-crypto', () => ({
    getRandomBytes: (length: number) => {
        libsodiumState.nonceSeed += 1;
        return new Uint8Array(
            Array.from({ length }, (_value, index) => (libsodiumState.nonceSeed + index) & 0xff)
        );
    },
}));

vi.mock('@/encryption/libsodium.lib', () => ({
    default: {
        crypto_box_PUBLICKEYBYTES: 4,
        crypto_box_NONCEBYTES: 3,
        crypto_secretbox_NONCEBYTES: 2,
        crypto_box_seed_keypair: (secretKey: Uint8Array) => ({
            publicKey: new Uint8Array(Array.from(secretKey.slice(0, 4), (value) => (value + 1) & 0xff)),
        }),
        crypto_box_keypair: () => ({
            publicKey: new Uint8Array([11, 12, 13, 14]),
            privateKey: new Uint8Array([21, 22, 23, 24]),
        }),
        crypto_box_easy: (
            data: Uint8Array,
            nonce: Uint8Array,
            recipientPublicKey: Uint8Array,
        ) => {
            const encrypted = new Uint8Array(data.length + 1);
            encrypted[0] = recipientPublicKey[0] ?? 0;

            for (let index = 0; index < data.length; index += 1) {
                encrypted[index + 1] = data[index]! ^ nonce[index % nonce.length]! ^ recipientPublicKey[0]!;
            }

            return encrypted;
        },
        crypto_box_open_easy: (
            encrypted: Uint8Array,
            nonce: Uint8Array,
            _ephemeralPublicKey: Uint8Array,
            recipientSecretKey: Uint8Array,
        ) => {
            const expectedMarker = ((recipientSecretKey[0] ?? 0) + 1) & 0xff;
            if (encrypted[0] !== expectedMarker) {
                throw new Error('wrong key');
            }

            const decrypted = new Uint8Array(encrypted.length - 1);
            for (let index = 1; index < encrypted.length; index += 1) {
                decrypted[index - 1] = encrypted[index]! ^ nonce[(index - 1) % nonce.length]! ^ expectedMarker;
            }

            return decrypted;
        },
        crypto_secretbox_easy: (data: Uint8Array, nonce: Uint8Array, secret: Uint8Array) => {
            const encrypted = new Uint8Array(data.length + 1);
            encrypted[0] = secret[0] ?? 0;

            for (let index = 0; index < data.length; index += 1) {
                encrypted[index + 1] = data[index]! ^ nonce[index % nonce.length]! ^ secret[0]!;
            }

            return encrypted;
        },
        crypto_secretbox_open_easy: (encrypted: Uint8Array, nonce: Uint8Array, secret: Uint8Array) => {
            const marker = secret[0] ?? 0;
            if (encrypted[0] !== marker) {
                throw new Error('wrong key');
            }

            const decrypted = new Uint8Array(encrypted.length - 1);
            for (let index = 1; index < encrypted.length; index += 1) {
                decrypted[index - 1] = encrypted[index]! ^ nonce[(index - 1) % nonce.length]! ^ marker;
            }

            return decrypted;
        },
    },
}));

import {
    decryptBox,
    decryptSecretBox,
    encryptBox,
    encryptSecretBox,
    getPublicKeyForBox,
} from './libsodium';

describe('libsodium wrappers', () => {
    beforeEach(() => {
        libsodiumState.nonceSeed = 0;
    });

    it('derives a public key for box encryption from a seed secret key', () => {
        expect(getPublicKeyForBox(new Uint8Array([1, 2, 3, 4]))).toEqual(
            new Uint8Array([2, 3, 4, 5]),
        );
    });

    it('bundles ephemeral public key, nonce, and ciphertext for box encryption', () => {
        const recipientSecret = new Uint8Array([1, 2, 3, 4]);
        const recipientPublic = getPublicKeyForBox(recipientSecret);
        const plaintext = new Uint8Array([9, 8, 7]);

        const encrypted = encryptBox(plaintext, recipientPublic);

        expect(encrypted.slice(0, 4)).toEqual(new Uint8Array([11, 12, 13, 14]));
        expect(encrypted.slice(4, 7)).toEqual(new Uint8Array([1, 2, 3]));
        expect(decryptBox(encrypted, recipientSecret)).toEqual(plaintext);
    });

    it('produces different box bundles for the same plaintext because nonce changes', () => {
        const recipientPublic = getPublicKeyForBox(new Uint8Array([1, 2, 3, 4]));
        const plaintext = new Uint8Array([1, 2, 3]);

        const first = encryptBox(plaintext, recipientPublic);
        const second = encryptBox(plaintext, recipientPublic);

        expect(first).not.toEqual(second);
    });

    it('returns null when box decryption receives the wrong secret key', () => {
        const encrypted = encryptBox(
            new Uint8Array([5, 6, 7]),
            getPublicKeyForBox(new Uint8Array([1, 2, 3, 4])),
        );

        expect(decryptBox(encrypted, new Uint8Array([9, 9, 9, 9]))).toBeNull();
    });

    it('round-trips JSON payloads through secretbox helpers', () => {
        const secret = new Uint8Array([7, 8, 9, 10]);
        const payload = {
            message: 'hello',
            count: 3,
            nested: { ok: true },
        };

        const encrypted = encryptSecretBox(payload, secret);

        expect(encrypted.slice(0, 2)).toEqual(new Uint8Array([1, 2]));
        expect(decryptSecretBox(encrypted, secret)).toEqual(payload);
    });

    it('returns null when secretbox decryption uses the wrong secret', () => {
        const encrypted = encryptSecretBox({ ok: true }, new Uint8Array([7, 8, 9, 10]));

        expect(decryptSecretBox(encrypted, new Uint8Array([1, 2, 3, 4]))).toBeNull();
    });
});
