import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  PackageCheck,
  RotateCcw,
  Users,
} from 'lucide-react';
import {
  evaluateRecebimentoStatus,
  formatDateTimeBR,
  formatMesAno,
  getCentroCusto,
  MESES_PT_BR,
} from '../lib/coletorStatus';
import { exportRowsToExcel } from '../lib/excel';
import type { Acao, Colaborador, Empresa, Entrega, ImportacaoItem, Unidade } from '../types/domain';

interface RelatoriosViewProps {
  empresas: Empresa[];
  unidades: Unidade[];
  acoes: Acao[];
  colaboradores: Colaborador[];
  entregas: Entrega[];
  importacaoItens: ImportacaoItem[];
  canExport: boolean;
}

export function RelatoriosView({
  empresas,
  unidades,
  acoes,
  colaboradores,
  entregas,
  importacaoItens,
  canExport,
}: RelatoriosViewProps) {
  const [empresaId, setEmpresaId] = useState('TODAS');
  const [unidadeId, setUnidadeId] = useState('TODAS');
  const [acaoId, setAcaoId] = useState('TODAS');
  const [mesFilter, setMesFilter] = useState('TODOS');
  const [anoFilter, setAnoFilter] = useState('TODOS');

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

  const filteredData = useMemo(() => {
    const colabMap = new Map(colaboradores.map((c) => [c.cpfHash, c]));
    const acaoMap = new Map(acoes.map((a) => [a.id, a]));
    const hasFilter =
      empresaId !== 'TODAS' ||
      unidadeId !== 'TODAS' ||
      acaoId !== 'TODAS' ||
      mesFilter !== 'TODOS' ||
      anoFilter !== 'TODOS';

    let targetColabs: Colaborador[];
    if (!hasFilter) {
      targetColabs = colaboradores;
    } else {
      const matchingAcaoIds = new Set(availableAcoes.map((a) => a.id));
      const hashes = new Set<string>();
      importacaoItens.forEach((item) => {
        if (acaoId !== 'TODAS' && item.acaoId !== acaoId) return;
        if (acaoId === 'TODAS' && !matchingAcaoIds.has(item.acaoId)) return;
        hashes.add(item.colaboradorHash);
      });
      targetColabs = Array.from(hashes)
        .map((h) => colabMap.get(h))
        .filter((c): c is Colaborador => Boolean(c));
    }

    const jaReceberam = targetColabs.filter((c) => evaluateRecebimentoStatus(c).jaRecebeu);
    const naoReceberam = targetColabs.filter((c) => !evaluateRecebimentoStatus(c).jaRecebeu);

    const filteredEntregas = entregas.filter((e) => {
      if (empresaId !== 'TODAS' && e.empresaId !== empresaId) return false;
      if (unidadeId !== 'TODAS' && e.unidadeId !== unidadeId) return false;
      if (acaoId !== 'TODAS' && e.acaoId !== acaoId) return false;

      if (mesFilter !== 'TODOS' || anoFilter !== 'TODOS') {
        const acao = acaoMap.get(e.acaoId);
        const mes = acao ? acao.mesReferencia : Number(e.dataEntrega.slice(5, 7));
        const ano = acao ? acao.anoReferencia : Number(e.dataEntrega.slice(0, 4));
        if (mesFilter !== 'TODOS' && mes !== Number(mesFilter)) return false;
        if (anoFilter !== 'TODOS' && ano !== Number(anoFilter)) return false;
      }
      return true;
    });

    // Agrupamento por Unidade
    const porUnidadeMap = new Map<
      string,
      { empresa: string; unidade: string; totalEntregas: number; colaboradoresDistintos: Set<string> }
    >();
    filteredEntregas.forEach((e) => {
      const curr = porUnidadeMap.get(e.unidadeId) || {
        empresa: e.empresaNome,
        unidade: e.unidadeNome,
        totalEntregas: 0,
        colaboradoresDistintos: new Set<string>(),
      };
      curr.totalEntregas++;
      curr.colaboradoresDistintos.add(e.colaboradorHash);
      porUnidadeMap.set(e.unidadeId, curr);
    });

    // Agrupamento por Ação
    const porAcaoMap = new Map<
      string,
      {
        empresa: string;
        unidade: string;
        acao: string;
        periodo: string;
        totalEntregas: number;
        colaboradoresDistintos: Set<string>;
      }
    >();
    filteredEntregas.forEach((e) => {
      const a = acaoMap.get(e.acaoId);
      const curr = porAcaoMap.get(e.acaoId) || {
        empresa: e.empresaNome,
        unidade: e.unidadeNome,
        acao: e.acaoNome,
        periodo: a ? formatMesAno(a.mesReferencia, a.anoReferencia) : '—',
        totalEntregas: 0,
        colaboradoresDistintos: new Set<string>(),
      };
      curr.totalEntregas++;
      curr.colaboradoresDistintos.add(e.colaboradorHash);
      porAcaoMap.set(e.acaoId, curr);
    });

    return {
      targetColabs,
      jaReceberam,
      naoReceberam,
      filteredEntregas,
      porUnidade: Array.from(porUnidadeMap.values()).sort(
        (a, b) => b.totalEntregas - a.totalEntregas
      ),
      porAcao: Array.from(porAcaoMap.values()).sort(
        (a, b) => b.totalEntregas - a.totalEntregas
      ),
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
  ]);

  const mapColaboradorRow = (c: Colaborador) => {
    const st = evaluateRecebimentoStatus(c);
    return {
      Nome: c.nome,
      CPF: c.cpfMascarado,
      'Centro de Custo': getCentroCusto(c),
      Função: c.funcao,
      Situação: st.label,
      'Qtd. Entregas': st.totalEntregas,
      'Última Entrega': st.ultimaEntregaData
        ? formatDateTimeBR(st.ultimaEntregaDataHora, st.ultimaEntregaData)
        : '—',
      'Última Empresa': c.ultimaEmpresaNome || '—',
      'Última Unidade': c.ultimaUnidadeNome || '—',
      'Última Ação': c.ultimaAcaoNome || '—',
    };
  };

  const handleExport = (
    reportKey:
      | 'ja_receberam'
      | 'nao_receberam'
      | 'lista_completa'
      | 'historico_entregas'
      | 'por_unidade'
      | 'por_acao'
  ) => {
    if (!canExport) return;

    if (reportKey === 'ja_receberam') {
      exportRowsToExcel(
        'colaboradores_ja_receberam.xlsx',
        'Já Receberam',
        filteredData.jaReceberam.map(mapColaboradorRow)
      );
    } else if (reportKey === 'nao_receberam') {
      exportRowsToExcel(
        'colaboradores_nao_receberam.xlsx',
        'Não Receberam',
        filteredData.naoReceberam.map(mapColaboradorRow)
      );
    } else if (reportKey === 'lista_completa') {
      exportRowsToExcel(
        'colaboradores_lista_completa.xlsx',
        'Colaboradores',
        filteredData.targetColabs.map(mapColaboradorRow)
      );
    } else if (reportKey === 'historico_entregas') {
      exportRowsToExcel(
        'historico_entregas_coletores.xlsx',
        'Histórico de Entregas',
        filteredData.filteredEntregas.map((e) => ({
          'Data e Horário': formatDateTimeBR(e.dataHoraEntrega, e.dataEntrega),
          Nome: e.colaboradorNome,
          CPF: e.cpfMascarado,
          'Centro de Custo': getCentroCusto(e),
          Função: e.funcao,
          Empresa: e.empresaNome,
          Unidade: e.unidadeNome,
          Ação: e.acaoNome,
          Responsável: e.responsavelNome,
        }))
      );
    } else if (reportKey === 'por_unidade') {
      exportRowsToExcel(
        'entregas_por_unidade.xlsx',
        'Por Unidade',
        filteredData.porUnidade.map((u) => ({
          Empresa: u.empresa,
          Unidade: u.unidade,
          'Total de Entregas': u.totalEntregas,
          'Colaboradores Únicos': u.colaboradoresDistintos.size,
        }))
      );
    } else {
      exportRowsToExcel(
        'entregas_por_acao.xlsx',
        'Por Ação',
        filteredData.porAcao.map((a) => ({
          Empresa: a.empresa,
          Unidade: a.unidade,
          Ação: a.acao,
          Período: a.periodo,
          'Total de Entregas': a.totalEntregas,
          'Colaboradores Únicos': a.colaboradoresDistintos.size,
        }))
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Relatórios</h1>
        <p className="text-sm text-slate-500 mt-1">
          Exporte planilhas Excel organizadas por situação de recebimento, histórico, unidade e ação.
        </p>
      </div>

      {!canExport && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            Seu usuário não possui permissão para exportar planilhas Excel. Solicite a liberação em Configurações.
          </span>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">Filtros dos Relatórios</span>
          <button
            type="button"
            onClick={() => {
              setEmpresaId('TODAS');
              setUnidadeId('TODAS');
              setAcaoId('TODAS');
              setMesFilter('TODOS');
              setAnoFilter('TODOS');
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:text-teal-800"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar filtros
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
        </div>
      </div>

      {/* Os 6 Relatórios Exatos para Exportação Excel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 1. Colaboradores que já receberam */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-700">JÁ RECEBERAM</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Colaboradores que já receberam
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              CPFs com pelo menos um registro de entrega e data da última entrega.
            </p>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-3">
              {filteredData.jaReceberam.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!canExport || filteredData.jaReceberam.length === 0}
            onClick={() => handleExport('ja_receberam')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>

        {/* 2. Colaboradores que ainda não receberam */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-700">NÃO RECEBERAM</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Colaboradores que ainda não receberam
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              CPFs importados que ainda não possuem nenhum registro de entrega.
            </p>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-3">
              {filteredData.naoReceberam.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!canExport || filteredData.naoReceberam.length === 0}
            onClick={() => handleExport('nao_receberam')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>

        {/* 3. Lista completa de colaboradores */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">BASE CONSOLIDADA</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Lista completa de colaboradores
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Todos os colaboradores filtrados com CPF mascarado, Centro de custo e situação atual.
            </p>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-3">
              {filteredData.targetColabs.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!canExport || filteredData.targetColabs.length === 0}
            onClick={() => handleExport('lista_completa')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>

        {/* 4. Histórico de entregas */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">RASTREABILIDADE</span>
              <PackageCheck className="w-4 h-4 text-teal-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Histórico de entregas
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Registros individuais com data, horário, empresa, unidade, ação e responsável.
            </p>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-3">
              {filteredData.filteredEntregas.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!canExport || filteredData.filteredEntregas.length === 0}
            onClick={() => handleExport('historico_entregas')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>

        {/* 5. Entregas por unidade */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">AGRUPAMENTO</span>
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Entregas por unidade
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Total de coletores entregues e colaboradores únicos atendidos por unidade.
            </p>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-3">
              {filteredData.porUnidade.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!canExport || filteredData.porUnidade.length === 0}
            onClick={() => handleExport('por_unidade')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>

        {/* 6. Entregas por ação */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">CAMPANHAS</span>
              <FileSpreadsheet className="w-4 h-4 text-slate-400" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mt-1">
              Entregas por ação
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Resumo consolidado de entregas por ação, unidade e mês de referência.
            </p>
            <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-3">
              {filteredData.porAcao.length}
            </div>
          </div>
          <button
            type="button"
            disabled={!canExport || filteredData.porAcao.length === 0}
            onClick={() => handleExport('por_acao')}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-40"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar Excel
          </button>
        </div>
      </div>
    </div>
  );
}
