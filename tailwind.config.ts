import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        aviator: {
          bg: '#0e0f14',
          surface: '#14151b',
          panel: '#1b1c22',
          card: '#202129',
          elevated: '#2a2b35',
          border: '#2d2f3a',
          red: '#e50539',
          green: '#28a745',
          greenBright: '#36b51a',
          greenTint: '#162d18',
          amber: '#e08d15',
          skyTop: '#2e7ce6',
          skyBottom: '#6eb4fb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
