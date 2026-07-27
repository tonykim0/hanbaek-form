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
        // 한백 로고 그린 (세이지) — 로고 파일에서 정확 값 추출 후 여기만 조정하면 전체 반영
        brand: {
          50: '#eef6f1',
          100: '#d5ebdd',
          200: '#aed7bc',
          300: '#7fbf95',
          400: '#57a46e', // 로고 그린
          500: '#489760',
          600: '#3d8452', // 기본 버튼/배지
          700: '#336d44', // hover
          800: '#2b5738',
          900: '#244830',
        },
      },
    },
  },
  plugins: [],
};
