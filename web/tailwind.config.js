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

      // Animations for the single-exchange UI (T12).
      // Used by SingleExchangeView for AI message fade-in, user message exit,
      // and the blinking cursor during AI streaming.
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // User message briefly flashes then slides up 16px and fades out (400ms).
        // The 50% keyframe holds position so the message is clearly readable
        // before the exit animation begins.
        'user-flash': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '50%': { opacity: '0.7', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-16px)' },
        },
        // Standard blinking-cursor effect used during AI streaming phase.
        'cursor-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 300ms ease-out',
        'user-flash': 'user-flash 400ms ease-out forwards',
        'cursor-blink': 'cursor-blink 1s ease-in-out infinite',
      },
    },
  },

  // Tailwind plugins can be added here
  plugins: [],
};
