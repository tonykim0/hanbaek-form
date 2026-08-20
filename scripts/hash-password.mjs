#!/usr/bin/env node
/**
 * 콘솔 계정 비밀번호 해시 생성기.
 *   node scripts/hash-password.mjs '비밀번호'
 * 출력값을 AUTH_USERS 환경변수의 hash 필드에 넣는다.
 */
const enc = new TextEncoder();
const ITER = 120_000;

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const password = process.argv[2];
if (!password) {
  console.error('사용법: node scripts/hash-password.mjs <비밀번호>');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' }, key, 256
);
console.log(`pbkdf2$${ITER}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`);
