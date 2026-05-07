/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#c9a96e',
          light: '#dfc291',
          dark: '#a8884d',
          50: '#fdf8ef',
          100: '#f9edda',
          200: '#f2d8b4',
          300: '#e8be84',
          400: '#dfc291',
          500: '#c9a96e',
          600: '#b08a4a',
          700: '#8e6d3a',
          800: '#745934',
          900: '#604a2e',
        },
        parchment: {
          DEFAULT: '#f5f0e8',
          dim: '#e8e0d0',
          dark: '#d4c9b5',
        },
        study: {
          bg: '#1c1915',
          deep: '#151210',
          card: '#242019',
          surface: '#2c2720',
          border: '#3d3529',
          muted: '#4a4035',
          glow: 'rgba(201, 169, 110, 0.06)',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', '"Noto Serif SC"', 'Georgia', 'serif'],
        body: ['"DM Sans"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
        serif: ['"Noto Serif SC"', '"Source Serif 4"', 'Georgia', 'serif'],
      },
      boxShadow: {
        glow: '0 0 20px rgba(201, 169, 110, 0.1)',
        'glow-lg': '0 0 40px rgba(201, 169, 110, 0.15)',
        warm: '0 4px 24px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(201, 169, 110, 0.05)',
      },
      backgroundImage: {
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")",
        'radial-warm': 'radial-gradient(ellipse at 30% 20%, rgba(201, 169, 110, 0.08) 0%, transparent 60%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'typewriter': 'typewriter 0.1s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
