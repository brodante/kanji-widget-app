module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-gesture-handler|react-native-safe-area-context|react-native-screens|react-native-vector-icons|react-native-reanimated|@shopify|@gorhom|@react-native-firebase)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^react-native-reanimated$':        '<rootDir>/src/__mocks__/react-native-reanimated.js',
    '^react-native-sound$':             '<rootDir>/src/__mocks__/react-native-sound.js',
    '^react-native-tts$':               '<rootDir>/src/__mocks__/react-native-tts.js',
    '^@shopify/react-native-skia$':     '<rootDir>/src/__mocks__/react-native-skia.js',
    '^@gorhom/bottom-sheet$':           '<rootDir>/src/__mocks__/bottom-sheet.js',
    '^@react-native-firebase/auth$':    '<rootDir>/src/__mocks__/firebase-auth.js',
    '^@react-native-firebase/firestore$': '<rootDir>/src/__mocks__/firebase-firestore.js',
    '^@react-native-firebase/app$':     '<rootDir>/src/__mocks__/firebase-app.js',
  },
  testMatch: ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
};
