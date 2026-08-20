/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /*
       * 활자 단계 — 이 여덟 개로만 쓴다.
       *
       * 지금까지 text-[10px]·text-[11px]·text-[13px] 를 자리마다 손으로 적었더니
       * 같은 뜻의 글자가 화면마다 1px 씩 달라졌다. 이름을 붙여 두면 「이건 어느 단계인가」를
       * 고르게 되고, 없는 단계를 쓰려면 먼저 여기 추가해야 한다.
       *
       * 쓰는 자리:
       *   micro 꼬리표·단위        tiny 라벨·표 머리·실패 문구
       *   small 보조 설명·보조 단추  base 본문·표 안의 값·입력칸
       *   lead 카드 표제·하는 일 단추  h3 구역 제목   h2 화면 제목   h1 큰 숫자
       */
      fontSize: {
        micro: ['10px', { lineHeight: '1.3' }],
        tiny: ['11px', { lineHeight: '1.45' }],
        small: ['12px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.6' }],
        lead: ['14px', { lineHeight: '1.6' }],
        h3: ['16px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        h2: ['18px', { lineHeight: '1.35', letterSpacing: '-0.02em' }],
        h1: ['24px', { lineHeight: '1.25', letterSpacing: '-0.03em' }],
      },
      /*
       * 모서리 — 네 단계.
       *   tag 꼬리표(각진 배지)   ctl 누르는 것·입력칸   box 카드 안의 표·띠   panel 화면 단위 상자
       *
       * 동글한 상태 배지는 rounded-full 이다. 「동글면 상태, 각지면 누르는 것」이
       * 눌러 보고 아는 구별이라 남겨 둔다.
       */
      borderRadius: {
        tag: '4px',
        ctl: '8px',
        box: '12px',
        panel: '16px',
      },
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
