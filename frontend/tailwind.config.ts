import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      sm: '320px',
      md: '480px',
      lg: '768px',
    },
  },
  plugins: [],
};

export default config;
