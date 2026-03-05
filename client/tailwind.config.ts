import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF0FF',
          100: '#D9DEFF',
          200: '#B3BDFF',
          300: '#8090FF',
          400: '#4D63FF',
          500: '#0024CC',
          600: '#001BA0',
          700: '#001478',
          800: '#000D50',
          900: '#000628',
        },
        neutral: {
          0: '#FFFFFF',
          25: '#F7F8FD',
          50: '#F1F3F9',
          100: '#E2E5EF',
          200: '#C5C9D9',
          300: '#9CA0B3',
          400: '#6B7280',
          500: '#4B5063',
          600: '#3A415A',
          700: '#272D42',
          800: '#181C2E',
          900: '#0C0F1A',
        },
        ai: {
          50: '#EEF0FF',
          100: '#D9DEFF',
          500: '#4D63FF',
          600: '#0024CC',
        },
        success: {
          50: '#ECFDF5',
          500: '#047857',
          600: '#065F46',
        },
        error: {
          50: '#FEF2F2',
          500: '#DC2626',
          600: '#B91C1C',
        },
        warning: {
          50: '#FFFBEB',
          500: '#D97706',
          700: '#92400E',
        },
        info: {
          50: '#EFF6FF',
          500: '#2563EB',
        },
      },
      fontFamily: {
        display: [
          "'Space Grotesk'",
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        body: ["'Archivo'", 'system-ui', '-apple-system', 'sans-serif'],
        mono: [
          "'Space Mono'",
          "'SF Mono'",
          "'Fira Code'",
          "'Consolas'",
          'monospace',
        ],
      },
      boxShadow: {
        none: 'none',
        xs: '0 1px 2px 0 rgba(12, 15, 26, 0.04)',
        sm: '0 1px 3px 0 rgba(12, 15, 26, 0.06), 0 1px 2px -1px rgba(12, 15, 26, 0.06)',
        DEFAULT: '0 1px 3px 0 rgba(12, 15, 26, 0.06), 0 1px 2px -1px rgba(12, 15, 26, 0.06)',
        md: '0 4px 6px -1px rgba(12, 15, 26, 0.07), 0 2px 4px -2px rgba(12, 15, 26, 0.05)',
        lg: '0 10px 15px -3px rgba(12, 15, 26, 0.08), 0 4px 6px -4px rgba(12, 15, 26, 0.04)',
        xl: '0 20px 25px -5px rgba(12, 15, 26, 0.08), 0 8px 10px -6px rgba(12, 15, 26, 0.04)',
      },
      borderRadius: {
        sm: '0.125rem',     /* 2px */
        DEFAULT: '0.25rem', /* 4px — Inkit exact match */
        md: '0.5rem',       /* 8px — chat containers */
        lg: '0.75rem',      /* 12px — modals */
        xl: '1rem',         /* 16px — chat bubbles */
        '2xl': '1.5rem',    /* 24px */
      },
    },
  },
  plugins: [animate],
} satisfies Config;
