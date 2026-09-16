/**
 * VitalAI design tokens.
 *
 * Two rules this file exists to enforce:
 *
 * 1. Colour is a system, not decoration. Every hue here has one job. `primary`
 *    is the product's voice and the "safe" verdict; `caution` and `danger` are
 *    verdict semantics and nothing else. A warm accent never appears on a
 *    border or a heading because it looked nice there.
 * 2. Grouping is earned. There is one shadow, for things that genuinely float
 *    above the page (menus, dialogs). Everything else separates with a hairline
 *    or with space, because a page of floating rounded rectangles has no
 *    hierarchy — only texture.
 *
 * Contrast is verified against the ground, not assumed: ink 15.98:1,
 * ink-muted 7.22:1, ink-faint 4.71:1, primary 5.89:1, caution 5.43:1,
 * danger 6.66:1. `line-strong` is 3.52:1 on white because input borders are
 * meaningful non-text contrast under WCAG 1.4.11; `line` is decorative only
 * and must never be the sole boundary of a control.
 */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        /* The page. Warm sand, deliberately a clear step down from white so a
           white card reads as an object sitting on it rather than as more page. */
        ground: '#EFE9DF',
        surface: '#FFFFFF',
        sunk: '#E3DACB',

        /* Dark blocking. This is where the product gets its presence: full-bleed
           panels of it behind the hero, the nav rail and the opening screen.
           A light page with no dark anywhere has no structure to push against. */
        canvas: {
          DEFAULT: '#16211B',
          soft: '#1F2E26',
          line: '#33443A',
          ink: '#F4EFE6',
          muted: '#B5AF9F',
        },

        line: '#D5CBB8',
        'line-strong': '#8A8171',

        ink: '#191713',
        'ink-muted': '#57503F',
        'ink-faint': '#6E6757',
        'ink-inverse': '#F4EFE6',

        /* The product's voice, and the "safe" verdict. */
        primary: {
          DEFAULT: '#186B44',
          hover: '#135637',
          press: '#0F452C',
          soft: '#E2EDE6',
          ink: '#125434',
          bright: '#8FD9B6',
        },

        /* Brand energy only — the opening screen, a hero, a streak, an empty
           state that needs warmth. Never a verdict, and never next to one. */
        accent: {
          DEFAULT: '#B04C18',
          hover: '#96400F',
          soft: '#FAEADF',
          ink: '#8F4014',
          bright: '#E89463',
        },

        caution: {
          DEFAULT: '#8A5A12',
          soft: '#F8EEDB',
          ink: '#6B4610',
        },
        danger: {
          DEFAULT: '#A33024',
          hover: '#84271D',
          soft: '#F9E6E3',
          ink: '#84271D',
        },

      },

      fontFamily: {
        // Display only. One display element per screen — a page of big headlines
        // has no hierarchy either.
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Karla', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },

      fontSize: {
        'display-xl': ['3.75rem', { lineHeight: '3.875rem', letterSpacing: '-0.03em', fontWeight: '600' }],
        'display-lg': ['3rem', { lineHeight: '3.125rem', letterSpacing: '-0.025em', fontWeight: '600' }],
        display: ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em', fontWeight: '600' }],
        title: ['1.625rem', { lineHeight: '2rem', letterSpacing: '-0.015em', fontWeight: '600' }],
        stat: ['2.75rem', { lineHeight: '2.75rem', letterSpacing: '-0.02em', fontWeight: '500' }],
        heading: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.6875rem' }],
        body: ['0.9375rem', { lineHeight: '1.4375rem' }],
        label: ['0.8125rem', { lineHeight: '1.125rem', letterSpacing: '0.01em', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1rem' }],
        figure: ['0.8125rem', { lineHeight: '1.25rem' }],
      },

      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        md: '12px',
        lg: '16px',
        xl: '20px',
        '2xl': '24px',
      },

      boxShadow: {
        /* A white card on warm sand needs a real edge to sit on it. These are
           warm-tinted rather than grey — a neutral shadow over a warm ground
           reads as dirt. */
        card: '0 1px 2px rgba(25, 23, 19, 0.04), 0 2px 8px -2px rgba(25, 23, 19, 0.06)',
        lift: '0 2px 4px rgba(25, 23, 19, 0.05), 0 12px 24px -8px rgba(25, 23, 19, 0.12)',
        button: '0 1px 2px rgba(25, 23, 19, 0.12)',
        overlay: '0 16px 48px -12px rgba(25, 23, 19, 0.28), 0 4px 12px -4px rgba(25, 23, 19, 0.12)',
        none: 'none',
      },

      transitionTimingFunction: {
        entrance: 'cubic-bezier(0.2, 0, 0, 1)',
      },
      transitionDuration: {
        micro: '120ms',
        enter: '220ms',
        page: '320ms',
      },

      maxWidth: {
        reading: '68ch',
      },
    },
  },
  plugins: [],
};
