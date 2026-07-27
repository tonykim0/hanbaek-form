/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 한백 로고 그린 — 로고(CI) 파일에서 추출한 #56A76C 기준 스케일
        brand: {
          50: '#eff7f1',
          100: '#d6ecdd',
          200: '#b2dcbe',
          300: '#83c597',
          400: '#56a76c', // 로고 그린 (정확값)
          500: '#479659',
          600: '#3a7f4d', // 기본 버튼/배지
          700: '#316a40', // hover
          800: '#295436',
          900: '#22452d',
        },
      },
    },
  },
  plugins: [],
};
