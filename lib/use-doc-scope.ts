'use client';

/**
 * 출력 범위(전체 서류 / 사전현장컨설팅결과서만) 상태와 후처리를 한곳에 모읍니다.
 *
 * 두 버튼 모두 form submit이라, 어느 버튼을 눌렀는지는 클릭 시점에 ref에 적어두고
 * 제출 핸들러에서 읽습니다 (state로 두면 같은 렌더에서 최신값을 못 읽습니다).
 */

import { useCallback, useRef, useState } from 'react';
import type { DocScopeActionProps } from '@/components/contracts/PageChrome';
import { buildContractFilename } from './contract-form';

export type DocScope = 'all' | 'consulting';

export interface FinalizeMeta {
  contractYear: string;
  custName: string;
  /** 전체 서류로 뽑을 때 쓰는 파일명 라벨 (예: '계약서류_HEC') */
  documentLabel: string;
}

export interface FinalizedOutput {
  blob: Blob;
  filename: string;
  /** 성공 메시지에 덧붙일 부가 설명 (전체 서류면 빈 문자열) */
  note: string;
}

export function useDocScope(options: { showAttachmentToggle?: boolean } = {}) {
  const scopeRef = useRef<DocScope>('all');
  const [includeAttachments, setIncludeAttachments] = useState(true);

  const docScope: DocScopeActionProps = {
    onSelectAll: () => {
      scopeRef.current = 'all';
    },
    onSelectConsulting: () => {
      scopeRef.current = 'consulting';
    },
    includeAttachments,
    onIncludeAttachmentsChange: setIncludeAttachments,
    showAttachmentToggle: options.showAttachmentToggle,
  };

  /** 채워진 docx를 출력 범위에 맞게 다듬고 파일명을 만듭니다. */
  const finalize = useCallback(
    async (blob: Blob, meta: FinalizeMeta): Promise<FinalizedOutput> => {
      if (scopeRef.current !== 'consulting') {
        return {
          blob,
          filename: buildContractFilename(
            meta.contractYear,
            meta.documentLabel,
            meta.custName
          ),
          note: '',
        };
      }

      const { sliceConsultingReport } = await import('./slice-docx');
      const sliced = await sliceConsultingReport(blob, { includeAttachments });
      return {
        blob: sliced.blob,
        filename: buildContractFilename(
          meta.contractYear,
          '사전현장컨설팅결과서',
          meta.custName
        ),
        note: sliced.hasAttachments
          ? ' (별지7호 + 사진대지 · 체크리스트)'
          : ' (별지7호)',
      };
    },
    [includeAttachments]
  );

  return { docScope, finalize };
}
