const { getDefaultConfig } = require('@react-native/metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig();
  return {
    ...config,
    resolver: {
      assetExts: [...config.resolver.assetExts, 'tflite'],
    },
  };
})();
