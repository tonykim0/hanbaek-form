/**
 * 테스트 러너 — 순수 함수만 돈다.
 *
 * ★Next 를 띄우지 않는다★ — 돈 계산·권한·게이트는 DB 도 브라우저도 안 보는 순수 함수라,
 * 러너가 무거워질 이유가 없다. 화면 테스트는 이 그물에 넣지 않는다(느려지면 안 돌린다).
 *
 * 경로 별칭만 맞춘다: 소스가 `@/lib/...` 로 서로를 부르므로 그것을 못 풀면 아무것도 안 돈다.
 * 그 한 줄을 위해 플러그인을 더 깔지 않았다.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(process.cwd()) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
