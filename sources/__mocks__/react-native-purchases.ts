// Stub for react-native-purchases — native RevenueCat SDK, cannot run in Node.js
export const LOG_LEVEL = { VERBOSE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, SILENT: 5 };
export const PAYWALL_RESULT = { NOT_PRESENTED: 'NOT_PRESENTED', ERROR: 'ERROR', CANCELLED: 'CANCELLED', PURCHASED: 'PURCHASED', RESTORED: 'RESTORED' };
export interface CustomerInfo {}
export interface PurchasesOfferings {}
export interface PurchasesStoreProduct {}
export interface PurchasesPackage {}
export default {
    configure: (_config: any) => {},
    setLogLevel: (_level: any) => {},
    logIn: async (_userId: string) => ({ customerInfo: {}, created: false }),
    logOut: async () => ({}),
    getCustomerInfo: async () => ({}),
    getOfferings: async () => ({ all: {}, current: null }),
    purchasePackage: async (_pkg: any) => ({ customerInfo: {} }),
    restorePurchases: async () => ({}),
    setAttributes: async (_attrs: any) => {},
    addCustomerInfoUpdateListener: (_listener: any) => () => {},
    removeCustomerInfoUpdateListener: (_listener: any) => {},
    isAnonymous: async () => true,
    getPurchaserInfo: async () => ({}),
};
