// Mock for react-native-tts in Jest environment
module.exports = {
  setDefaultLanguage: jest.fn(() => Promise.resolve()),
  setDefaultRate:     jest.fn(() => Promise.resolve()),
  setDefaultPitch:    jest.fn(() => Promise.resolve()),
  speak:              jest.fn(() => Promise.resolve('finished')),
  stop:               jest.fn(),
};
