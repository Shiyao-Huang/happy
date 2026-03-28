import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
    // Define React Native / Expo globals used in source files
    define: {
        __DEV__: JSON.stringify(false),
    },
    test: {
        globals: false,
        environment: 'node',
        include: ['sources/**/*.{spec,test}.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/**',
                'dist/**',
                '**/*.d.ts',
                '**/*.config.*',
                '**/mockData/**',
            ],
        },
    },
    resolve: {
        alias: {
            '@': resolve('./sources'),
            // Prevent Vite/Rollup from parsing react-native's index.js which contains
            // Flow `import typeof` syntax that esbuild/Rollup cannot handle.
            // Tests that need richer mocks override this with vi.mock('react-native', factory).
            'react-native': resolve('./sources/__mocks__/react-native.ts'),
            // Stub expo-updates to avoid expo-modules-core native runtime issues
            'expo-updates': resolve('./sources/__mocks__/expo-updates.ts'),
            // expo-modules-core is the root native dependency for all expo packages
            'expo-modules-core': resolve('./sources/__mocks__/expo-modules-core.ts'),
            // rn-encryption uses react-native TurboModules — cannot run in Node.js
            'rn-encryption': resolve('./sources/__mocks__/rn-encryption.ts'),
            // expo-notifications uses expo source which chains into unresolvable native deps
            'expo-notifications': resolve('./sources/__mocks__/expo-notifications.ts'),
            // react-native-mmkv uses react-native TurboModules — resolves to TS source
            'react-native-mmkv': resolve('./sources/__mocks__/react-native-mmkv.ts'),
            // @expo/vector-icons resolves to TS source with broken build path references
            '@expo/vector-icons': resolve('./sources/__mocks__/expo-vector-icons.ts'),
            '@expo/vector-icons/Ionicons': resolve('./sources/__mocks__/expo-vector-icons.ts'),
            // react-native-device-info resolves to TS source via module field
            'react-native-device-info': resolve('./sources/__mocks__/react-native-device-info.ts'),
            // react-native-purchases / UI — native RevenueCat SDK
            'react-native-purchases': resolve('./sources/__mocks__/react-native-purchases.ts'),
            'react-native-purchases-ui': resolve('./sources/__mocks__/react-native-purchases-ui.ts'),
            // posthog-react-native analytics SDK
            'posthog-react-native': resolve('./sources/__mocks__/posthog-react-native.ts'),
        },
    },
})