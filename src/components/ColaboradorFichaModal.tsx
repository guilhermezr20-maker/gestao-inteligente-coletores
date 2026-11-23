import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  Calendar,
  History,
  PackageCheck,
  RotateCcw,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import {
  evaluateRecebimentoStatus,
  formatDateBR,
  formatDateTimeBR,
  getCentroCusto,
} from '../lib/coletorStatus';
import {
  excluirColaboradorCompleto,
  fetchColaboradorTimeline,
  marcarDevolucaoColetor,
} from '../lib/firestoreService';
import type { Colaborador, ColaboradorHistorico, Entrega } from '../types/domain';
import { StatusBadge } from './StatusBadge';

interface ColaboradorFichaModalProps {
  user: User;
  colaborador: Colaborador | null;
  onClose: () => void;
  onMarcarRecebido?: (colaborador: Colaborador) => void;
  canMarkDelivery?: boolean;
  canDeleteCadastro?: boolean;
  onRefresh?: () => Promise<void>;
  onDeleted?: () => void;
}

export function ColaboradorFichaModal({
  user,
  colaborador,
  onClose,
  onMarcarRecebido,
  canMarkDelivery = false,
  canDeleteCadastro = false,
  onRefresh,
  onDeleted,
}: ColaboradorFichaModalProps) {
  const [loading, setLoading] = useState(false);
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [historico, setHistorico] = useState<ColaboradorHistorico[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!colaborador) return;
    let cancelled = false;
    setLoading(true);
    setConfirmDelete(false);
    setActionError(null);
    fetchColaboradorTimeline(user, colaborador.cpfHash)
      .then((res) => {
        if (!cancelled) {
          setEntregas(res.entregas);
          setHistorico(res.historico);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, colaborador]);

  if (!colaborador) return null;

  const statusInfo = evaluateRecebimentoStatus(colaborador);
  const totalEntregas = Math.max(statusInfo.totalEntregas, entregas.length);
  const ultimaDataDisplay = entregas[0]
    ? formatDateTimeBR(entregas[0].dataHoraEntrega, entregas[0].dataEntrega)
    : formatDateTimeBR(colaborador.ultimaEntregaDataHora, colaborador.ultimaEntregaData);

  const handleReturn = async () => {
    if (!canMarkDelivery || !statusInfo.jaRecebeu) return;
    setBusy(true);
    setActionError(null);
    try {
      await marcarDevolucaoColetor(user, { colaboradorHash: colaborador.cpfHash });
      const res = await fetchColaboradorTimeline(user, colaborador.cpfHash);
      setEntregas(res.entregas);
      setHistorico(res.historico);
      if (onRefresh) await onRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao registrar devolução.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteCadastro) return;
    setBusy(true);
    setActionError(null);
    try {
      await excluirColaboradorCompleto(user, colaborador);
      if (onRefresh) await onRefresh();
      if (onDeleted) onDeleted();
      else onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Erro ao excluir colaborador.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ficha-colaborador-titulo"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-3xl w-full overflow-hidden my-6">
        {/* Cabeçalho */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0">
              <UserRound className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="ficha-colaborador-titulo" className="text-lg font-bold text-slate-900 truncate">
                {colaborador.nome}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 mt-0.5">
                <span className="font-mono-tabular">{colaborador.cpfMascarado}</span>
                <span aria-hidden="true">·</span>
                <span>{getCentroCusto(colaborador)}</span>
                <span aria-hidden="true">·</span>
                <span>{colaborador.funcao}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={statusInfo.status} />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Fechar ficha individual"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Resumo Objetivo */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {actionError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {confirmDelete && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-3">
              <div className="flex items-start gap-2.5">
                <Trash2 className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="text-xs text-rose-900">
                  <strong>Confirmar exclusão completa deste CPF?</strong> Todo o cadastro, entregas, histórico e vínculos em ações serão excluídos permanentemente.
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
                >
                  {busy ? 'Excluindo...' : 'Excluir tudo do CPF'}
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-xs font-medium text-slate-500">Situação Atual</div>
              <div className="mt-1.5">
                <StatusBadge status={statusInfo.status} />
              </div>
              {statusInfo.totalDevolucoes > 0 && (
                <div className="text-[11px] text-cyan-800 font-mono-tabular mt-1.5">
                  Devoluções: {statusInfo.totalDevolucoes}
                  {statusInfo.ultimaDevolucaoData
                    ? ` (última ${formatDateTimeBR(
                        statusInfo.ultimaDevolucaoDataHora,
                        statusInfo.ultimaDevolucaoData
                      )})`
                    : ''}
                </div>
              )}
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-xs font-medium text-slate-500">Registros de Entrega</div>
              <div className="text-2xl font-bold text-slate-900 font-mono-tabular mt-1">
                {totalEntregas}
              </div>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-xs font-medium text-slate-500">Última Entrega</div>
              <div className="text-sm font-semibold text-slate-900 font-mono-tabular mt-1.5">
                {totalEntregas > 0 ? ultimaDataDisplay : 'Nunca recebeu'}
              </div>
            </div>
          </div>

          {/* Histórico das ações em que recebeu coletor */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-teal-600" />
                Histórico de Entregas de Coletor ({entregas.length})
              </h3>
              <div className="flex items-center gap-2">
                {canMarkDelivery && statusInfo.jaRecebeu && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleReturn}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {busy ? 'Registrando...' : 'Marcar devolução'}
                  </button>
                )}
                {canMarkDelivery && onMarcarRecebido && (
                  <button
                    type="button"
                    onClick={() => onMarcarRecebido(colaborador)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
                  >
                    MARCAR COMO RECEBIDO
                  </button>
                )}
                {canDeleteCadastro && !confirmDelete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir cadastro
                  </button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 rounded-lg">
                Carregando histórico permanente pelo CPF...
              </div>
            ) : entregas.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500 border border-slate-200 rounded-lg bg-slate-50/60">
                Este colaborador ainda não possui nenhum recebimento de coletor registrado.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Data / Hora</th>
                      <th className="px-3.5 py-2.5">Empresa</th>
                      <th className="px-3.5 py-2.5">Unidade</th>
                      <th className="px-3.5 py-2.5">Ação</th>
                      <th className="px-3.5 py-2.5">Responsável</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {entregas.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/70">
                        <td className="px-3.5 py-2.5 font-mono-tabular text-slate-900 whitespace-nowrap">
                          {formatDateTimeBR(e.dataHoraEntrega, e.dataEntrega)}
                        </td>
                        <td className="px-3.5 py-2.5 text-slate-700">{e.empresaNome}</td>
                        <td className="px-3.5 py-2.5 text-slate-700">{e.unidadeNome}</td>
                        <td className="px-3.5 py-2.5 font-medium text-slate-900">{e.acaoNome}</td>
                        <td className="px-3.5 py-2.5 text-slate-600">{e.responsavelNome}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Movimentações cadastrais & histórico geral */}
          {historico.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-500" />
                Registro Permanente de Movimentações ({historico.length})
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {historico.map((h) => (
                  <div
                    key={h.id}
                    className={`px-3.5 py-2.5 text-xs flex items-start justify-between gap-3 ${
                      h.tipo === 'DEVOLUCAO_COLETOR' ? 'bg-cyan-50/40' : ''
                    }`}
                  >
                    <div>
                      <div className="text-slate-800">{h.descricao}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {h.empresaNome || '—'} · {h.unidadeNome || '—'} · Registrado por {h.usuarioNome}
                      </div>
                    </div>
                    <span className="font-mono-tabular text-slate-500 whitespace-nowrap flex items-center gap-1 shrink-0">
                      <Calendar className="w-3 h-3" />
                      {formatDateBR(h.dataEvento)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

