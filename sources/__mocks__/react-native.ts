/**
 * Minimal react-native stub for vitest (node environment).
 *
 * This file is used via resolve.alias in vitest.config.ts to prevent Vite/Rollup
 * from trying to parse react-native's index.js which contains Flow `import typeof`
 * syntax that esbuild/Rollup cannot handle.
 *
 * Tests that need richer mocks (e.g. TaskDetailModal.spec.ts) override this with
 * vi.mock('react-native', factory) which takes precedence at the module registry level.
 */

export const Platform = {
    OS: 'ios' as const,
    select: (obj: Record<string, unknown>) => obj['ios'] ?? obj['default'],
};

export const StyleSheet = {
    create: (styles: Record<string, unknown>) => styles,
    flatten: (style: unknown) => style,
    hairlineWidth: 1,
};

const noop = () => null;
const passthrough = ({ children }: { children?: unknown }) => children ?? null;

export const View = passthrough;
export const Text = passthrough;
export const ScrollView = passthrough;
export const KeyboardAvoidingView = passthrough;
export const SafeAreaView = passthrough;
export const TouchableOpacity = passthrough;
export const TouchableHighlight = passthrough;
export const FlatList = noop;
export const Modal = noop;
export const Pressable = passthrough;
export const TextInput = noop;
export const ActivityIndicator = noop;
export const Image = noop;
export const ImageBackground = noop;

export const Alert = {
    alert: noop,
};

export const Dimensions = {
    get: () => ({ width: 375, height: 812 }),
    addEventListener: noop,
    removeEventListener: noop,
};

export const NativeModules = {};
export const PixelRatio = { get: () => 2, roundToNearestPixel: (n: number) => n };
export const Animated = {
    Value: class { constructor(_v: number) {} },
    View: passthrough,
    timing: noop,
    spring: noop,
    parallel: noop,
    sequence: noop,
};

export const Keyboard = {
    dismiss: noop,
    addListener: noop,
    removeAllListeners: noop,
};

export const Linking = {
    openURL: noop,
    canOpenURL: async () => false,
};

export const Appearance = {
    getColorScheme: () => 'dark' as const,
    addChangeListener: noop,
};

export const AppState = {
    currentState: 'active' as const,
    addEventListener: (_type: string, _handler: (state: string) => void) => ({ remove: noop }),
    removeEventListener: noop,
};

export const useColorScheme = () => 'dark';
export const useWindowDimensions = () => ({ width: 375, height: 812 });

export default {
    Platform,
    StyleSheet,
    View,
    Text,
    ScrollView,
    KeyboardAvoidingView,
    SafeAreaView,
    TouchableOpacity,
    TouchableHighlight,
    FlatList,
    Modal,
    Pressable,
    TextInput,
    ActivityIndicator,
    Image,
    ImageBackground,
    Alert,
    Dimensions,
    NativeModules,
    PixelRatio,
    Animated,
    Keyboard,
    Linking,
    Appearance,
    AppState,
    useColorScheme,
    useWindowDimensions,
};
