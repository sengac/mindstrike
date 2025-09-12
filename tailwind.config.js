/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'ripple': 'ripple 2s ease-out infinite',
        'ripple-delayed': 'ripple 2s ease-out infinite 1s',
        'shimmer-inset': 'shimmer-inset 2s linear infinite',
        'shine': 'shine 2s ease-in-out infinite',
      },
      keyframes: {
        'ripple': {
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
          }
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
          }
        },
        'shine': {
          '0%': {
            backgroundPosition: '-200% 0',
          },
          '100%': {
            backgroundPosition: '200% 0',
          }
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
