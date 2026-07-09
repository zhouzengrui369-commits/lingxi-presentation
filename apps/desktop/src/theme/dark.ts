/**
 * 深色主题 — 简约商务风，无冗余装饰
 * 灵犀演示 · Phase 1 · T-1.0.b
 */
export const darkTheme = {
  name: 'dark' as const,
  colors: {
    background: '#0F1115',
    surface: '#171A21',
    surfaceMuted: '#1F232C',
    primary: '#4D8CF2',
    primaryHover: '#6BA0F5',
    text: '#F1F3F7',
    textMuted: '#B4BAC4',
    textSubtle: '#7B8089',
    border: '#2A2F38',
    borderStrong: '#3A4150',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    accent: '#38BDF8',
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

export type Theme = typeof darkTheme;
