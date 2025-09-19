/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-family-base)'],
        serif: ['var(--font-family-heading)'],
        mono: ['var(--font-family-code)'],
      },
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
        'storm-scatter': 'storm-scatter 1.5s ease-out forwards',
        'storm-particle': 'storm-particle 1s ease-out forwards',
        'storm-blow-away': 'storm-blow-away 2s ease-in forwards',
        'storm-particle-blow': 'storm-particle-blow 1.5s ease-out forwards',
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
        'storm-scatter': {
          '0%': {
            transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)',
            opacity: '1',
          },
          '20%': {
            transform:
              'translateX(-10px) translateY(-5px) rotate(-5deg) scale(1.1)',
            opacity: '0.9',
          },
          '60%': {
            transform:
              'translateX(-100px) translateY(-20px) rotate(-15deg) scale(0.8)',
            opacity: '0.4',
          },
          '100%': {
            transform:
              'translateX(-200px) translateY(-50px) rotate(-25deg) scale(0.3)',
            opacity: '0',
          },
        },
        'storm-particle': {
          '0%': {
            transform: 'translate(0, 0) scale(1)',
            opacity: '0.8',
          },
          '50%': {
            transform: 'translate(-50px, -30px) scale(0.5)',
            opacity: '0.6',
          },
          '100%': {
            transform: 'translate(-120px, -80px) scale(0)',
            opacity: '0',
          },
        },
        'storm-blow-away': {
          '0%': {
            transform: 'translateX(0) translateY(0) rotate(0deg) scale(1)',
            opacity: '1',
          },
          '15%': {
            transform:
              'translateX(-30px) translateY(10px) rotate(-8deg) scale(1.05)',
            opacity: '0.95',
          },
          '40%': {
            transform:
              'translateX(-150px) translateY(60px) rotate(-20deg) scale(0.9)',
            opacity: '0.7',
          },
          '70%': {
            transform:
              'translateX(-350px) translateY(120px) rotate(-35deg) scale(0.6)',
            opacity: '0.4',
          },
          '100%': {
            transform:
              'translateX(-600px) translateY(180px) rotate(-50deg) scale(0.3)',
            opacity: '0',
          },
        },
        'storm-particle-blow': {
          '0%': {
            transform: 'translate(0, 0) scale(1) rotate(0deg)',
            opacity: '0.8',
          },
          '30%': {
            transform: 'translate(-80px, 40px) scale(0.8) rotate(-15deg)',
            opacity: '0.6',
          },
          '70%': {
            transform: 'translate(-200px, 100px) scale(0.4) rotate(-30deg)',
            opacity: '0.3',
          },
          '100%': {
            transform: 'translate(-400px, 160px) scale(0) rotate(-45deg)',
            opacity: '0',
          },
        },
      },
    },
  },
  plugins: [typography],
};
