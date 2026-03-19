/**
 * Tailwind CSS 설정
 *
 * - darkMode: 클래스 기반 다크 모드 (현재 미사용, 향후 확장용)
 * - content: JSX/TSX 파일 스캔 경로 (Purge CSS 대상)
 * - theme.extend: Shadcn UI 디자인 시스템 CSS 변수 기반 색상 확장
 * - plugins: tailwindcss-animate (Shadcn UI 애니메이션 유틸리티)
 *
 * Shadcn UI 색상 체계:
 *   primary, secondary, destructive, muted, accent, popover, card 등
 *   각 색상은 CSS 변수(--primary 등)로 정의되어 globals.css에서 값 설정
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        pretendard: ['Pretendard', 'sans-serif'], // 프로젝트 기본 폰트
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
     plugins: [require("tailwindcss-animate")],  // ⭐ 추가
}