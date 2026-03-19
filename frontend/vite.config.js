/**
 * Vite 빌드 설정
 *
 * - @vitejs/plugin-react: React JSX 변환 및 Fast Refresh 지원
 * - resolve.alias: '@' → src/ 경로 별칭 (import 경로 단축)
 * - server: 개발 서버 포트 3000, 모든 호스트 바인딩, 자동 브라우저 열기
 * - build: 빌드 출력 디렉토리 'build', 소스맵 비활성화 (프로덕션)
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,       // 개발 서버 포트
    host: '0.0.0.0',  // 외부 접속 허용 (Docker, VM 등)
    open: true,        // 서버 시작 시 브라우저 자동 열기
  },
  build: {
    outDir: 'build',     // 빌드 출력 경로
    sourcemap: false,    // 프로덕션 소스맵 비활성화
  },
})