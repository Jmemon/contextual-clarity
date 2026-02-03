/**
 * Tailwind CSS Configuration for Contextual Clarity
 *
 * Configures Tailwind to scan all React component files for class names.
 * Extend the theme here to add custom colors, fonts, or spacing values.
 */

/** @type {import('tailwindcss').Config} */
export default {
  // Content paths tell Tailwind which files to scan for class names
  // This ensures unused styles are purged in production builds
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],

  theme: {
    extend: {
      // Custom theme extensions can be added here
      // Example: custom colors for the Contextual Clarity brand
      colors: {
        // These can be customized later to match the app's design system
        clarity: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
      },
    },
  },

  // Tailwind plugins can be added here
  plugins: [],
};
