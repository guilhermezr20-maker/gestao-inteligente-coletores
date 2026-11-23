import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  PackageCheck,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { hashCpf, normalizeCpf, normalizeName } from '../lib/cpf';
import {
  evaluateRecebimentoStatus,
  formatDateTimeBR,
  formatMesAno,
  getCentroCusto,
} from '../lib/coletorStatus';
import {
  excluirColaboradorCompleto,
  excluirLoteColaboradores,
  marcarColetorRecebido,
  marcarDevolucaoColetor,
  marcarLoteComoRecebido,
  marcarLoteDevolucao,
} from '../lib/firestoreService';
import type { Acao, Colaborador, ImportacaoItem } from '../types/domain';
import { StatusBadge } from './StatusBadge';

interface ControleColetoresViewProps {
  user: User;
  acoes: Acao[];
  colaboradores: Colaborador[];
  importacaoItens: ImportacaoItem[];
  initialAcaoId?: string;
  canMarkDelivery: boolean;
  canDeleteCadastro: boolean;
  onRefresh: () => Promise<void>;
  onOpenColaborador: (colaborador: Colaborador) => void;
}

type StatusFilter = 'TODOS' | 'JA_RECEBEU' | 'NAO_RECEBEU';

interface RowViewModel {
  colaborador: Colaborador;
  nome: string;
  cpfMascarado: string;
  centroCusto: string;
  funcao: string;
  statusInfo: ReturnType<typeof evaluateRecebimentoStatus>;
  acaoContext: {
    empresaId: string;
    empresaNome: string;
    unidadeId: string;
    unidadeNome: string;
    acaoId: string;
    acaoNome: string;
  } | null;
}

