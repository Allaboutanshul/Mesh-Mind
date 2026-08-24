/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mesh: {
          bg: '#0a0e1a',
          surface: '#111827',
          card: '#1a2332',
          border: '#1e2d3d',
          accent: '#00d4aa',
          'accent-dim': '#00a88a',
          warning: '#f59e0b',
          critical: '#ef4444',
          info: '#3b82f6',
          success: '#10b981',
          text: '#e2e8f0',
          'text-dim': '#94a3b8',
          'text-muted': '#64748b',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 212, 170, 0.3)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 212, 170, 0.6)' },
        },
      },
    },
  },
  plugins: [],
};
