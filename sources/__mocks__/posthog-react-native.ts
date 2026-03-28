// Stub for posthog-react-native — native analytics, cannot run in Node.js test env
class PostHog {
    constructor(_apiKey: string, _options?: any) {}
    capture(_event: string, _properties?: Record<string, any>) {}
    identify(_distinctId: string, _properties?: Record<string, any>) {}
    alias(_alias: string) {}
    screen(_name: string, _properties?: Record<string, any>) {}
    reset() {}
    flush() {}
    optIn() {}
    optOut() {}
    isOptOut(): boolean { return false; }
    register(_properties: Record<string, any>) {}
    unregister(_key: string) {}
    reloadFeatureFlags() {}
    getFeatureFlag(_key: string): boolean | string | undefined { return undefined; }
    isFeatureEnabled(_key: string): boolean { return false; }
    onFeatureFlags(_callback: () => void): () => void { return () => {}; }
    getDistinctId(): string { return ''; }
    getSessionId(): string { return ''; }
    shutdown() {}
}
export default PostHog;
