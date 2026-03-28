import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/encryption/libsodium.lib', () => ({
    default: {
        crypto_hash: (data: Uint8Array) => new Uint8Array(
            createHash('sha512').update(Buffer.from(data)).digest()
        ),
    },
}));

import { deriveKey, deriveSecretKeyTreeChild, deriveSecretKeyTreeRoot } from './deriveKey';
import { encodeHex } from './hex';
import { encodeUTF8 } from './text';

describe('deriveKey', () => {
    const testVectors = [
        {
            seed: encodeUTF8('test seed'),
            usage: 'test usage',
            path: ['child1', 'child2'],
            expectedRootKey: 'E6E55652456F9FE47D6FF46CA3614E85B499F77E7B340FBBB1553307CEDC1E74',
            expectedRootChainCode: '81ECFD529E8EF95DD5C06CFE169158CF02B7C09A33746C527B4BD4D740B9CC5A',
            expectedChildKey: 'D5EAE039FB9143E9433BB1ADC104C2FF5D7FA6751E680B4B1CBC7ADF1AF65BF3',
            expectedChildChainCode: '8AA339189BAB38B51DD8770B1498682BCB03E42240E273041ACC7E3DF62FE868',
            expectedFinalKey: '1011C097D2105D27362B987A631496BBF68B836124D1D072E9D1613C6028CF75',
            expectedFinalChainCode: 'BE98EF894B1C62B8253B480DD415B6EB707028362F2FCECF2CB3871DB8B007F1',
        },
    ];

    it('derives the expected root key and chain code', async () => {
        for (const vector of testVectors) {
            const result = await deriveSecretKeyTreeRoot(vector.seed, vector.usage);
            expect(encodeHex(result.key)).toBe(vector.expectedRootKey);
            expect(encodeHex(result.chainCode)).toBe(vector.expectedRootChainCode);
        }
    });

    it('derives the expected child keys along the path', async () => {
        for (const vector of testVectors) {
            const rootState = await deriveSecretKeyTreeRoot(vector.seed, vector.usage);
            const childState = await deriveSecretKeyTreeChild(rootState.chainCode, vector.path[0]);
            const finalState = await deriveSecretKeyTreeChild(childState.chainCode, vector.path[1]);

            expect(encodeHex(childState.key)).toBe(vector.expectedChildKey);
            expect(encodeHex(childState.chainCode)).toBe(vector.expectedChildChainCode);
            expect(encodeHex(finalState.key)).toBe(vector.expectedFinalKey);
            expect(encodeHex(finalState.chainCode)).toBe(vector.expectedFinalChainCode);
        }
    });

    it('derives the expected final key for the full path', async () => {
        for (const vector of testVectors) {
            const result = await deriveKey(vector.seed, vector.usage, vector.path);
            expect(encodeHex(result)).toBe(vector.expectedFinalKey);
        }
    });

    it('is deterministic for identical seed, usage, and path', async () => {
        const vector = testVectors[0];

        const first = await deriveKey(vector.seed, vector.usage, vector.path);
        const second = await deriveKey(vector.seed, vector.usage, vector.path);

        expect(encodeHex(first)).toBe(encodeHex(second));
    });

    it('changes output when the path changes', async () => {
        const vector = testVectors[0];

        const base = await deriveKey(vector.seed, vector.usage, vector.path);
        const changed = await deriveKey(vector.seed, vector.usage, [...vector.path, 'additional']);

        expect(encodeHex(base)).not.toBe(encodeHex(changed));
    });

    it('changes output when the usage changes', async () => {
        const vector = testVectors[0];

        const base = await deriveKey(vector.seed, vector.usage, vector.path);
        const changed = await deriveKey(vector.seed, `${vector.usage}-different`, vector.path);

        expect(encodeHex(base)).not.toBe(encodeHex(changed));
    });

    it('returns the root key when the derivation path is empty', async () => {
        const seed = encodeUTF8('root only');
        const usage = 'content';

        const root = await deriveSecretKeyTreeRoot(seed, usage);
        const derived = await deriveKey(seed, usage, []);

        expect(derived).toEqual(root.key);
        expect(derived).toHaveLength(32);
    });
});
