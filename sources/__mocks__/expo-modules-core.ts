/**
 * Minimal expo-modules-core stub for vitest (node environment).
 * Prevents native module bootstrapping from crashing in Node.js.
 */
export class EventEmitter<_T = Record<string, any>> {
    addListener(_event: string, _listener: (...args: any[]) => void) { return { remove: () => {} }; }
    removeAllListeners(_event?: string) {}
    emit(_event: string, ..._args: any[]) {}
}

export const requireNativeModule = (_name: string) => ({});
export const requireOptionalNativeModule = (_name: string) => null;
export const NativeModule = {};
export const NativeModulesProxy = {};
export const Platform = { OS: 'ios' as const };

export default {
    EventEmitter,
    requireNativeModule,
    requireOptionalNativeModule,
    NativeModule,
    NativeModulesProxy,
    Platform,
};
