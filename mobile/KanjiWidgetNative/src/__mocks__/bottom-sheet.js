// Mock for @gorhom/bottom-sheet in Jest environment
const React = require('react');
const RN    = require('react-native');

const BottomSheet = React.forwardRef(({ children }, ref) => {
  React.useImperativeHandle(ref, () => ({
    expand:    jest.fn(),
    collapse:  jest.fn(),
    close:     jest.fn(),
    snapToIndex: jest.fn(),
  }));
  return React.createElement(RN.View, null, children);
});

BottomSheet.displayName = 'BottomSheet';

const BottomSheetScrollView = ({ children, ...props }) =>
  React.createElement(RN.ScrollView, props, children);

const BottomSheetFlatList = ({ data, renderItem }) =>
  React.createElement(RN.View, null, data?.map((item, i) =>
    React.createElement(RN.View, { key: i }, renderItem({ item, index: i }))));

module.exports = BottomSheet;
module.exports.default              = BottomSheet;
module.exports.BottomSheetScrollView = BottomSheetScrollView;
module.exports.BottomSheetFlatList   = BottomSheetFlatList;
