// Stub for rn-encryption — native module, cannot run in Node.js test env
export const generateAESKey = async (_input: number): Promise<string> => '';
export const encryptAES = async (_data: string, _key: string): Promise<string> => '';
export const decryptAES = async (_data: string, _key: string): Promise<string> => '';
export const encryptAsyncAES = async (_data: string, _key: string): Promise<string> => '';
export const decryptAsyncAES = async (_data: string, _key: string): Promise<string | null> => null;
export const encryptRSA = async (_data: string, _key: string): Promise<string> => '';
export const decryptRSA = async (_data: string, _key: string): Promise<string> => '';
export const generateRSAKeyPair = async (): Promise<{ publicKey: string; privateKey: string }> => ({ publicKey: '', privateKey: '' });
export const hashSHA256 = async (_input: string): Promise<string> => '';
export const hashSHA512 = async (_input: string): Promise<string> => '';
export const hmacSHA256 = async (_data: string, _key: string): Promise<string> => '';
export const hmacSHA512 = async (_data: string, _key: string): Promise<string> => '';
export const base64Encode = (_input: string): string => '';
export const base64Decode = (_input: string): string => '';
export const generateRandomString = (_input: number): string => '';
