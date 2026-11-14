const { withPodfile } = require('@expo/config-plugins')

/**
 * Lets the Swift pods of Google Sign-In link as static libraries.
 *
 * GoogleSignIn pulls `AppCheckCore`, a Swift pod that imports
 * `GoogleUtilities` and `RecaptchaInterop`. Those two ship no module map, so
 * `pod install` stops the iOS build outright:
 *
 *     The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *     `RecaptchaInterop`, which do not define modules.
 *
 * Modular headers are switched on for those two pods only, not globally, and
 * not through `use_frameworks!`, which would change how every other native
 * module links. The Podfile is regenerated on every prebuild, hence a plugin.
 */
const MARKER = '# ebio: modular headers for AppCheckCore'
const PODS = `
  ${MARKER}
  pod 'GoogleUtilities', :modular_headers => true
  pod 'RecaptchaInterop', :modular_headers => true
`

module.exports = function withIosModularHeaders(config) {
  return withPodfile(config, (podConfig) => {
    const contents = podConfig.modResults.contents
    if (contents.includes(MARKER)) {
      return podConfig
    }
    podConfig.modResults.contents = contents.replace(
      /(target ['"][^'"]+['"] do\n)/,
      `$1${PODS}`,
    )
    return podConfig
  })
}
