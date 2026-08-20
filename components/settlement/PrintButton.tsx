'use client';

/** 인쇄 — 거래명세서는 화면이 그대로 인쇄물이다 (ConsoleShell 이 print 에서 껍데기를 걷는다) */
import { Btn } from '@/components/ui';

export default function PrintButton() {
  return (
    <Btn kind="side" onClick={() => window.print()} className="print:hidden">
      인쇄
    </Btn>
  );
}
