#!/bin/bash
# 이 저장소는 Claude 세션 여러 개가 동시에 작업한다 — 전부 같은 git index(스테이징)를
# 공유하므로, 전체를 쓸어 담는 add/commit 은 다른 세션이 스테이징해 둔 파일을 삼킨다
# (실사고: 2026-08-21, 재발행 수정이 시공 탭 커밋에 섞여 배포됨).
# 그래서 「경로를 지정한 커밋」만 허용한다: git add <파일> · git commit -m "..." -- <파일>
#
# PreToolUse(Bash) 훅. stdin: {"tool_input":{"command":"..."}}
# 차단 시 permissionDecision:"deny" JSON 을 출력한다. 허용은 출력 없이 exit 0.

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

CONVENTION='다른 세션의 스테이징을 삼킬 수 있습니다. 파일을 지정하세요: git add <파일들> · git commit -m "..." -- <파일들> (CLAUDE.md 협업 방식 참고)'

# git add -A / --all / -u / --update / .  — 전체 스테이징 금지
if echo "$cmd" | grep -qE 'git[[:space:]]+add[^&|;]*([[:space:]](-[a-zA-Z]*A[a-zA-Z]*|--all|-u|--update)([[:space:]]|$)|[[:space:]]\.(/)?([[:space:]]|$))'; then
  deny "git add 전체 스테이징 금지 — $CONVENTION"
fi

# git commit -a / -am / --all — 작업 트리 전체 커밋 금지
if echo "$cmd" | grep -qE 'git[[:space:]]+commit[^&|;]*[[:space:]](-[a-zA-Z]*a[a-zA-Z]*|--all)([[:space:]]|$|[[:space:]]*")' \
  && ! echo "$cmd" | grep -qE 'git[[:space:]]+commit[^&|;]*[[:space:]]--amend'; then
  deny "git commit -a 금지 — $CONVENTION"
fi

if echo "$cmd" | grep -qE 'git[[:space:]]+commit'; then
  # --amend 는 index 가 비어 있을 때만 (메시지 수정 용도) — 차 있으면 남의 것까지 흡수한다
  if echo "$cmd" | grep -qE 'git[[:space:]]+commit[^&|;]*[[:space:]]--amend'; then
    if ! git diff --cached --quiet 2>/dev/null; then
      deny "스테이징에 파일이 있는 상태의 --amend 금지 — 다른 세션이 올린 것일 수 있습니다. git diff --cached 로 먼저 확인하세요."
    fi
    exit 0
  fi
  # 경로 없는 commit 은 index 전체를 커밋한다 — ' -- ' 구분자를 요구한다
  if ! echo "$cmd" | grep -qE 'git[[:space:]]+commit[^&|;]*[[:space:]]--[[:space:]]'; then
    deny "경로 없는 git commit 금지 — $CONVENTION"
  fi
fi

exit 0
