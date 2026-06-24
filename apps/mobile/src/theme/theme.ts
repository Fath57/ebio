// theme.ts — Source unique de vérité pour les tokens eBio (React Native)
export const colors = {
  green: {
    50: '#e8f5ec',
    100: '#c5e6cf',
    200: '#7cc896',
    400: '#2a9d4e',
    600: '#1e7a37',
    800: '#134e23',
    900: '#0a2912',
  },
  earth: {
    50: '#FAF5ED',
    100: '#F0E0C2',
    200: '#DFB97A',
    400: '#C07B2A',
    600: '#8A5518',
    800: '#543310',
    900: '#2C1A07',
  },
  blue: {
    50: '#eaeff6',
    100: '#c4d1e6',
    200: '#8aa4cc',
    400: '#4a6da6',
    600: '#335289',
    800: '#213559',
    900: '#121d30',
  },
  coral: {
    50: '#FFF0EC',
    100: '#FFD8CC',
    200: '#FFAD94',
    400: '#F06040',
    600: '#B83820',
    800: '#6F2010',
    900: '#3A100A',
  },
  neutral: {
    0: '#FFFFFF',
    50: '#F7F6F2',
    100: '#EDECEA',
    200: '#D5D3CE',
    400: '#9B9890',
    600: '#5A5852',
    800: '#2A2924',
    900: '#141410',
  },
} as const

export const fonts = {
  display: 'DMSerifDisplay_400Regular',
  sans: 'PlusJakartaSans_400Regular',
  sansMd: 'PlusJakartaSans_500Medium',
  sansSb: 'PlusJakartaSans_600SemiBold',
  sansBd: 'PlusJakartaSans_700Bold',
  mono: 'JetBrainsMono_500Medium',
} as const

export const radius = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 16,
  xl: 20,
  xxl: 24,
  pill: 99,
} as const

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const

export const typography = {
  display: { fontFamily: fonts.display, fontSize: 36, lineHeight: 36 * 1.1, fontWeight: '400' as const },
  h1: { fontFamily: fonts.sansBd, fontSize: 24, lineHeight: 24 * 1.25 },
  h2: { fontFamily: fonts.sansSb, fontSize: 20, lineHeight: 20 * 1.3 },
  h3: { fontFamily: fonts.sansSb, fontSize: 17, lineHeight: 17 * 1.35 },
  bodyL: { fontFamily: fonts.sans, fontSize: 15, lineHeight: 15 * 1.65 },
  bodyS: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 13 * 1.6 },
  caption: { fontFamily: fonts.sansMd, fontSize: 12, lineHeight: 12 * 1.4 },
  overline: { fontFamily: fonts.sansSb, fontSize: 10, lineHeight: 10 * 1.4, letterSpacing: 1, textTransform: 'uppercase' as const },
  price: { fontFamily: fonts.mono, fontSize: 16, lineHeight: 16 * 1.2 },
} as const

// Semantic colors for light/dark mode
export const lightTheme = {
  bgPage: colors.neutral[50],
  bgSurface: colors.neutral[0],
  bgCard: colors.neutral[0],
  textPrimary: colors.neutral[800],
  textSecondary: colors.neutral[600],
  textTertiary: colors.neutral[400],
  borderLight: colors.neutral[100],
  borderNormal: colors.neutral[200],
  colorPrimary: colors.green[400],
  textPrimaryColor: colors.green[600],
  bgPrimaryLight: colors.green[50],
} as const

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.10,
    shadowRadius: 24,
    elevation: 8,
  },
} as const

export const darkTheme = {
  bgPage: colors.neutral[900],
  bgSurface: colors.neutral[800],
  bgCard: colors.neutral[800],
  textPrimary: colors.neutral[50],
  textSecondary: colors.neutral[200],
  textTertiary: colors.neutral[400],
  borderLight: colors.neutral[800],
  borderNormal: colors.neutral[600],
  colorPrimary: colors.green[400],
  textPrimaryColor: colors.green[200],
  bgPrimaryLight: colors.green[900],
} as const
