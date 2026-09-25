/**
 * Basic smoke test — verifies App renders without throwing.
 */

// Mock AsyncStorage before any imports that pull it in
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const RN = jest.requireActual('react-native');
  return {
    GestureHandlerRootView: RN.View,
    GestureDetector:        RN.View,
    Gesture: {
      Pan: () => ({ activeOffsetX: () => ({ onEnd: () => ({}) }) }),
      Tap: jest.fn(),
    },
  };
});

jest.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Screen: () => null,
  }),
}));

import 'react-native';
import React from 'react';
import { render } from '@testing-library/react-native';
import App from '../App';

it('renders without crashing', () => {
  render(<App />);
});
