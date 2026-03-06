import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Colors reference CSS custom properties from tokens.css (single source of truth).
 * Note: Tailwind opacity modifiers (e.g., bg-primary-500/50) are NOT supported
 * with this approach. Use explicit opacity values or Tailwind's opacity utilities.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        neutral: {
          0: 'var(--color-neutral-0)',
          25: 'var(--color-neutral-25)',
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
        },
        ai: {
          50: 'var(--color-ai-50)',
          100: 'var(--color-ai-100)',
          500: 'var(--color-ai-500)',
          600: 'var(--color-ai-600)',
        },
        success: {
          50: 'var(--color-success-50)',
          500: 'var(--color-success-500)',
          600: 'var(--color-success-600)',
        },
        error: {
          50: 'var(--color-error-50)',
          500: 'var(--color-error-500)',
          600: 'var(--color-error-600)',
        },
        warning: {
          50: 'var(--color-warning-50)',
          500: 'var(--color-warning-500)',
          700: 'var(--color-warning-700)',
        },
        info: {
          50: 'var(--color-info-50)',
          500: 'var(--color-info-500)',
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
