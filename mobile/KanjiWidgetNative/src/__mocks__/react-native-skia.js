// Mock for @shopify/react-native-skia in Jest environment
const React = require('react');
const RN    = require('react-native');

const MockPath = {
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  close:  jest.fn(),
  reset:  jest.fn(),
};

module.exports = {
  Canvas:   ({ children, ...props }) => React.createElement(RN.View, props, children),
  Path:     () => null,
  Text:     () => null,
  Group:    ({ children }) => React.createElement(React.Fragment, null, children),
  useFont:  () => null,
  Skia: {
    Path: {
      Make: () => ({ ...MockPath }),
    },
    Color: (c) => c,
  },
};
