const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.sourceExts.push('mjs')
config.resolver.unstable_enablePackageExports = true
config.resolver.unstable_conditionNames = ['react-native', 'import', 'default']

// Stub server-only modules that leak into the React Native bundle
const emptyModule = path.resolve(__dirname, 'empty-module.js')
config.resolver.extraNodeModules = {
  '@opentelemetry/api': emptyModule,
}

module.exports = config
