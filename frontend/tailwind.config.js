/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ipl: {
          dark: 'var(--ipl-dark)', 
          neon: 'var(--ipl-neon)',
          accent: 'var(--ipl-accent)',
        }
      },
    },
  },
  plugins: [],
}