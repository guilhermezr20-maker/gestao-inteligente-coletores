import type { Colaborador, ColaboradorStatusInfo } from '../types/domain';

export const MESES_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export function getNomeMes(mes: number): string {
  const idx = Number(mes) - 1;
  if (idx >= 0 && idx < MESES_PT_BR.length) {
    return MESES_PT_BR[idx];
  }
  return String(mes);
}

export function formatMesAno(mes: number, ano: number): string {
  return `${getNomeMes(mes)}/${ano}`;
}

export function formatMesAnoExtenso(mes: number, ano: number): string {
  return `${getNomeMes(mes)} de ${ano}`;
}

export function getCentroCusto(
  item: { centroCusto?: string | null; setor?: string | null } | null | undefined
): string {
  const val = item?.centroCusto?.trim() || item?.setor?.trim();
  return val || 'Não informado';
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getNowDateTimeISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

export function formatDateBR(isoDate?: string | null): string {
  if (!isoDate) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (!match) return isoDate;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatDateTimeBR(isoDateTime?: string | null, fallbackDate?: string | null): string {
  const target = isoDateTime || fallbackDate;
  if (!target) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(target.trim());
  if (!match) return target;
  const datePart = `${match[3]}/${match[2]}/${match[1]}`;
  if (match[4] && match[5]) {
    return `${datePart} às ${match[4]}:${match[5]}`;
  }
  return datePart;
}

/**
 * Regra única e permanente do sistema:
 * Se o CPF possui coletor ativo entregue (ou registro legado sem campo de posse) -> JÁ RECEBEU.
 * Ao marcar devolução, possuiColetorAtivo torna-se false e volta para NÃO RECEBEU mantendo o histórico.
 * Sem prazos, bloqueios ou vencimentos.
 */
export function evaluateRecebimentoStatus(
  colaborador:
    | Pick<
        Colaborador,
        | 'totalColetoresRecebidos'
        | 'ultimaEntregaData'
        | 'ultimaEntregaDataHora'
        | 'possuiColetorAtivo'
        | 'ultimaDevolucaoData'
        | 'ultimaDevolucaoDataHora'
        | 'totalColetoresDevolvidos'
      >
    | null
    | undefined
): ColaboradorStatusInfo {
  const total = colaborador?.totalColetoresRecebidos || 0;
  const totalDevolucoes = colaborador?.totalColetoresDevolvidos || 0;
  const hasHistoricalDelivery = Boolean(colaborador && (total > 0 || colaborador.ultimaEntregaData));
  const totalEntregas = hasHistoricalDelivery ? Math.max(1, total) : 0;

  const isActivePossession =
    colaborador && colaborador.possuiColetorAtivo !== undefined
      ? colaborador.possuiColetorAtivo
      : hasHistoricalDelivery;

  if (isActivePossession) {
    return {
      status: 'JA_RECEBEU',
      label: 'JÁ RECEBEU',
      jaRecebeu: true,
      totalEntregas,
      ultimaEntregaData: colaborador?.ultimaEntregaData || null,
      ultimaEntregaDataHora: colaborador?.ultimaEntregaDataHora || null,
      totalDevolucoes,
      ultimaDevolucaoData: colaborador?.ultimaDevolucaoData || null,
      ultimaDevolucaoDataHora: colaborador?.ultimaDevolucaoDataHora || null,
    };
  }

  return {
    status: 'NAO_RECEBEU',
    label: 'NÃO RECEBEU',
    jaRecebeu: false,
    totalEntregas,
    ultimaEntregaData: colaborador?.ultimaEntregaData || null,
    ultimaEntregaDataHora: colaborador?.ultimaEntregaDataHora || null,
    totalDevolucoes,
    ultimaDevolucaoData: colaborador?.ultimaDevolucaoData || null,
    ultimaDevolucaoDataHora: colaborador?.ultimaDevolucaoDataHora || null,
  };
}
