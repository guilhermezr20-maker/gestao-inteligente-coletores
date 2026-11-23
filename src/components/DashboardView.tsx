import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, FileSpreadsheet, PackageCheck, RotateCcw, Users } from 'lucide-react';
import {
  evaluateRecebimentoStatus,
  formatDateTimeBR,
  formatMesAno,
  MESES_PT_BR,
} from '../lib/coletorStatus';
import type {
  Acao,
  Colaborador,
  Empresa,
  Entrega,
  ImportacaoItem,
  MenuKey,
  Unidade,
} from '../types/domain';

interface DashboardViewProps {
  empresas: Empresa[];
  unidades: Unidade[];
  acoes: Acao[];
  colaboradores: Colaborador[];
  entregas: Entrega[];
  importacaoItens: ImportacaoItem[];
  onNavigate: (menu: MenuKey) => void;
  canImport: boolean;
  canViewControle: boolean;
}

export function DashboardView({
  empresas,
  unidades,
  acoes,
  colaboradores,
  entregas,
  importacaoItens,
  onNavigate,
  canImport,
  canViewControle,
}: DashboardViewProps) {
  const [empresaId, setEmpresaId] = useState('TODAS');
  const [unidadeId, setUnidadeId] = useState('TODAS');
  const [acaoId, setAcaoId] = useState('TODAS');
  const [mesFilter, setMesFilter] = useState('TODOS');
  const [anoFilter, setAnoFilter] = useState('TODOS');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  const availableUnidades = useMemo(() => {
    if (empresaId === 'TODAS') return unidades;
    return unidades.filter((u) => u.empresaId === empresaId);
  }, [unidades, empresaId]);

  const availableAcoes = useMemo(() => {
    return acoes.filter((a) => {
      if (empresaId !== 'TODAS' && a.empresaId !== empresaId) return false;
      if (unidadeId !== 'TODAS' && a.unidadeId !== unidadeId) return false;
      if (mesFilter !== 'TODOS' && a.mesReferencia !== Number(mesFilter)) return false;
      if (anoFilter !== 'TODOS' && a.anoReferencia !== Number(anoFilter)) return false;
      return true;
    });
  }, [acoes, empresaId, unidadeId, mesFilter, anoFilter]);

  const availableAnos = useMemo(() => {
    const years = new Set<number>();
    acoes.forEach((a) => years.add(a.anoReferencia));
    entregas.forEach((e) => years.add(Number(e.dataEntrega.slice(0, 4))));
    return Array.from(years)
      .filter((y) => !Number.isNaN(y) && y >= 2020)
      .sort((a, b) => b - a);
  }, [acoes, entregas]);

  const hasFiltersActive =
    empresaId !== 'TODAS' ||
    unidadeId !== 'TODAS' ||
    acaoId !== 'TODAS' ||
    mesFilter !== 'TODOS' ||
    anoFilter !== 'TODOS' ||
    Boolean(dataInicio) ||
    Boolean(dataFim);

  const metrics = useMemo(() => {
    const colabByHash = new Map(colaboradores.map((c) => [c.cpfHash, c]));
    const acaoById = new Map(acoes.map((a) => [a.id, a]));

    // Quando há filtro de empresa/unidade/ação/mês/ano aplicado, analisamos os colaboradores vinculados às ações filtradas;
    // quando não há filtro, exibimos o universo completo de colaboradores importados.
    let targetColabs: Colaborador[];
    if (
      empresaId === 'TODAS' &&
      unidadeId === 'TODAS' &&
      acaoId === 'TODAS' &&
      mesFilter === 'TODOS' &&
      anoFilter === 'TODOS'
    ) {
      targetColabs = colaboradores;
    } else {
      const matchingAcaoIds = new Set(availableAcoes.map((a) => a.id));
      const matchingHashes = new Set<string>();
      importacaoItens.forEach((item) => {
        if (acaoId !== 'TODAS' && item.acaoId !== acaoId) return;
        if (acaoId === 'TODAS' && !matchingAcaoIds.has(item.acaoId)) return;
        matchingHashes.add(item.colaboradorHash);
      });
      targetColabs = Array.from(matchingHashes)
        .map((h) => colabByHash.get(h))
        .filter((c): c is Colaborador => Boolean(c));
    }

    let jaReceberam = 0;
    let naoReceberam = 0;
    targetColabs.forEach((c) => {
      if (evaluateRecebimentoStatus(c).jaRecebeu) jaReceberam++;
      else naoReceberam++;
    });

    const filteredEntregas = entregas.filter((e) => {
      if (empresaId !== 'TODAS' && e.empresaId !== empresaId) return false;
      if (unidadeId !== 'TODAS' && e.unidadeId !== unidadeId) return false;
      if (acaoId !== 'TODAS' && e.acaoId !== acaoId) return false;
      if (dataInicio && e.dataEntrega < dataInicio) return false;
      if (dataFim && e.dataEntrega > dataFim) return false;

      if (mesFilter !== 'TODOS' || anoFilter !== 'TODOS') {
        const acao = acaoById.get(e.acaoId);
        const mesEntrega = acao ? acao.mesReferencia : Number(e.dataEntrega.slice(5, 7));
        const anoEntrega = acao ? acao.anoReferencia : Number(e.dataEntrega.slice(0, 4));
        if (mesFilter !== 'TODOS' && mesEntrega !== Number(mesFilter)) return false;
        if (anoFilter !== 'TODOS' && anoEntrega !== Number(anoFilter)) return false;
      }
      return true;
    });

    return {
      totalColaboradores: targetColabs.length,
      jaReceberam,
      naoReceberam,
      totalEntregas: filteredEntregas.length,
      recentEntregas: filteredEntregas.slice(0, 8),
    };
  }, [
    colaboradores,
    acoes,
    entregas,
    importacaoItens,
    availableAcoes,
    empresaId,
    unidadeId,
    acaoId,
    mesFilter,
    anoFilter,
    dataInicio,
    dataFim,
  ]);

  const handleClearFilters = () => {
    setEmpresaId('TODAS');
    setUnidadeId('TODAS');
    setAcaoId('TODAS');
    setMesFilter('TODOS');
    setAnoFilter('TODOS');
    setDataInicio('');
    setDataFim('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visão direta de quem já recebeu coletor e quem ainda não recebeu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canImport && (
            <button
              type="button"
              onClick={() => onNavigate('importar')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Importar planilha
            </button>
          )}
          {canViewControle && (
            <button
              type="button"
              onClick={() => onNavigate('controle')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <PackageCheck className="w-4 h-4 text-teal-600" />
              Controle de coletores
            </button>
          )}
        </div>
      </div>

      {/* Filtros por empresa, unidade, ação e período */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700">
            Filtros por Empresa, Unidade, Ação e Período
          </span>
          {hasFiltersActive && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
              <option value="TODAS">Todas as empresas</option>
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
              <option value="TODAS">Todas as unidades</option>
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
              <option value="TODAS">Todas as ações</option>
              {availableAcoes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} ({formatMesAno(a.mesReferencia, a.anoReferencia)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Mês</label>
              <select
                value={mesFilter}
                onChange={(e) => setMesFilter(e.target.value)}
                className="w-full px-2.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="TODOS">Todos</option>
                {MESES_PT_BR.map((nome, idx) => (
                  <option key={nome} value={String(idx + 1)}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ano</label>
              <select
                value={anoFilter}
                onChange={(e) => setAnoFilter(e.target.value)}
                className="w-full px-2.5 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                <option value="TODOS">Todos</option>
                {availableAnos.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Entrega — Data início</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Entrega — Data fim</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* 4 Indicadores Essenciais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total de colaboradores importados</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900 font-mono-tabular mt-2">
            {metrics.totalColaboradores}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700">
            <span>Já receberam coletor</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-3xl font-bold text-emerald-700 font-mono-tabular mt-2">
            {metrics.jaReceberam}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-amber-700">
            <span>Ainda não receberam</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-3xl font-bold text-amber-700 font-mono-tabular mt-2">
            {metrics.naoReceberam}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-cyan-800">
            <span>Total de entregas registradas</span>
            <PackageCheck className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="text-3xl font-bold text-slate-900 font-mono-tabular mt-2">
            {metrics.totalEntregas}
          </div>
        </div>
      </div>

      {/* Estado inicial limpo quando base está vazia */}
      {colaboradores.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
          <FileSpreadsheet className="w-10 h-10 text-teal-600 mx-auto" />
          <h2 className="text-base font-semibold text-slate-900">
            Base limpa e pronta para utilização
          </h2>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Importe uma planilha Excel (.xlsx) com CPF, Nome, Centro de Custo e Função para iniciar o controle permanente de entregas.
          </p>
          {canImport && (
            <button
              type="button"
              onClick={() => onNavigate('importar')}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Importar primeira planilha
            </button>
          )}
        </div>
      ) : (
        /* Últimas entregas registradas no período */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Últimas Entregas Registradas ({metrics.recentEntregas.length})
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('historico')}
              className="text-xs font-medium text-teal-700 hover:text-teal-800"
            >
              Ver histórico completo
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Data / Hora</th>
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3">CPF</th>
                  <th className="px-4 py-3">Unidade / Ação</th>
                  <th className="px-4 py-3">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.recentEntregas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                      Nenhuma entrega registrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  metrics.recentEntregas.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-xs font-mono-tabular text-slate-700 whitespace-nowrap">
                        {formatDateTimeBR(e.dataHoraEntrega, e.dataEntrega)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{e.colaboradorNome}</td>
                      <td className="px-4 py-3 font-mono-tabular text-xs text-slate-600">
                        {e.cpfMascarado}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {e.unidadeNome} · {e.acaoNome}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{e.responsavelNome}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
