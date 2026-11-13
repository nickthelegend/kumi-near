// Metro: bundle the shared NEAR SDK (../packages/sdk, TypeScript with `.js` import paths) into the app, resolving the
// SDK's own imports (@near-js/*, borsh, buffer) from this app's node_modules so there is one copy of each.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const sdk = path.resolve(__dirname, '../packages/sdk');
config.watchFolders = [sdk];
const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstream ?? context.resolveRequest;
  if (moduleName === '@kumi/sdk') return { type: 'sourceFile', filePath: path.join(sdk, 'src/index.ts') };
  // secp256k1's native binding needs Node; the phone only signs ed25519, so its pure-JS build is enough.
  if (moduleName === 'secp256k1') return { type: 'sourceFile', filePath: path.join(__dirname, 'node_modules/secp256k1/elliptic.js') };
  if (context.originModulePath.startsWith(sdk + path.sep)) {
    if (moduleName.startsWith('.') && moduleName.endsWith('.js')) return { type: 'sourceFile', filePath: path.resolve(path.dirname(context.originModulePath), moduleName.replace(/\.js$/, '.ts')) };
    if (!moduleName.startsWith('.')) return resolve({ ...context, originModulePath: path.join(__dirname, 'package.json') }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};
module.exports = config;
