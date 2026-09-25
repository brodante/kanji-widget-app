const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    // Allow importing JSON files and audio assets
    assetExts: [
      ...getDefaultConfig(__dirname).resolver.assetExts,
      'mp3',
      'wav',
      'ogg',
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