export function ControleColetoresView({
  user,
  acoes,
  colaboradores,
  importacaoItens,
  initialAcaoId,
  canMarkDelivery,
  canDeleteCadastro,
  onRefresh,
  onOpenColaborador,
}: ControleColetoresViewProps) {
  const [selectedAcaoId, setSelectedAcaoId] = useState<string>(
    initialAcaoId || (acoes[0]?.id ?? 'TODAS')
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [exactCpfHash, setExactCpfHash] = useState<string | null>(null);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

  const [pendingConfirmRows, setPendingConfirmRows] = useState<RowViewModel[] | null>(null);
  const [pendingReturnState, setPendingReturnState] = useState<{
    rows: RowViewModel[];
    ignoredCount: number;
  } | null>(null);
  const [pendingDeleteRows, setPendingDeleteRows] = useState<RowViewModel[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (initialAcaoId) {
      setSelectedAcaoId(initialAcaoId);
    }
  }, [initialAcaoId]);

  useEffect(() => {
    const clean = normalizeCpf(searchQuery);
    if (clean.length === 11) {
      let active = true;
      hashCpf(clean).then((h) => {
        if (active) setExactCpfHash(h);
      });
      return () => {
        active = false;
      };
    }
    setExactCpfHash(null);
  }, [searchQuery]);

  const selectedAcao = useMemo(
    () => acoes.find((a) => a.id === selectedAcaoId) || null,
    [acoes, selectedAcaoId]
  );

  const rows: RowViewModel[] = useMemo(() => {
    const colabMap = new Map(colaboradores.map((c) => [c.cpfHash, c]));
    const acaoMap = new Map(acoes.map((a) => [a.id, a]));

    if (selectedAcaoId !== 'TODAS' && selectedAcao) {
      const items = importacaoItens.filter((i) => i.acaoId === selectedAcao.id);
      return items
        .map<RowViewModel | null>((item) => {
          const colab = colabMap.get(item.colaboradorHash);
          if (!colab) return null;
          return {
            colaborador: colab,
            nome: colab.nome || item.colaboradorNome,
            cpfMascarado: colab.cpfMascarado || item.cpfMascarado,
            centroCusto: getCentroCusto(colab),
            funcao: colab.funcao || item.funcao,
            statusInfo: evaluateRecebimentoStatus(colab),
            acaoContext: {
              empresaId: selectedAcao.empresaId,
              empresaNome: selectedAcao.empresaNome,
              unidadeId: selectedAcao.unidadeId,
              unidadeNome: selectedAcao.unidadeNome,
              acaoId: selectedAcao.id,
              acaoNome: selectedAcao.nome,
            },
          };
        })
        .filter((x): x is RowViewModel => x !== null)
        .sort((a, b) => a.nome.localeCompare(b.nome));
    }

    return colaboradores
      .map((colab) => {
        const linkedAcao =
          (colab.ultimaAcaoId ? acaoMap.get(colab.ultimaAcaoId) : undefined) || acoes[0] || null;
        return {
          colaborador: colab,
          nome: colab.nome,
          cpfMascarado: colab.cpfMascarado,
          centroCusto: getCentroCusto(colab),
          funcao: colab.funcao,
          statusInfo: evaluateRecebimentoStatus(colab),
          acaoContext: linkedAcao
            ? {
                empresaId: linkedAcao.empresaId,
                empresaNome: linkedAcao.empresaNome,
                unidadeId: linkedAcao.unidadeId,
                unidadeNome: linkedAcao.unidadeNome,
                acaoId: linkedAcao.id,
                acaoNome: linkedAcao.nome,
              }
            : null,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [colaboradores, importacaoItens, acoes, selectedAcaoId, selectedAcao]);

  const counts = useMemo(() => {
    let ja = 0;
    let nao = 0;
    rows.forEach((r) => {
      if (r.statusInfo.jaRecebeu) ja++;
      else nao++;
    });
    return { total: rows.length, ja, nao };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const qNorm = normalizeName(searchQuery);
    const digits = searchQuery.replace(/\D/g, '');

    return rows.filter((r) => {
      if (statusFilter === 'JA_RECEBEU' && !r.statusInfo.jaRecebeu) return false;
      if (statusFilter === 'NAO_RECEBEU' && r.statusInfo.jaRecebeu) return false;

      if (!searchQuery.trim()) return true;
      if (exactCpfHash && r.colaborador.cpfHash === exactCpfHash) return true;

      const matchName = normalizeName(r.nome).includes(qNorm);
      const matchCC = normalizeName(r.centroCusto).includes(qNorm);
      const matchFunc = normalizeName(r.funcao).includes(qNorm);
      const matchMask =
        digits.length >= 3 && r.cpfMascarado.replace(/\D/g, '').includes(digits);

      return matchName || matchCC || matchFunc || matchMask;
    });
  }, [rows, statusFilter, searchQuery, exactCpfHash]);

  const selectedRows = useMemo(
    () => filteredRows.filter((r) => selectedHashes.has(r.colaborador.cpfHash)),
    [filteredRows, selectedHashes]
  );

  const selectedReturnableRows = useMemo(
    () => selectedRows.filter((r) => r.statusInfo.jaRecebeu),
    [selectedRows]
  );

  const canShowSelection = canMarkDelivery || canDeleteCadastro;

  const toggleSelect = (hash: string) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (selectedRows.length === filteredRows.length && filteredRows.length > 0) {
      setSelectedHashes(new Set());
    } else {
      setSelectedHashes(new Set(filteredRows.map((r) => r.colaborador.cpfHash)));
    }
  };

  const executeMarkReceived = async (targets: RowViewModel[]) => {
    const validTargets = targets.filter((t) => Boolean(t.acaoContext));
    if (validTargets.length === 0) {
      setFeedback({
        type: 'err',
        text: 'Nenhuma ação vinculada encontrada para registrar a entrega. Importe uma planilha antes de registrar entregas.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      if (validTargets.length === 1) {
        const target = validTargets[0];
        await marcarColetorRecebido(user, {
          colaboradorHash: target.colaborador.cpfHash,
          ...target.acaoContext!,
        });
        setFeedback({
          type: 'ok',
          text: `Entrega registrada para ${target.nome}. Situação atualizada para JÁ RECEBEU.`,
        });
      } else {
        const res = await marcarLoteComoRecebido(
          user,
          validTargets.map((t) => ({
            colaboradorHash: t.colaborador.cpfHash,
            ...t.acaoContext!,
          }))
        );
        setFeedback({
          type: res.erros.length === 0 ? 'ok' : 'err',
          text:
            res.erros.length === 0
              ? `${res.sucesso} entregas registradas com sucesso. Situações atualizadas para JÁ RECEBEU.`
              : `${res.sucesso} entregas registradas e ${res.erros.length} falharam.`,
        });
      }

      setSelectedHashes(new Set());
      setPendingConfirmRows(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao marcar entrega.',
      });
    } finally {
      setSaving(false);
    }
  };

  const requestMarkReceived = (targets: RowViewModel[]) => {
    if (!canMarkDelivery || targets.length === 0) return;
    const anyAlreadyReceived = targets.some((t) => t.statusInfo.jaRecebeu);
    if (anyAlreadyReceived) {
      // Não bloqueia! Sinaliza claramente que já existe recebimento anterior para evitar marcações acidentais.
      setPendingConfirmRows(targets);
      return;
    }
    executeMarkReceived(targets);
  };

  const executeReturn = async (targets: RowViewModel[]) => {
    if (!canMarkDelivery) return;
    const validTargets = targets.filter((t) => t.statusInfo.jaRecebeu);
    if (validTargets.length === 0) {
      setPendingReturnState(null);
      setFeedback({
        type: 'err',
        text: 'Nenhum dos colaboradores selecionados possui coletor marcado como JÁ RECEBEU.',
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      if (validTargets.length === 1) {
        const target = validTargets[0];
        await marcarDevolucaoColetor(user, {
          colaboradorHash: target.colaborador.cpfHash,
          empresaNome: target.acaoContext?.empresaNome,
          unidadeNome: target.acaoContext?.unidadeNome,
          acaoId: target.acaoContext?.acaoId,
          acaoNome: target.acaoContext?.acaoNome,
        });
        setFeedback({
          type: 'ok',
          text: `Devolução registrada para ${target.nome}. A situação retornou para NÃO RECEBEU mantendo o histórico completo.`,
        });
      } else {
        const res = await marcarLoteDevolucao(
          user,
          validTargets.map((target) => ({
            colaboradorHash: target.colaborador.cpfHash,
            empresaNome: target.acaoContext?.empresaNome,
            unidadeNome: target.acaoContext?.unidadeNome,
            acaoId: target.acaoContext?.acaoId,
            acaoNome: target.acaoContext?.acaoNome,
          }))
        );
        setFeedback({
          type: res.erros.length === 0 ? 'ok' : 'err',
          text:
            res.erros.length === 0
              ? `${res.sucesso} devoluções registradas com sucesso. As situações retornaram para NÃO RECEBEU mantendo o histórico completo.`
              : `${res.sucesso} devoluções registradas e ${res.erros.length} falharam.`,
        });
      }

      setSelectedHashes(new Set());
      setPendingReturnState(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao registrar devolução.',
      });
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteColaboradores = async (targets: RowViewModel[]) => {
    if (!canDeleteCadastro || targets.length === 0) return;
    setSaving(true);
    setFeedback(null);
    try {
      if (targets.length === 1) {
        const target = targets[0];
        await excluirColaboradorCompleto(user, target.colaborador);
        setSelectedHashes((prev) => {
          const next = new Set(prev);
          next.delete(target.colaborador.cpfHash);
          return next;
        });
        setFeedback({
          type: 'ok',
          text: `Cadastro de ${target.nome} (${target.cpfMascarado}) e todos os registros vinculados ao CPF foram excluídos permanentemente.`,
        });
      } else {
        const res = await excluirLoteColaboradores(
          user,
          targets.map((t) => t.colaborador)
        );
        const failedHashes = new Set(res.erros.map((e) => e.hash));
        setSelectedHashes((prev) => {
          const next = new Set(prev);
          targets.forEach((t) => {
            if (!failedHashes.has(t.colaborador.cpfHash)) {
              next.delete(t.colaborador.cpfHash);
            }
          });
          return next;
        });
        setFeedback({
          type: res.erros.length === 0 ? 'ok' : 'err',
          text:
            res.erros.length === 0
              ? `${res.sucesso} cadastros excluídos permanentemente com todos os registros vinculados aos respectivos CPFs.`
              : `${res.sucesso} cadastros excluídos e ${res.erros.length} falharam.`,
        });
      }

      setPendingDeleteRows(null);
      await onRefresh();
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao excluir cadastro do colaborador.',
      });
    } finally {
      setSaving(false);
    }
  };

  const alreadyReceivedInPending = useMemo(
    () => (pendingConfirmRows ? pendingConfirmRows.filter((r) => r.statusInfo.jaRecebeu) : []),
    [pendingConfirmRows]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Controle de Coletores
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Confira pelo CPF quem já recebeu coletor e quem ainda não recebeu, registre entregas, devoluções ou gerencie cadastros.
          </p>
        </div>

        {canShowSelection && selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {canMarkDelivery && selectedReturnableRows.length > 0 && (
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  setPendingReturnState({
                    rows: selectedReturnableRows,
                    ignoredCount: selectedRows.length - selectedReturnableRows.length,
                  })
                }
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                Marcar devolução ({selectedReturnableRows.length})
              </button>
            )}

            {canMarkDelivery && (
              <button
                type="button"
                disabled={saving}
                onClick={() => requestMarkReceived(selectedRows)}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <PackageCheck className="w-4 h-4" />
                MARCAR COMO RECEBIDO ({selectedRows.length})
              </button>
            )}

            {canDeleteCadastro && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setPendingDeleteRows(selectedRows)}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Excluir ({selectedRows.length})
              </button>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center gap-2.5 ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Barra de Seleção de Ação, Filtros de Situação e Pesquisa */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-5">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ação / Lista de Colaboradores
            </label>
            <select
              value={selectedAcaoId}
              onChange={(e) => {
                setSelectedAcaoId(e.target.value);
                setSelectedHashes(new Set());
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="TODAS">Todos os colaboradores cadastrados (Base Geral)</option>
              {acoes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} — {a.unidadeNome} ({formatMesAno(a.mesReferencia, a.anoReferencia)})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-7">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Pesquisar por Nome ou CPF (aceita CPF completo para consulta direta)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Digite nome, CPF completo (11 dígitos), centro de custo ou função..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Filtros: Todos / Já receberam / Não receberam */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => setStatusFilter('TODOS')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              statusFilter === 'TODOS'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Todos (<span className="font-mono-tabular">{counts.total}</span>)
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('JA_RECEBEU')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              statusFilter === 'JA_RECEBEU'
                ? 'bg-emerald-700 text-white border-emerald-700'
                : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
            }`}
          >
            Já receberam (<span className="font-mono-tabular">{counts.ja}</span>)
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('NAO_RECEBEU')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
              statusFilter === 'NAO_RECEBEU'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
            }`}
          >
            Não receberam (<span className="font-mono-tabular">{counts.nao}</span>)
          </button>
        </div>
      </div>

      {/* Tabela Principal */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
              <tr>
                {canShowSelection && (
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        filteredRows.length > 0 && selectedRows.length === filteredRows.length
                      }
                      onChange={toggleSelectAllVisible}
                      aria-label="Selecionar todos visíveis"
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                    />
                  </th>
                )}
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Centro de custo</th>
                <th className="px-4 py-3">Função</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Última entrega</th>
                <th className="px-4 py-3 text-right">Operação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={canShowSelection ? 8 : 7}
                    className="px-4 py-12 text-center text-sm text-slate-400"
                  >
                    {rows.length === 0
                      ? 'Nenhum colaborador encontrado. Importe uma planilha Excel na aba "Importar planilha".'
                      : 'Nenhum colaborador corresponde à busca ou ao filtro selecionado.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const checked = selectedHashes.has(row.colaborador.cpfHash);
                  const hasPriorDelivery = Boolean(row.statusInfo.ultimaEntregaData);
                  return (
                    <tr key={row.colaborador.cpfHash} className="hover:bg-slate-50/70">
                      {canShowSelection && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(row.colaborador.cpfHash)}
                            aria-label={`Selecionar ${row.nome}`}
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => onOpenColaborador(row.colaborador)}
                          className="text-left hover:text-teal-700 hover:underline"
                        >
                          {row.nome}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                        {row.cpfMascarado}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{row.centroCusto}</td>
                      <td className="px-4 py-3 text-slate-700">{row.funcao}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.statusInfo.status} />
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-slate-600 whitespace-nowrap">
                        <div>
                          {hasPriorDelivery
                            ? formatDateTimeBR(
                                row.statusInfo.ultimaEntregaDataHora,
                                row.statusInfo.ultimaEntregaData
                              )
                            : '—'}
                        </div>
                        {!row.statusInfo.jaRecebeu && row.statusInfo.ultimaDevolucaoData && (
                          <div className="text-[11px] text-cyan-700 mt-0.5">
                            Devolvido:{' '}
                            {formatDateTimeBR(
                              row.statusInfo.ultimaDevolucaoDataHora,
                              row.statusInfo.ultimaDevolucaoData
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onOpenColaborador(row.colaborador)}
                            title="Abrir ficha individual"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                            Ficha
                          </button>

                          {canMarkDelivery && row.statusInfo.jaRecebeu && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                setPendingReturnState({ rows: [row], ignoredCount: 0 })
                              }
                              title="Marcar devolução do coletor"
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-cyan-800 bg-cyan-50 border border-cyan-200 hover:bg-cyan-100 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Marcar devolução
                            </button>
                          )}

                          {canMarkDelivery && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => requestMarkReceived([row])}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {row.statusInfo.jaRecebeu ? 'Nova entrega' : 'MARCAR COMO RECEBIDO'}
                            </button>
                          )}

                          {canDeleteCadastro && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setPendingDeleteRows([row])}
                              title="Excluir cadastro individual por CPF"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Sinalização de Recebimento Anterior */}
      {pendingConfirmRows && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Recebimento anterior identificado
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {alreadyReceivedInPending.length === 1
                      ? 'Este colaborador já recebeu coletor anteriormente. Confirme se deseja registrar uma nova entrega mantendo o histórico completo.'
                      : `${alreadyReceivedInPending.length} colaboradores selecionados já receberam coletor anteriormente. Confirme para registrar uma nova entrega sem perder o histórico.`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingConfirmRows(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {alreadyReceivedInPending.map((r) => (
                <div
                  key={r.colaborador.cpfHash}
                  className="px-3.5 py-2.5 text-xs flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-medium text-slate-900">{r.nome}</div>
                    <div className="font-mono-tabular text-slate-500">{r.cpfMascarado}</div>
                  </div>
                  <div className="text-right font-mono-tabular text-slate-600">
                    Última:{' '}
                    {formatDateTimeBR(
                      r.statusInfo.ultimaEntregaDataHora,
                      r.statusInfo.ultimaEntregaData
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPendingConfirmRows(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => executeMarkReceived(pendingConfirmRows)}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
              >
                {saving ? 'Registrando...' : 'Confirmar entrega'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Devolução de Coletor (Individual ou em Lote) */}
      {pendingReturnState && pendingReturnState.rows.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <RotateCcw className="w-5 h-5 text-cyan-700 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {pendingReturnState.rows.length === 1
                      ? 'Confirmar devolução do coletor'
                      : `Confirmar devolução em lote (${pendingReturnState.rows.length})`}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {pendingReturnState.rows.length === 1 ? (
                      <>
                        A situação de <strong>{pendingReturnState.rows[0].nome}</strong> voltará
                        para <strong>NÃO RECEBEU</strong>, mantendo todas as entregas anteriores e
                        o registro desta devolução no histórico.
                      </>
                    ) : (
                      <>
                        A situação dos{' '}
                        <strong>{pendingReturnState.rows.length} colaboradores selecionados</strong>{' '}
                        voltará para <strong>NÃO RECEBEU</strong>, mantendo todas as entregas
                        anteriores e os registros de devolução no histórico.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingReturnState(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pendingReturnState.ignoredCount > 0 && (
              <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                {pendingReturnState.ignoredCount === 1
                  ? '1 colaborador selecionado já estava como NÃO RECEBEU e será ignorado.'
                  : `${pendingReturnState.ignoredCount} colaboradores selecionados já estavam como NÃO RECEBEU e serão ignorados.`}
              </div>
            )}

            {pendingReturnState.rows.length === 1 ? (
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-medium text-slate-900">
                  {pendingReturnState.rows[0].nome}
                </div>
                <div className="font-mono-tabular text-slate-600">
                  CPF: {pendingReturnState.rows[0].cpfMascarado}
                </div>
                <div className="font-mono-tabular text-slate-600">
                  Última entrega:{' '}
                  {formatDateTimeBR(
                    pendingReturnState.rows[0].statusInfo.ultimaEntregaDataHora,
                    pendingReturnState.rows[0].statusInfo.ultimaEntregaData
                  )}
                </div>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {pendingReturnState.rows.map((r) => (
                  <div
                    key={r.colaborador.cpfHash}
                    className="px-3.5 py-2.5 text-xs flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{r.nome}</div>
                      <div className="font-mono-tabular text-slate-500">{r.cpfMascarado}</div>
                    </div>
                    <div className="text-right font-mono-tabular text-slate-600">
                      Última:{' '}
                      {formatDateTimeBR(
                        r.statusInfo.ultimaEntregaDataHora,
                        r.statusInfo.ultimaEntregaData
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPendingReturnState(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => executeReturn(pendingReturnState.rows)}
                className="px-4 py-2 text-xs font-semibold text-white bg-cyan-700 hover:bg-cyan-800 rounded-lg disabled:opacity-50"
              >
                {saving
                  ? 'Registrando...'
                  : pendingReturnState.rows.length === 1
                    ? 'Confirmar devolução'
                    : `Confirmar ${pendingReturnState.rows.length} devoluções`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão Individual ou em Lote por CPF */}
      {pendingDeleteRows && pendingDeleteRows.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-rose-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Trash2 className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {pendingDeleteRows.length === 1
                      ? 'Excluir cadastro individual por CPF'
                      : `Excluir cadastros selecionados por CPF (${pendingDeleteRows.length})`}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {pendingDeleteRows.length === 1 ? (
                      <>
                        Esta ação removerá permanentemente o cadastro de{' '}
                        <strong>{pendingDeleteRows[0].nome}</strong>, todas as suas entregas,
                        histórico individual e vínculos com planilhas importadas.
                      </>
                    ) : (
                      <>
                        Esta ação removerá permanentemente os cadastros de{' '}
                        <strong>{pendingDeleteRows.length} colaboradores</strong>, todas as suas
                        entregas, históricos individuais e vínculos com planilhas importadas.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteRows(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pendingDeleteRows.length === 1 ? (
              <div className="p-3.5 rounded-lg bg-rose-50/60 border border-rose-200 text-xs space-y-1 text-rose-900">
                <div className="font-semibold">{pendingDeleteRows[0].nome}</div>
                <div className="font-mono-tabular">CPF: {pendingDeleteRows[0].cpfMascarado}</div>
                <div>
                  {pendingDeleteRows[0].centroCusto} · {pendingDeleteRows[0].funcao}
                </div>
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-rose-200 rounded-lg divide-y divide-rose-100 bg-rose-50/30">
                {pendingDeleteRows.map((r) => (
                  <div
                    key={r.colaborador.cpfHash}
                    className="px-3.5 py-2.5 text-xs flex items-center justify-between gap-3 text-rose-950"
                  >
                    <div>
                      <div className="font-semibold">{r.nome}</div>
                      <div className="font-mono-tabular text-rose-800/80">{r.cpfMascarado}</div>
                    </div>
                    <div className="text-right text-rose-800/80 truncate max-w-[200px]">
                      {r.centroCusto}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setPendingDeleteRows(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => executeDeleteColaboradores(pendingDeleteRows)}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50"
              >
                {saving
                  ? 'Excluindo...'
                  : pendingDeleteRows.length === 1
                    ? 'Excluir tudo deste CPF'
                    : `Excluir tudo de ${pendingDeleteRows.length} CPFs`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

