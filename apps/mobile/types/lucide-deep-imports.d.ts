/**
 * Types for the per-icon imports.
 *
 * The app imports icons one file at a time — `lucide-react-native/dist/esm/
 * icons/bell` — so the bundler ships the one icon instead of the whole set.
 * Those files are shipped as JavaScript with no declaration beside them, and
 * the package does not list them in its `exports` either, so TypeScript found
 * no types for any of them: several hundred errors that said nothing.
 *
 * Every one of those files default-exports the same thing, which is what this
 * says. The icon names are not checked — a mistyped one fails at bundling,
 * loudly, rather than silently rendering nothing.
 */
declare module 'lucide-react-native/dist/esm/icons/*' {
  import type { LucideProps } from 'lucide-react-native'
  import type { ForwardRefExoticComponent } from 'react'

  const icon: ForwardRefExoticComponent<LucideProps>
  export default icon
}
