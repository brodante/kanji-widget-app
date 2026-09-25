// Mock for @react-native-firebase/firestore
const mockDoc = {
  get:    jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
  set:    jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  delete: jest.fn(() => Promise.resolve()),
};

const firestore = () => ({
  doc:        jest.fn(() => mockDoc),
  collection: jest.fn(() => ({ doc: jest.fn(() => mockDoc) })),
});

firestore.FieldValue = {
  serverTimestamp: jest.fn(() => new Date()),
  delete:          jest.fn(),
};
firestore.Timestamp = {
  now:         jest.fn(() => ({ toDate: () => new Date() })),
  fromDate:    jest.fn((d) => ({ toDate: () => d })),
};

module.exports = firestore;
module.exports.default = firestore;
