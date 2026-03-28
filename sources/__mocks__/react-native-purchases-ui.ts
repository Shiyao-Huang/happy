// Stub for react-native-purchases-ui — native RevenueCat UI, cannot run in Node.js
export const PAYWALL_RESULT = { NOT_PRESENTED: 'NOT_PRESENTED', ERROR: 'ERROR', CANCELLED: 'CANCELLED', PURCHASED: 'PURCHASED', RESTORED: 'RESTORED' };
export const presentPaywallIfNeeded = async (_params?: any) => PAYWALL_RESULT.CANCELLED;
export const presentPaywall = async (_params?: any) => PAYWALL_RESULT.CANCELLED;
const RevenueCatUI = {
    presentPaywall,
    presentPaywallIfNeeded,
    PAYWALL_RESULT,
};
export default RevenueCatUI;
