/**
 * Minimal expo-updates stub for vitest (node environment).
 * AuthContext.tsx uses Updates.reloadAsync() on logout.
 */
export const reloadAsync = async () => {};
export const checkForUpdateAsync = async () => ({ isAvailable: false });
export const fetchUpdateAsync = async () => ({});
export const useUpdates = () => ({ isUpdateAvailable: false, isUpdatePending: false });
