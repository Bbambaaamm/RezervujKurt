import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        clay: '#C86D3D',
        court: '#1D7A43',
      },
    },
  },
  plugins: [],
};

export default config;
