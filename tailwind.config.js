/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        runway: {
          // Backgrounds
          page: 'var(--bg-page)',
          deep: 'var(--bg-deep)',
          surface: 'var(--bg-card)',
          elevated: 'var(--bg-input)',
          hover: 'var(--bg-hover)',
          // Text
          text: 'var(--text-main)',
          textSecondary: 'var(--text-secondary)',
          textMuted: 'var(--text-tertiary)',
          // Borders
          border: 'var(--border-default)',
          borderStrong: 'var(--border-strong)',
          borderFocus: 'var(--border-focus)',
          // Legacy aliases (to avoid breaking existing subtle uses)
          slate: 'var(--text-secondary)',
          muted: 'var(--text-tertiary)',
          silver: 'var(--text-muted)',
        },
        framer: {
          blue: 'var(--accent)',
          blueGlow: 'var(--accent-glow)',
          frosted: 'var(--frosted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
        },
        success: {
          DEFAULT: 'var(--success)',
          subtle: 'var(--success-subtle)',
        },
        warning: {
          DEFAULT: 'var(--warning)',
          subtle: 'var(--warning-subtle)',
        },
        error: {
          DEFAULT: 'var(--error)',
          subtle: 'var(--error-subtle)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Azeret Mono', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: {
        'pill': '100px',
      }
    },
  },
  plugins: [],
}
