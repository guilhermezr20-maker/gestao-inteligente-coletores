import React, { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MapPin,
  Upload,
} from 'lucide-react';
import {
  formatMesAno,
  getCentroCusto,
  MESES_PT_BR,
} from '../lib/coletorStatus';
import {
  applyCollaboratorMapping,
  downloadTemplateExcel,
  inspectCollaboratorExcel,
  type CollaboratorColumnMapping,
  type InspectedCollaboratorWorkbook,
} from '../lib/excel';
import {
  commitCollaboratorImport,
  createOrGetAcao,
  createOrGetEmpresa,
  createOrGetUnidade,
  previewCollaboratorImport,
  type CollaboratorImportPreview,
} from '../lib/firestoreService';
import type { Empresa, Unidade } from '../types/domain';
import { StatusBadge } from './StatusBadge';

interface ImportarPlanilhaViewProps {
  user: User;
  empresas: Empresa[];
  unidades: Unidade[];
  onImportSuccess: (acaoId: string) => Promise<void>;
}

export function ImportarPlanilhaView({
  user,
  empresas,
  unidades,
  onImportSuccess,
}: ImportarPlanilhaViewProps) {
  const now = new Date();
  const [empresaModo, setEmpresaModo] = useState<'existente' | 'nova'>(
    empresas.length > 0 ? 'existente' : 'nova'
  );
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id || '');
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');

  const [unidadeModo, setUnidadeModo] = useState<'existente' | 'nova'>('nova');
  const [unidadeId, setUnidadeId] = useState('');
  const [novaUnidadeNome, setNovaUnidadeNome] = useState('');

  const [acaoNome, setAcaoNome] = useState('');
  const [mesReferencia, setMesReferencia] = useState<number>(now.getMonth() + 1);
  const [anoReferencia, setAnoReferencia] = useState<number>(now.getFullYear());

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [inspected, setInspected] = useState<InspectedCollaboratorWorkbook | null>(null);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [mapping, setMapping] = useState<CollaboratorColumnMapping>({
    cpfIndex: 0,
    nomeIndex: 1,
    centroCustoIndex: 2,
    funcaoIndex: 3,
  });

  const [preview, setPreview] = useState<CollaboratorImportPreview | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const unidadesDaEmpresa = useMemo(() => {
    if (empresaModo === 'nova' || !empresaId) return [];
    return unidades.filter((u) => u.empresaId === empresaId);
  }, [unidades, empresaId, empresaModo]);

  const effectiveUnidadeModo =
    empresaModo === 'nova' || unidadesDaEmpresa.length === 0 ? 'nova' : unidadeModo;

  const handleInspectFile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (empresaModo === 'existente' && !empresaId) {
      setError('Selecione uma empresa ou cadastre uma nova.');
      return;
    }
    if (empresaModo === 'nova' && !novaEmpresaNome.trim()) {
      setError('Informe o nome da empresa.');
      return;
    }
    if (effectiveUnidadeModo === 'existente' && !unidadeId) {
      setError('Selecione uma unidade ou cadastre uma nova.');
      return;
    }
    if (effectiveUnidadeModo === 'nova' && !novaUnidadeNome.trim()) {
      setError('Informe o nome da unidade.');
      return;
    }
    if (!acaoNome.trim()) {
      setError('Informe a identificação da ação ou campanha.');
      return;
    }
    if (!selectedFile) {
      setError('Selecione uma planilha Excel (.xlsx) para continuar.');
      return;
    }

    setLoading(true);
    try {
      const workbookInfo = await inspectCollaboratorExcel(selectedFile);
      setInspected(workbookInfo);
      setHasHeader(workbookInfo.hasHeaderDetected);
      setMapping(workbookInfo.suggestedMapping);
      setPreview(null);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler o arquivo Excel.');
    } finally {
      setLoading(false);
    }
  };

  const sampleRowsPreview = useMemo(() => {
    if (!inspected) return [];
    const start = hasHeader ? 1 : 0;
    return inspected.rawMatrix.slice(start, start + 3);
  }, [inspected, hasHeader]);

  const handleToggleHeader = (checked: boolean) => {
    setHasHeader(checked);
    if (!checked) {
      setMapping({
        cpfIndex: 0,
        nomeIndex: 1,
        centroCustoIndex: 2,
        funcaoIndex: 3,
      });
    } else if (inspected) {
      setMapping(inspected.suggestedMapping);
    }
  };

  const resolveContextEntities = async () => {
    const empresa =
      empresaModo === 'existente'
        ? empresas.find((x) => x.id === empresaId)!
        : await createOrGetEmpresa(user, novaEmpresaNome);

    const unidade =
      effectiveUnidadeModo === 'existente' && empresaModo === 'existente'
        ? unidades.find((x) => x.id === unidadeId)!
        : await createOrGetUnidade(user, {
            empresaId: empresa.id,
            empresaNome: empresa.nome,
            nome: novaUnidadeNome,
          });

    const acao = await createOrGetAcao(user, {
      empresaId: empresa.id,
      empresaNome: empresa.nome,
      unidadeId: unidade.id,
      unidadeNome: unidade.nome,
      nome: acaoNome,
      mesReferencia,
      anoReferencia,
    });

    return { empresa, unidade, acao };
  };

  const handleGeneratePreview = async () => {
    if (!inspected) return;
    setError(null);
    setLoading(true);
    try {
      const applied = await applyCollaboratorMapping(inspected.rawMatrix, hasHeader, mapping);
      if (applied.mappingError) {
        setError(applied.mappingError);
        return;
      }
      if (applied.rows.length === 0) {
        setError('Nenhuma linha preenchida encontrada após o mapeamento.');
        return;
      }

      const { acao } = await resolveContextEntities();
      const previewRes = await previewCollaboratorImport(
        user,
        acao.id,
        inspected.fileHash,
        applied.rows
      );
      setPreview(previewRes);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao gerar prévia da importação.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!preview || !selectedFile) return;
    setError(null);
    setLoading(true);
    try {
      const { empresa, unidade, acao } = await resolveContextEntities();
      await commitCollaboratorImport(user, {
        nomeArquivo: selectedFile.name,
        empresa,
        unidade,
        acao,
        mesReferencia,
        anoReferencia,
        preview,
      });
      setSuccessMsg(
        `Importação confirmada: ${preview.items.length} colaboradores vinculados à ação "${acao.nome}" (${formatMesAno(mesReferencia, anoReferencia)}).`
      );
      await onImportSuccess(acao.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar importação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Importar Planilha</h1>
          <p className="text-sm text-slate-500 mt-1">
            Envie a planilha de colaboradores (.xlsx), selecione as colunas correspondentes e confira quem já recebeu coletor antes de salvar.
          </p>
        </div>

        <button
          type="button"
          onClick={downloadTemplateExcel}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-teal-600" />
          Baixar modelo Excel
        </button>
      </div>

      {/* Indicador de Etapas */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`px-3 py-1.5 rounded-lg font-medium ${
            step === 1
              ? 'bg-teal-700 text-white'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          1. Identificação e Arquivo
        </span>
        <span className="text-slate-300">/</span>
        <span
          className={`px-3 py-1.5 rounded-lg font-medium ${
            step === 2
              ? 'bg-teal-700 text-white'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          2. Seleção das Colunas
        </span>
        <span className="text-slate-300">/</span>
        <span
          className={`px-3 py-1.5 rounded-lg font-medium ${
            step === 3
              ? 'bg-teal-700 text-white'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          3. Prévia e Confirmação
        </span>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ETAPA 1 */}
      {step === 1 && (
        <form
          onSubmit={handleInspectFile}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Empresa */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-teal-600" />
                  Empresa *
                </label>
                {empresas.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setEmpresaModo((m) => (m === 'existente' ? 'nova' : 'existente'))
                    }
                    className="text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    {empresaModo === 'existente' ? '+ Nova empresa' : 'Selecionar existente'}
                  </button>
                )}
              </div>

              {empresaModo === 'existente' && empresas.length > 0 ? (
                <select
                  value={empresaId}
                  onChange={(e) => {
                    setEmpresaId(e.target.value);
                    setUnidadeId('');
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {empresas.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={novaEmpresaNome}
                  onChange={(e) => setNovaEmpresaNome(e.target.value)}
                  placeholder="Ex.: Empresa Cliente Ltda"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              )}
            </div>

            {/* Unidade */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-teal-600" />
                  Unidade *
                </label>
                {empresaModo === 'existente' && unidadesDaEmpresa.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setUnidadeModo((m) => (m === 'existente' ? 'nova' : 'existente'))
                    }
                    className="text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    {effectiveUnidadeModo === 'existente' ? '+ Nova unidade' : 'Selecionar existente'}
                  </button>
                )}
              </div>

              {effectiveUnidadeModo === 'existente' && unidadesDaEmpresa.length > 0 ? (
                <select
                  value={unidadeId || unidadesDaEmpresa[0]?.id || ''}
                  onChange={(e) => setUnidadeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {unidadesDaEmpresa.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  required
                  value={novaUnidadeNome}
                  onChange={(e) => setNovaUnidadeNome(e.target.value)}
                  placeholder="Ex.: Matriz São Luís"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              )}
            </div>

            {/* Ação */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Identificação da Ação / Campanha *
              </label>
              <input
                type="text"
                required
                value={acaoNome}
                onChange={(e) => setAcaoNome(e.target.value)}
                placeholder="Ex.: Ação Coleta Novembro"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            {/* Mês por extenso e Ano */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Mês de Referência *
                </label>
                <select
                  value={mesReferencia}
                  onChange={(e) => setMesReferencia(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  {MESES_PT_BR.map((nome, idx) => (
                    <option key={nome} value={idx + 1}>
                      {nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ano *</label>
                <input
                  type="number"
                  min={2020}
                  max={2100}
                  required
                  value={anoReferencia}
                  onChange={(e) => setAnoReferencia(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Arquivo Excel */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Arquivo Excel (.xlsx, .xls ou .csv) — Padrão esperado: 1. CPF · 2. Nome · 3. Centro de Custo · 4. Função
            </label>
            <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/70 hover:bg-teal-50/30 hover:border-teal-300 cursor-pointer transition-colors">
              <Upload className="w-6 h-6 text-teal-600" />
              <span className="text-sm font-medium text-slate-800">
                {selectedFile ? selectedFile.name : 'Clique para selecionar a planilha Excel'}
              </span>
              <span className="text-xs text-slate-500">
                Na próxima etapa você poderá selecionar manualmente as colunas ou usar a ordem padrão 1–4.
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
            >
              <span>{loading ? 'Lendo planilha...' : 'Avançar para seleção das colunas'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* ETAPA 2: Mapeamento Manual / Padrão sem Cabeçalho */}
      {step === 2 && inspected && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-teal-600" />
                Seleção de Colunas ({inspected.fileName})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Aba "{inspected.sheetName}" · Aproximadamente {inspected.totalDataRowsEstimate} linhas encontradas.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => handleToggleHeader(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-600"
              />
              A primeira linha contém cabeçalhos (se desmarcar, usa colunas 1 a 4 na ordem)
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                1. Coluna do CPF *
              </label>
              <select
                value={mapping.cpfIndex}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, cpfIndex: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {inspected.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.headerText}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                2. Coluna do Nome *
              </label>
              <select
                value={mapping.nomeIndex}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, nomeIndex: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {inspected.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.headerText}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                3. Coluna de Centro de Custo *
              </label>
              <select
                value={mapping.centroCustoIndex}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, centroCustoIndex: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {inspected.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.headerText}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                4. Coluna da Função *
              </label>
              <select
                value={mapping.funcaoIndex}
                onChange={(e) =>
                  setMapping((m) => ({ ...m, funcaoIndex: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
              >
                {inspected.columns.map((c) => (
                  <option key={c.index} value={c.index}>
                    {c.headerText}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amostra das 3 primeiras linhas com o mapeamento atual */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Amostra da leitura com o mapeamento selecionado (3 primeiras linhas)
            </div>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">CPF</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Centro de Custo</th>
                    <th className="px-3 py-2">Função</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sampleRowsPreview.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-mono-tabular text-slate-800">
                        {String(r[mapping.cpfIndex] ?? '—')}
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        {String(r[mapping.nomeIndex] ?? '—')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {String(r[mapping.centroCustoIndex] ?? '—')}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {String(r[mapping.funcaoIndex] ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleGeneratePreview}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
            >
              <span>{loading ? 'Validando CPFs...' : 'Conferir prévia antes de salvar'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ETAPA 3: Prévia e Confirmação */}
      {step === 3 && preview && (
        <div className="space-y-5">
          {preview.duplicateFileAlreadyImported && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>Planilha já importada anteriormente nesta ação.</strong> Para evitar duplicidade, a gravação foi bloqueada. Utilize o controle de coletores para consultar os colaboradores já importados.
              </div>
            </div>
          )}

          {/* Resumo da Prévia */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Válidos</div>
              <div className="text-2xl font-bold font-mono-tabular text-slate-900 mt-1">
                {preview.stats.totalValid}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Novos CPFs</div>
              <div className="text-2xl font-bold font-mono-tabular text-cyan-700 mt-1">
                {preview.stats.novos}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Já Receberam</div>
              <div className="text-2xl font-bold font-mono-tabular text-emerald-700 mt-1">
                {preview.stats.jaReceberam}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Não Receberam</div>
              <div className="text-2xl font-bold font-mono-tabular text-amber-700 mt-1">
                {preview.stats.naoReceberam}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Atualiz. Cadastro</div>
              <div className="text-2xl font-bold font-mono-tabular text-slate-800 mt-1">
                {preview.stats.atualizacoesCadastrais}
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Erros / Duplicados</div>
              <div className="text-2xl font-bold font-mono-tabular text-rose-700 mt-1">
                {preview.stats.erros + preview.stats.duplicadosNoArquivo}
              </div>
            </div>
          </div>

          {/* Lista de Erros & Duplicidades */}
          {preview.invalidRows.length > 0 && (
            <div className="bg-white border border-rose-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-rose-50 border-b border-rose-200 text-xs font-semibold text-rose-900">
                Linhas ignoradas por CPF inválido, duplicidade ou campo obrigatório vazio ({preview.invalidRows.length})
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-rose-100">
                {preview.invalidRows.map((inv, idx) => (
                  <div key={idx} className="px-5 py-2.5 text-xs flex items-center justify-between gap-4">
                    <span className="font-mono-tabular text-slate-700">
                      Linha {inv.rowNumber} · CPF: {inv.cpfRaw || '—'} · {inv.nome || 'Sem nome'}
                    </span>
                    <span className="font-medium text-rose-700">{inv.errorReason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabela de Prévia dos Válidos */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900">
                Prévia dos Colaboradores Válidos ({preview.items.length})
              </span>
              <span className="text-xs text-slate-500">
                {acaoNome} · {formatMesAno(mesReferencia, anoReferencia)}
              </span>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Nome</th>
                    <th className="px-4 py-2.5">CPF</th>
                    <th className="px-4 py-2.5">Centro de Custo</th>
                    <th className="px-4 py-2.5">Função</th>
                    <th className="px-4 py-2.5">Cadastro</th>
                    <th className="px-4 py-2.5">Situação Atual no CPF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.items.map((item) => (
                    <tr key={item.row.cpfHash} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{item.row.nome}</td>
                      <td className="px-4 py-2.5 font-mono-tabular text-slate-600">
                        {item.row.cpfMascarado}
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{item.row.centroCusto}</td>
                      <td className="px-4 py-2.5 text-slate-700">{item.row.funcao}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {item.isNew ? (
                          <span className="text-cyan-700 font-medium">Novo CPF</span>
                        ) : item.hasCadastralChanges ? (
                          <span title={item.cadastralDiffs.join(' | ')} className="text-amber-700 font-medium">
                            Atualizar dados (histórico preservado)
                          </span>
                        ) : (
                          <span>Existente ({getCentroCusto(item.existingColaborador)})</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={item.recebimento.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button
              type="button"
              disabled={loading}
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4" />
              Ajustar colunas
            </button>
            <button
              type="button"
              disabled={loading || preview.duplicateFileAlreadyImported || preview.items.length === 0}
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Salvando importação...' : 'Confirmar Importação'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
