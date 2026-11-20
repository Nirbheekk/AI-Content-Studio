import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#09090B',
        surface: '#18181B',
        accent: '#6366F1',
      },
    },
  },
  plugins: [],
};

export default config;
