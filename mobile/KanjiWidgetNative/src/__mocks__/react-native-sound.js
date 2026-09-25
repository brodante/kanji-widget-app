// Mock for react-native-sound in Jest environment
function Sound(filename, base, callback) {
  if (callback) setTimeout(() => callback(null), 0);
}
Sound.prototype.play    = jest.fn(cb => { if (cb) cb(true); });
Sound.prototype.stop    = jest.fn();
Sound.prototype.release = jest.fn();
Sound.setCategory       = jest.fn();
Sound.MAIN_BUNDLE       = '';
module.exports = Sound;
