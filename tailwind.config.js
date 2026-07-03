/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'InterVariable',
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      colors: {
        // Financial brand: deep navy + emerald accent
        brand: {
          50: '#eef4ff',
          100: '#dde8ff',
          200: '#b8ccff',
          300: '#88a8ff',
          400: '#5a82ff',
          500: '#345dff',
          600: '#1f3fdf',
          700: '#172fb5',
          800: '#132795',
          900: '#0f1f74',
          950: '#0a1750',
        },
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        security: {
          bill: '#3b82f6',   // blue
          note: '#10b981',   // emerald
          bond: '#8b5cf6',   // violet
          tips: '#f59e0b',   // amber
          cd:   '#ec4899',   // pink
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
        'card-dark':
          '0 1px 2px 0 rgb(0 0 0 / 0.4), 0 1px 6px 0 rgb(0 0 0 / 0.3)',
      },
      backgroundImage: {
        'grid-light':
          'linear-gradient(to right, rgba(15,23,42,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.04) 1px, transparent 1px)',
        'grid-dark':
          'linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};
