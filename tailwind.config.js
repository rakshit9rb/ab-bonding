/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Geist Mono"', '"IBM Plex Mono"', 'monospace'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
      colors: {
        bg: '#07090f',
        surface: '#0d1117',
        border: '#1a2130',
        border2: '#243040',
        accent: '#3b82f6',
        'accent-dim': '#1d4ed8',
        'accent-glow': 'rgba(59,130,246,0.12)',
        'text-primary': '#e2e8f0',
        'text-dim': '#64748b',
        'text-muted': '#334155',
        yield: '#22d3ee',
        hot: '#f59e0b',
        danger: '#ef4444',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.3s ease forwards',
        pulse2: 'pulse2 2s infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        pulse2: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.4' } },
      },
    },
  },
  plugins: [],
}
