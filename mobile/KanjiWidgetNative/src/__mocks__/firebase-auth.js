// Mock for @react-native-firebase/auth
const mockUser = null;
let _listener = null;

const auth = () => ({
  currentUser: mockUser,
  onAuthStateChanged: (cb) => {
    _listener = cb;
    cb(mockUser);
    return () => { _listener = null; };
  },
  signInWithEmailAndPassword:   jest.fn(() => Promise.resolve({ user: mockUser })),
  createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: mockUser })),
  sendPasswordResetEmail:       jest.fn(() => Promise.resolve()),
  signInWithCredential:         jest.fn(() => Promise.resolve({ user: mockUser })),
  signOut:                      jest.fn(() => Promise.resolve()),
});

auth.GoogleAuthProvider = {
  credential: jest.fn((idToken) => ({ idToken })),
};

module.exports = auth;
module.exports.default = auth;
