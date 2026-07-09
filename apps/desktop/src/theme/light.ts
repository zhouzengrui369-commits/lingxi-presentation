/**
 * 浅色主题 — 简约商务风，无冗余装饰
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
export const lightTheme = {
  name: 'light' as const,
  colors: {
    background: '#FFFFFF',
    surface: '#F7F8FA',
    surfaceMuted: '#EEF0F4',
    primary: '#2D6CDF',
    primaryHover: '#1F58C7',
    text: '#1A1A1A',
    textMuted: '#5C636E',
    textSubtle: '#8A8F99',
    border: '#E1E4EA',
    borderStrong: '#C6CAD3',
    success: '#16A34A',
    warning: '#D97706',
    danger: '#DC2626',
    accent: '#0EA5E9',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
  },
  typography: {
    h1: 28,
    h2: 22,
    h3: 18,
    body: 15,
    small: 13,
  },
};

export type Theme = typeof lightTheme;
