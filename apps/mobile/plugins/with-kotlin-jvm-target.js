const { withProjectBuildGradle } = require('@expo/config-plugins')

/**
 * Pins every Kotlin module to the JVM target the rest of the build uses.
 *
 * A library that does not say which JVM target it wants gets the one the JDK
 * happens to default to — 21 here — while Expo compiles its Java at 17. Gradle
 * refuses the mix, by name:
 *
 *     Inconsistent JVM-target compatibility detected for tasks
 *     'compileDebugJavaWithJavac' (17) and 'compileDebugKotlin' (21)
 *
 * The fix belongs in the root `build.gradle`, which `expo prebuild` rewrites
 * from scratch every time, so it is applied as a plugin instead of edited in
 * place — otherwise it would last until the next prebuild and no longer, and
 * an EAS build would hit the same wall.
 */
const JVM_TARGET = `
// Every Kotlin module compiles to the same JVM target as the Java around it.
subprojects {
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}
`

module.exports = function withKotlinJvmTarget(config) {
  return withProjectBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.contents.includes('JvmTarget.JVM_17')) {
      return gradleConfig
    }
    gradleConfig.modResults.contents += JVM_TARGET
    return gradleConfig
  })
}
