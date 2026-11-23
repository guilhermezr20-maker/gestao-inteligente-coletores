import { useEffect, useMemo, useState } from 'react';
import { History, RotateCcw, Search, UserSearch } from 'lucide-react';
import { hashCpf, isValidCpf, normalizeCpf, normalizeName } from '../lib/cpf';
import {
  formatDateTimeBR,
  formatMesAno,
  getCentroCusto,
  MESES_PT_BR,
} from '../lib/coletorStatus';
import type { Acao, Colaborador, Empresa, Entrega, Unidade } from '../types/domain';

interface HistoricoEntregasViewProps {
  empresas: Empresa[];
  unidades: Unidade[];
  acoes: Acao[];
  colaboradores: Colaborador[];
  entregas: Entrega[];
  onOpenColaborador: (colaborador: Colaborador) => void;
}

export function HistoricoEntregasView({
  empresas,
  unidades,
  acoes,
  colaboradores,
  entregas,
  onOpenColaborador,
}: HistoricoEntregasViewProps) {
  const [empresaId, setEmpresaId] = useState('TODAS');
  const [unidadeId, setUnidadeId] = useState('TODAS');
  const [acaoId, setAcaoId] = useState('TODAS');
  const [mesFilter, setMesFilter] = useState('TODOS');
  const [anoFilter, setAnoFilter] = useState('TODOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [exactCpfHash, setExactCpfHash] = useState<string | null>(null);

  // Consulta rápida direta de Ficha Individual por CPF (inclusive para quem não aparece há anos)
  const [cpfDirectSearch, setCpfDirectSearch] = useState('');
  const [cpfDirectResult, setCpfDirectResult] = useState<{
    checked: boolean;
    found: Colaborador | null;
    error?: string;
  }>({ checked: false, found: null });

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

  const colabByHash = useMemo(
    () => new Map(colaboradores.map((c) => [c.cpfHash, c])),
    [colaboradores]
  );

  const acaoById = useMemo(() => new Map(acoes.map((a) => [a.id, a])), [acoes]);

  const availableUnidades = useMemo(() => {
    if (empresaId === 'TODAS') return unidades;
    return unidades.filter((u) => u.empresaId === empresaId);
  }, [unidades, empresaId]);

  const availableAcoes = useMemo(() => {
    return acoes.filter((a) => {
      if (empresaId !== 'TODAS' && a.empresaId !== empresaId) return false;
      if (unidadeId !== 'TODAS' && a.unidadeId !== unidadeId) return false;
      return true;
    });
  }, [acoes, empresaId, unidadeId]);

  const availableAnos = useMemo(() => {
    const years = new Set<number>();
    entregas.forEach((e) => years.add(Number(e.dataEntrega.slice(0, 4))));
    acoes.forEach((a) => years.add(a.anoReferencia));
    return Array.from(years)
      .filter((y) => !Number.isNaN(y) && y >= 2020)
      .sort((a, b) => b - a);
  }, [entregas, acoes]);

  const filteredEntregas = useMemo(() => {
    const qNorm = normalizeName(searchQuery);
    const digits = searchQuery.replace(/\D/g, '');

    return entregas.filter((e) => {
      if (empresaId !== 'TODAS' && e.empresaId !== empresaId) return false;
      if (unidadeId !== 'TODAS' && e.unidadeId !== unidadeId) return false;
      if (acaoId !== 'TODAS' && e.acaoId !== acaoId) return false;

      if (mesFilter !== 'TODOS' || anoFilter !== 'TODOS') {
        const acao = acaoById.get(e.acaoId);
        const mes = acao ? acao.mesReferencia : Number(e.dataEntrega.slice(5, 7));
        const ano = acao ? acao.anoReferencia : Number(e.dataEntrega.slice(0, 4));
        if (mesFilter !== 'TODOS' && mes !== Number(mesFilter)) return false;
        if (anoFilter !== 'TODOS' && ano !== Number(anoFilter)) return false;
      }

      if (!searchQuery.trim()) return true;
      if (exactCpfHash && e.colaboradorHash === exactCpfHash) return true;

      const matchName = normalizeName(e.colaboradorNome).includes(qNorm);
      const matchAcao = normalizeName(e.acaoNome).includes(qNorm);
      const matchMask =
        digits.length >= 3 && e.cpfMascarado.replace(/\D/g, '').includes(digits);

      return matchName || matchAcao || matchMask;
    });
  }, [
    entregas,
    empresaId,
    unidadeId,
    acaoId,
    mesFilter,
    anoFilter,
    searchQuery,
    exactCpfHash,
    acaoById,
  ]);

  const handleConsultarCpf = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeCpf(cpfDirectSearch);
    if (!isValidCpf(clean)) {
      setCpfDirectResult({
        checked: true,
        found: null,
        error: 'Informe um CPF válido com 11 dígitos.',
      });
      return;
    }
    const hash = await hashCpf(clean);
    const colab = colabByHash.get(hash) || null;
    setCpfDirectResult({ checked: true, found: colab });
    if (colab) {
      onOpenColaborador(colab);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Histórico de Entregas
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Registro permanente de todas as entregas de coletores e consulta individual por CPF.
        </p>
      </div>

      {/* Consulta Rápida por CPF */}
      <form
        onSubmit={handleConsultarCpf}
        className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-end gap-3"
      >
        <div className="flex-1">
          <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
            <UserSearch className="w-3.5 h-3.5 text-teal-600" />
            Consultar Ficha Individual pelo CPF (histórico permanente mesmo fora das planilhas atuais)
          </label>
          <input
            type="text"
            value={cpfDirectSearch}
            onChange={(e) => {
              setCpfDirectSearch(e.target.value);
              if (cpfDirectResult.checked) setCpfDirectResult({ checked: false, found: null });
            }}
            placeholder="000.000.000-00"
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg whitespace-nowrap shrink-0 h-9.5"
        >
          Consultar CPF
        </button>

        {cpfDirectResult.checked && !cpfDirectResult.found && (
          <div className="text-xs font-medium text-amber-700 sm:pb-2">
            {cpfDirectResult.error || 'CPF não localizado na base histórica (NÃO RECEBEU).'}
          </div>
        )}
      </form>

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">Filtros do Histórico</span>
          <button
            type="button"
            onClick={() => {
              setEmpresaId('TODAS');
              setUnidadeId('TODAS');
              setAcaoId('TODAS');
              setMesFilter('TODOS');
              setAnoFilter('TODOS');
              setSearchQuery('');
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Empresa</label>
            <select
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                setUnidadeId('TODAS');
                setAcaoId('TODAS');
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="TODAS">Todas</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Unidade</label>
            <select
              value={unidadeId}
              onChange={(e) => {
                setUnidadeId(e.target.value);
                setAcaoId('TODAS');
              }}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="TODAS">Todas</option>
              {availableUnidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ação</label>
            <select
              value={acaoId}
              onChange={(e) => setAcaoId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="TODAS">Todas</option>
              {availableAcoes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} ({formatMesAno(a.mesReferencia, a.anoReferencia)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mês</label>
            <select
              value={mesFilter}
              onChange={(e) => setMesFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="TODOS">Todos</option>
              {MESES_PT_BR.map((m, idx) => (
                <option key={m} value={String(idx + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ano</label>
            <select
              value={anoFilter}
              onChange={(e) => setAnoFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="TODOS">Todos</option>
              {availableAnos.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Busca</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nome, CPF ou ação..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Entregas */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <History className="w-4 h-4 text-teal-600" />
            Entregas Registradas ({filteredEntregas.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Data / Hora</th>
                <th className="px-4 py-3">Colaborador</th>
                <th className="px-4 py-3">CPF</th>
                <th className="px-4 py-3">Centro de custo</th>
                <th className="px-4 py-3">Empresa / Unidade</th>
                <th className="px-4 py-3">Ação</th>
                <th className="px-4 py-3">Responsável</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEntregas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">
                    Nenhuma entrega registrada até o momento.
                  </td>
                </tr>
              ) : (
                filteredEntregas.map((e) => {
                  const colab = colabByHash.get(e.colaboradorHash);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-xs font-mono-tabular text-slate-800 whitespace-nowrap">
                        {formatDateTimeBR(e.dataHoraEntrega, e.dataEntrega)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {colab ? (
                          <button
                            type="button"
                            onClick={() => onOpenColaborador(colab)}
                            className="text-left hover:text-teal-700 hover:underline"
                          >
                            {e.colaboradorNome}
                          </button>
                        ) : (
                          e.colaboradorNome
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-slate-600">
                        {e.cpfMascarado}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{getCentroCusto(e)}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {e.empresaNome} · {e.unidadeNome}
                      </td>
                      <td className="px-4 py-3 text-slate-800">{e.acaoNome}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{e.responsavelNome}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
