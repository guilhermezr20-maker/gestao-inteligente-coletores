import { CheckCircle2, Clock } from 'lucide-react';
import type { RecebimentoStatus } from '../types/domain';

interface StatusBadgeProps {
  status: RecebimentoStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'JA_RECEBEU') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        JÁ RECEBEU
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
      <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      NÃO RECEBEU
    </span>
  );
}
