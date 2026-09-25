const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

config.resolver.sourceExts.push('mjs')
config.resolver.unstable_enablePackageExports = true
config.resolver.unstable_conditionNames = ['react-native', 'import', 'default']

/**
 * Babel's runtime helpers are resolved as CommonJS, whatever the rule above says.
 *
 * `unstable_conditionNames` lists `import`, so Metro prefers the ESM build of
 * any package that ships both. `@babel/runtime` ships both:
 *
 *     "./helpers/interopRequireDefault": {
 *       "import":  "./helpers/esm/interopRequireDefault.js",   // a namespace
 *       "default": "./helpers/interopRequireDefault.js"        // the function
 *     }
 *
 * A package shipped as pre-compiled CommonJS — posthog-react-native is one —
 * does `require("@babel/runtime/helpers/interopRequireDefault")` and receives
 * the namespace object where it expects a function. It throws
 * « _interopRequireDefault is not a function (it is Object) » at startup, and
 * the screen that asked for it stays black.
 *
 * Narrowed to this package on purpose: the global rule was set with the first
 * version of the app and nothing records what depends on it.
 */
const COMMONJS_ONLY = /^@babel\/runtime(?:\/|$)/
const fallbackResolve = config.resolver.resolveRequest

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (COMMONJS_ONLY.test(moduleName)) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ['react-native', 'require', 'default'] },
      moduleName,
      platform,
    )
  }
  return (fallbackResolve ?? context.resolveRequest)(context, moduleName, platform)
}

// Stub server-only modules that leak into the React Native bundle
const emptyModule = path.resolve(__dirname, 'empty-module.js')
config.resolver.extraNodeModules = {
  '@opentelemetry/api': emptyModule,
}

module.exports = config
