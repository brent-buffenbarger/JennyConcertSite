/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--color-canvas) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--color-surface-muted) / <alpha-value>)',
        masthead: 'rgb(var(--color-masthead) / <alpha-value>)',
        header: 'rgb(var(--color-header) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-muted': 'rgb(var(--color-ink-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        'control-border': 'rgb(var(--color-control-border) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'rgb(var(--color-primary-hover) / <alpha-value>)',
        accent: 'rgb(var(--color-accent) / <alpha-value>)',
        focus: 'rgb(var(--color-focus) / <alpha-value>)',
        'rating-favorite': 'rgb(var(--color-rating-favorite) / <alpha-value>)',
        'rating-love': 'rgb(var(--color-rating-love) / <alpha-value>)',
        'rating-like': 'rgb(var(--color-rating-like) / <alpha-value>)',
        'rating-disappointed': 'rgb(var(--color-rating-disappointed) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Source Sans 3', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['League Gothic', 'Impact', 'sans-serif'],
      },
      letterSpacing: {
        poster: '0.2em',
      },
      borderRadius: {
        control: '0.625rem',
        card: '0.875rem',
        dialog: '1.125rem',
      },
      boxShadow: {
        card: '0 10px 30px rgb(23 21 33 / 0.10)',
        'card-hover': '0 16px 38px rgb(23 21 33 / 0.16)',
        dialog: '0 24px 70px rgb(23 21 33 / 0.28)',
      },
    },
  },
  plugins: [],
}
