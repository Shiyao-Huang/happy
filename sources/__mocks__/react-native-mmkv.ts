// Stub for react-native-mmkv — native module, cannot run in Node.js test env
export class MMKV {
    constructor(_config?: any) {}
    set(_key: string, _value: string | number | boolean | Uint8Array) {}
    getString(_key: string): string | undefined { return undefined; }
    getNumber(_key: string): number | undefined { return undefined; }
    getBoolean(_key: string): boolean | undefined { return undefined; }
    getBuffer(_key: string): Uint8Array | undefined { return undefined; }
    delete(_key: string) {}
    contains(_key: string): boolean { return false; }
    getAllKeys(): string[] { return []; }
    clearAll() {}
    addOnValueChangedListener(_listener: (key: string) => void) { return { remove: () => {} }; }
}
export const Mode = { MULTI_PROCESS: 1, SINGLE_PROCESS: 0 };
export const useMMKV = (_config?: any) => new MMKV(_config);
export const useMMKVString = (_key: string, _mmkv?: any): [string | undefined, (v: string | undefined) => void] => [undefined, () => {}];
export const useMMKVNumber = (_key: string, _mmkv?: any): [number | undefined, (v: number | undefined) => void] => [undefined, () => {}];
export const useMMKVBoolean = (_key: string, _mmkv?: any): [boolean | undefined, (v: boolean | undefined) => void] => [undefined, () => {}];
export const useMMKVListener = (_listener: any, _mmkv?: any) => {};
