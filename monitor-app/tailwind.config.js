/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#07070a',
          800: '#0f0f17',
          700: '#181825',
          600: '#232336',
        }
      }
    },
  },
  plugins: [],
}
