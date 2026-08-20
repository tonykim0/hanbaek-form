/**
 * 접수 검증 — 화면과 서버가 같은 함수를 쓴다.
 *
 * 클라이언트 검증만 두면 우회된다. 제출 버튼을 잠그는 근거와
 * API 가 거절하는 근거가 같아야 「왜 안 되는지」가 어긋나지 않는다.
 */
import type { IntakeDraft } from '@/types/project';
import { buildDocContext, evaluateDocs } from './doc-rules';

export interface IntakeCheck {
  /** 제출을 막는 문제 */
  errors: string[];
  /** 제출은 되지만 알려야 하는 것 (영업비 지급조건 등) */
  warnings: string[];
  requiredCount: number;
  satisfiedCount: number;
}

export function checkDraft(draft: IntakeDraft): IntakeCheck {
  const errors: string[] = [];
  const warnings: string[] = [];

  /*
   * 목록 두 개는 없을 수 있다고 보고 센다.
   *
   * 화면에서 부를 때는 늘 있지만, /api/projects 는 아무 본문이나 받는다. 예전에는
   * draft.lines.length 에서 곧바로 터져서 「Cannot read properties of undefined」가
   * 그대로 응답으로 나갔다 — 서버 검증이 클라이언트 검증의 사본이라 이 자리가 비어 있었다.
   */
  const lines = Array.isArray(draft?.lines) ? draft.lines : [];
  const documents = Array.isArray(draft?.documents) ? draft.documents : [];

  if (!draft?.name?.trim()) errors.push('현장명을 입력하세요.');
  if (!draft?.cpo) errors.push('운영사를 선택하세요.');
  if (!draft?.contractParty) errors.push('계약 주체를 선택하세요 — 회의록 종류가 여기서 정해집니다.');
  if (!draft?.powerType) errors.push('수전 방식을 선택하세요.');
  if (!draft?.bizType) errors.push('사업구분을 선택하세요.');

  if (lines.length === 0) {
    errors.push('계약 라인을 하나 이상 추가하세요.');
  } else {
    lines.forEach((l, i) => {
      if (!l.qty || l.qty < 1) errors.push(`계약 라인 ${i + 1}: 대수를 1 이상으로 입력하세요.`);
      if (![5, 7, 10].includes(l.termYears)) errors.push(`계약 라인 ${i + 1}: 계약기간을 선택하세요.`);
      if (draft.powerType === '한전불입+모자분리' && !l.powerType) {
        errors.push(`계약 라인 ${i + 1}: 혼용 현장이므로 라인의 수전방식을 골라야 합니다.`);
      }
    });
  }

  if (draft?.preInstall === '있음' && !draft.preNote?.trim()) {
    errors.push('기설치 충전기가 있으므로 기설치 현황을 적어주세요.');
  }

  // 서류 — 조건부 규칙을 그대로 적용
  const ctx = buildDocContext({
    cpo: draft?.cpo,
    contractParty: draft?.contractParty,
    bldgType: draft?.bldgType,
    projectPowerType: draft?.powerType,
    linePowerTypes: lines.map((l) => l.powerType),
    preInstall: draft?.preInstall,
    bizType: draft?.bizType,
  });
  const evaluated = evaluateDocs(ctx);
  const attached = new Set(documents.map((d) => d.kind));

  const required = evaluated.filter((d) => d.req === 'm');
  const missing = required.filter((d) => !attached.has(d.key));
  if (missing.length > 0) {
    errors.push(`필수 서류 ${missing.length}건 미첨부: ${missing.map((d) => d.label).join(', ')}`);
  }

  const feeMissing = evaluated.filter((d) => d.fee && d.req === 'm' && !attached.has(d.key));
  if (feeMissing.length > 0) {
    warnings.push(`영업비 지급조건 미달 — ${feeMissing.map((d) => d.label).join(' · ')}`);
  }

  return {
    errors,
    warnings,
    requiredCount: required.length,
    satisfiedCount: required.length - missing.length,
  };
}
