/** @type {import('tailwindcss').Config} */

/**
 * The wallet-SDK's UI (login form, provider chips, signature drawer,
 * onboarding) renders against a documented set of SEMANTIC token
 * names — `bg-surface`, `text-text-primary`, `bg-chip`, `bg-cta`, … —
 * that the HOST app's Tailwind config must define. Mapping them here
 * is the entire theming contract: change these values and every SDK
 * surface re-skins to your brand.
 *
 * The set below is the canonical light theme (mirrors
 * tncshell/frontend). The terminal package is also included in
 * `content` so its utility classes are generated.
 */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    '../../yieldfabric-wallet-sdk/src/**/*.{js,jsx,ts,tsx}',
    '../../yieldfabric-terminal/src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — swap for your own.
        brand: {
          50: '#eef2fb',
          100: '#d8e0f5',
          200: '#aebde8',
          300: '#8197d9',
          400: '#5570c5',
          500: '#3b55ae',
          600: '#2f4496', // primary
          700: '#27387b',
          800: '#1f2c5f',
          900: '#161f43',
        },
        ink: {
          DEFAULT: '#32373c',
          deep: '#0e1726',
          soft: '#5f6b7a',
          mute: '#8a93a3',
        },
        line: {
          DEFAULT: '#e3e8f0',
          soft: '#eef1f6',
          strong: '#c7d0dc',
        },

        // ── Semantic tokens consumed by the wallet-SDK ────────────
        // Surfaces
        page: '#ffffff',
        surface: '#ffffff',
        'surface-alt': '#f7f8fa',
        raised: '#ffffff',
        'raised-hover': '#f7f8fa',
        overlay: 'rgba(255,255,255,0.92)',
        background: '#ffffff',

        // Borders
        'border-default': '#e3e8f0',
        'border-light': '#eef1f6',
        'border-strong': '#c7d0dc',

        // Text
        'text-primary': '#0e1726',
        'text-secondary': '#32373c',
        'text-muted': '#5f6b7a',
        'text-inverse': '#ffffff',

        // Brand primary (accent / glow / border)
        primary: '#2f4496',
        'primary-muted': 'rgba(47,68,150,0.10)',
        'primary-soft': 'rgba(47,68,150,0.08)',
        accent: '#3b55ae',

        // CTA — the high-emphasis button fill.
        cta: '#2f4496',
        'cta-hover': '#27387b',
        'on-cta': '#ffffff',

        // Chip — small elevated surfaces (sign-in chips, pills).
        chip: '#f7f8fa',
        'chip-hover': '#eef2f8',
        'chip-active': '#e3e8f0',

        // Input
        'input-bg': '#ffffff',

        // Status — signature drawer / toasts.
        'status-success-bg': '#dcf0e6',
        'status-success-text': '#1a6b42',
        'status-warning-bg': '#fbf3d4',
        'status-warning-text': '#7a6518',
        'status-error-bg': '#fde2e7',
        'status-error-text': '#9b2c3c',
        'status-info-bg': '#dceaf8',
        'status-info-text': '#1a5090',

        // Pastels — soft badge fills used by SDK surfaces.
        'pastel-peach': '#fde6d5',
        'pastel-lavender': '#e9e2f5',
        'pastel-mint': '#d4f0e4',
        'pastel-sky': '#dceaf8',
        'pastel-rose': '#fbe2e6',
        'pastel-lemon': '#fbf3d4',
        'pastel-lilac': '#ecdef6',
        'pastel-coral': '#fde4dd',

        // Legacy aliases still referenced by some SDK code.
        textDarkMain: '#0e1726',
        textDarkSecondary: '#5f6b7a',
        borderDark: '#e3e8f0',
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,23,38,0.04), 0 4px 12px rgba(14,23,38,0.04)',
        focus: '0 0 0 3px rgba(47,68,150,0.18)',
      },
    },
  },
  plugins: [],
};
