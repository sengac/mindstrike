/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Discord/VS Code inspired dark theme
        dark: {
          bg: '#1e1e1e', // Main background (VS Code editor)
          panel: '#252526', // Sidebar/panel background
          surface: '#2d2d30', // Card/surface background
          border: '#3e3e42', // Border color
          hover: '#37373d', // Hover state
          text: {
            primary: '#cccccc', // Primary text
            secondary: '#969696', // Secondary text
            muted: '#6a6a6a', // Muted text
          },
        },
        // Override Tailwind's bluish grays with true neutral grays
        gray: {
          50: '#fafafa',
          100: '#f5f5f5',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040', // True neutral gray instead of bluish #374151
          800: '#262626', // True neutral gray instead of bluish #1f2937
          900: '#171717',
          950: '#0a0a0a',
        },
      },
      animation: {
        ripple: 'ripple 2s ease-out infinite',
        'ripple-delayed': 'ripple 2s ease-out infinite 1s',
        'shimmer-inset': 'shimmer-inset 2s linear infinite',
        shine: 'shine 2s ease-in-out infinite',
      },
      keyframes: {
        ripple: {
          '0%': {
            transform: 'scale(1)',
            opacity: '0.6',
          },
          '70%': {
            transform: 'scale(3)',
            opacity: '0.1',
          },
          '100%': {
            transform: 'scale(4)',
            opacity: '0',
          },
        },
        'shimmer-inset': {
          '0%': {
            boxShadow: 'inset 0 0 0 2px #a855f7',
          },
          '33%': {
            boxShadow: 'inset 0 0 0 2px #3b82f6',
          },
          '66%': {
            boxShadow: 'inset 0 0 0 2px #06b6d4',
          },
          '100%': {
            boxShadow: 'inset 0 0 0 2px #a855f7',
          },
        },
        shine: {
          '0%': {
            backgroundPosition: '-200% 0',
          },
          '100%': {
            backgroundPosition: '200% 0',
          },
        },
      },
    },
  },
  plugins: [typography],
};
