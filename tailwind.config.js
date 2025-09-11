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
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
