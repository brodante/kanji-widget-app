// Comprehensive mock for react-native-reanimated that avoids native module initialization
const React = require('react');
const RN    = require('react-native');

const noopSharedValue = (init) => ({
  value:    init,
  addListener:    jest.fn(),
  removeListener: jest.fn(),
});

module.exports = {
  // Core hooks
  useSharedValue:     jest.fn(noopSharedValue),
  useAnimatedStyle:   jest.fn(() => ({})),
  useAnimatedGestureHandler: jest.fn(() => ({})),
  useAnimatedScrollHandler:  jest.fn(() => ({})),
  useDerivedValue:    jest.fn((fn) => ({ value: fn() })),
  useAnimatedRef:     jest.fn(() => React.createRef()),
  useAnimatedReaction: jest.fn(),
  useWorkletCallback: jest.fn((fn) => fn),

  // Animation functions
  withTiming:    jest.fn((val) => val),
  withSpring:    jest.fn((val) => val),
  withDelay:     jest.fn((_, val) => val),
  withSequence:  jest.fn((...vals) => vals[vals.length - 1]),
  withRepeat:    jest.fn((val) => val),
  withDecay:     jest.fn((config) => config?.velocity ?? 0),
  cancelAnimation: jest.fn(),
  runOnJS:       jest.fn((fn) => fn),
  runOnUI:       jest.fn((fn) => fn),

  // Interpolation
  interpolate:        jest.fn((val) => val),
  interpolateColor:   jest.fn((val) => val),
  Extrapolation:      { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Easing:             { linear: jest.fn(), ease: jest.fn(), bezier: jest.fn(() => jest.fn()) },

  // Animated component
  default: {
    View:         RN.View,
    Text:         RN.Text,
    Image:        RN.Image,
    ScrollView:   RN.ScrollView,
    FlatList:     RN.FlatList,
  },
  View:        RN.View,
  Text:        RN.Text,
  Image:       RN.Image,
  ScrollView:  RN.ScrollView,
  FlatList:    RN.FlatList,

  // Gesture Handler helpers
  createAnimatedComponent: jest.fn((Component) => Component),
};
