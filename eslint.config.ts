// eslint.config.js
import antfu from '@antfu/eslint-config'

export default antfu(
  // Configures for antfu's config and global rules
  {
    react: true,
    ignores: [
      '**/.react-router/**',
      '**/*.gen.ts',
      '**/dist/',
      '**/temp/',
      '**/build/',
      'packages/schematics/src/files/',
      'packages/openapi-generator/client/',
      '**/.astro/**',
      'node_modules/',
      'CLAUDE.md',
      'AGENTS.md',
      '**/README.md',
      'pnpm-workspace.yaml',
      'specs/**',
    ],
    rules: {
      'ts/no-explicit-any': 'error',
      'react-refresh/only-export-components': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },

  // Starting from the second arguments they are ESLint Flat Configs
  // Careful, antfu renames some plugins for consistency https://github.com/antfu/eslint-config?tab=readme-ov-file#plugins-renaming
  {
    files: ['apps/api/**/*.ts', 'apps/api/**/*.json'],
    rules: {
      'ts/consistent-type-imports': 'off',
      'node/prefer-global/process': ['error', 'always'],
      'react/no-useless-forward-ref': 'off',
      'react/no-forward-ref': 'off',
      '@eslint-react/no-useless-forward-ref': 'off',
      'eslintreact-hooks-extra/no-unnecessary-use-prefix': 'off',
      'react-hooks-extra/no-unnecessary-use-prefix': 'off',
      'react/no-unnecessary-use-prefix': 'off',
    },
  },

  // React Native: StyleSheet.create at bottom of file is standard pattern
  {
    files: ['apps/mobile/**/*.tsx', 'apps/mobile/**/*.ts'],
    rules: {
      'ts/no-use-before-define': 'off',
      'node/prefer-global/process': 'off',
    },
  },

  // Spec/doc markdown files — skip linting code blocks
  {
    files: ['specs/**/*.md', '**/*.md'],
    rules: {
      'ts/no-explicit-any': 'off',
    },
  },
)
