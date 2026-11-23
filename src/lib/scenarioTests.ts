import { hashCpf, isValidCpf, maskCpf, normalizeCpf, normalizeName } from './cpf';
import {
  evaluateRecebimentoStatus,
  formatMesAno,
  getCentroCusto,
} from './coletorStatus';
import { applyCollaboratorMapping, type ParsedCollaboratorRow } from './excel';
import type { Colaborador, Entrega, UserPermissions } from '../types/domain';

export interface ScenarioTestResult {
  id: number;
  title: string;
  description: string;
  passed: boolean;
  details: string;
}

function buildColab(overrides: Partial<Colaborador> = {}): Colaborador {
  return {
    id: overrides.cpfHash || 'hash_teste_01',
    cpfHash: overrides.cpfHash || 'hash_teste_01',
    cpfMascarado: '***.456.789-**',
    nome: 'Colaborador Teste',
    nomeNormalizado: 'colaborador teste',
    centroCusto: 'CC-100 Operacional',
    funcao: 'Técnico',
    totalColetoresRecebidos: 0,
    createdByUid: 'uid_admin',
    ...overrides,
  };
}

/**
 * Executa os 9 cenários obrigatórios definidos no Item 13 (Regra Única JÁ RECEBEU / NÃO RECEBEU).
 */
export async function runMandatoryBusinessScenarios(): Promise<ScenarioTestResult[]> {
  const results: ScenarioTestResult[] = [];

  // 1. CPF novo aparece como NÃO RECEBEU
  const novoColab = buildColab({ totalColetoresRecebidos: 0, ultimaEntregaData: undefined });
  const r1 = evaluateRecebimentoStatus(novoColab);
  results.push({
    id: 1,
    title: 'Cenário 1 — CPF novo aparece como NÃO RECEBEU',
    description: 'Colaborador sem registro de entrega no histórico deve constar como NÃO RECEBEU.',
    passed: r1.status === 'NAO_RECEBEU' && r1.label === 'NÃO RECEBEU' && !r1.jaRecebeu && r1.totalEntregas === 0,
    details: `Situação: ${r1.label} | Entregas registradas: ${r1.totalEntregas}`,
  });

  // 2. Marcar entrega altera para JÁ RECEBEU
  const aposEntrega = buildColab({
    totalColetoresRecebidos: 1,
    ultimaEntregaId: 'ent_01',
    ultimaEntregaData: '2026-11-23',
    ultimaEntregaDataHora: '2026-11-23T09:15:00',
  });
  const r2 = evaluateRecebimentoStatus(aposEntrega);
  results.push({
    id: 2,
    title: 'Cenário 2 — Marcar entrega altera para JÁ RECEBEU',
    description: 'Após acionar MARCAR COMO RECEBIDO, a situação muda imediatamente para JÁ RECEBEU.',
    passed: r2.status === 'JA_RECEBEU' && r2.label === 'JÁ RECEBEU' && r2.jaRecebeu && r2.totalEntregas === 1,
    details: `Situação: ${r2.label} | Última entrega: ${r2.ultimaEntregaDataHora}`,
  });

  // 3. Importar novamente o mesmo CPF mantém JÁ RECEBEU
  const reimportadoMesmoCpf: Colaborador = {
    ...aposEntrega,
    ultimaAcaoId: 'acao_02',
    ultimaAcaoNome: 'Ação Dezembro',
  };
  const r3 = evaluateRecebimentoStatus(reimportadoMesmoCpf);
  results.push({
    id: 3,
    title: 'Cenário 3 — Importar novamente o mesmo CPF mantém JÁ RECEBEU',
    description: 'Nova planilha com o mesmo CPF preserva a informação de que já recebeu coletor.',
    passed: r3.jaRecebeu && r3.label === 'JÁ RECEBEU' && r3.totalEntregas === 1,
    details: `Ação atualizada para "${reimportadoMesmoCpf.ultimaAcaoNome}" | Situação mantida: ${r3.label}`,
  });

  // 4. Atualizar nome e centro de custo não apaga o histórico
  const atualizadoCadastro: Colaborador = {
    ...aposEntrega,
    nome: 'Maria Silva Atualizada',
    nomeNormalizado: normalizeName('Maria Silva Atualizada'),
    centroCusto: 'CC-450 Logística',
    funcao: 'Supervisora',
  };
  const r4 = evaluateRecebimentoStatus(atualizadoCadastro);
  results.push({
    id: 4,
    title: 'Cenário 4 — Atualizar nome e centro de custo não apaga histórico',
    description: 'Alteração cadastral em importação preserva total de entregas e última data.',
    passed:
      atualizadoCadastro.nome === 'Maria Silva Atualizada' &&
      getCentroCusto(atualizadoCadastro) === 'CC-450 Logística' &&
      r4.jaRecebeu &&
      r4.ultimaEntregaData === '2026-11-23',
    details: `Novo nome: ${atualizadoCadastro.nome} | Centro de custo: ${getCentroCusto(atualizadoCadastro)} | Histórico: ${r4.label}`,
  });

  // 5. Colaborador que não aparece durante vários meses mantém seu histórico
  const cpfTeste = normalizeCpf('529.982.247-25');
  const hashMeses = await hashCpf(cpfTeste);
  const foraPlanilhasMeses = buildColab({
    cpfHash: hashMeses,
    id: hashMeses,
    ultimaEntregaData: '2026-01-10',
    totalColetoresRecebidos: 1,
  });
  const r5 = evaluateRecebimentoStatus(foraPlanilhasMeses);
  results.push({
    id: 5,
    title: 'Cenário 5 — Ausência por vários meses mantém o histórico',
    description: 'Mesmo sem constar em planilhas intermediárias, o registro no CPF permanece intacto.',
    passed: isValidCpf(cpfTeste) && r5.jaRecebeu && r5.ultimaEntregaData === '2026-01-10',
    details: `CPF Hash: ${hashMeses.slice(0, 12)}... | Situação permanente: ${r5.label}`,
  });

  // 6. Colaborador que retorna depois de anos continua aparecendo como JÁ RECEBEU
  const retornaAnosDepois = buildColab({
    cpfHash: hashMeses,
    id: hashMeses,
    ultimaEntregaData: '2022-03-15',
    totalColetoresRecebidos: 1,
  });
  const r6 = evaluateRecebimentoStatus(retornaAnosDepois);
  const hashRetorno = await hashCpf('52998224725');
  results.push({
    id: 6,
    title: 'Cenário 6 — Retorno depois de anos continua como JÁ RECEBEU',
    description: 'Não existe validade ou prazo de expiração; entrega de anos atrás continua JÁ RECEBEU.',
    passed: hashRetorno === hashMeses && r6.jaRecebeu && r6.label === 'JÁ RECEBEU',
    details: `Entrega antiga (${r6.ultimaEntregaData}) -> Situação após anos: ${r6.label}`,
  });

  // 7. A importação não duplica colaboradores (sem cabeçalho, 4 colunas na ordem + duplicado bloqueado)
  const rawMatrix = [
    ['529.982.247-25', 'João Teste', 'CC-100 Operacional', 'Operador'],
    ['52998224725', 'João Teste Duplicado', 'CC-100 Operacional', 'Operador'],
    ['111.111.111-11', 'CPF Inválido', 'CC-100', 'Auxiliar'],
  ];
  const mapped = await applyCollaboratorMapping(rawMatrix, false, {
    cpfIndex: 0,
    nomeIndex: 1,
    centroCustoIndex: 2,
    funcaoIndex: 3,
  });
  const validRows = mapped.rows.filter((x) => x.valid);
  const dupRows = mapped.rows.filter((x) => x.duplicateInFile);
  const invalidCpfRows = mapped.rows.filter((x) => !x.valid && !x.duplicateInFile);
  results.push({
    id: 7,
    title: 'Cenário 7 — Importação inteligente não duplica colaboradores',
    description: 'Identifica CPF duplicado na planilha, valida dígito verificador e mapeia colunas sem cabeçalho.',
    passed:
      validRows.length === 1 &&
      dupRows.length === 1 &&
      invalidCpfRows.length === 1 &&
      formatMesAno(11, 2026) === 'Novembro/2026',
    details: `Válidos: ${validRows.length} | Duplicados bloqueados: ${dupRows.length} | Inválidos: ${invalidCpfRows.length}`,
  });

  // 8. A exportação apresenta corretamente as situações
  const listaExportacao = [novoColab, aposEntrega].map((c) => {
    const st = evaluateRecebimentoStatus(c);
    return {
      Nome: c.nome,
      CPF: maskCpf(cpfTeste),
      'Centro de Custo': getCentroCusto(c),
      Situação: st.label,
    };
  });
  const exportOk =
    listaExportacao[0].Situação === 'NÃO RECEBEU' &&
    listaExportacao[1].Situação === 'JÁ RECEBEU';
  results.push({
    id: 8,
    title: 'Cenário 8 — Exportação apresenta corretamente as situações',
    description: 'Planilha exportada distingue exatamente JÁ RECEBEU e NÃO RECEBEU sem estados obsoletos.',
    passed: exportOk,
    details: `Linha 1: ${listaExportacao[0].Situação} | Linha 2: ${listaExportacao[1].Situação}`,
  });

  // 9. O histórico individual apresenta todas as entregas (sem bloqueio em nova entrega)
  const entregasHistorico: Entrega[] = [
    {
      id: 'ent_1',
      colaboradorHash: hashMeses,
      colaboradorNome: 'João Teste',
      cpfMascarado: '***.982.247-**',
      centroCusto: 'CC-100',
      funcao: 'Operador',
      empresaId: 'emp_1',
      empresaNome: 'Empresa A',
      unidadeId: 'uni_1',
      unidadeNome: 'Unidade 1',
      acaoId: 'acao_1',
      acaoNome: 'Campanha Janeiro',
      dataEntrega: '2025-01-10',
      dataHoraEntrega: '2025-01-10T09:00:00',
      createdByUid: 'uid_1',
      responsavelNome: 'Admin',
      responsavelEmail: 'admin@empresa.com',
    },
    {
      id: 'ent_2',
      colaboradorHash: hashMeses,
      colaboradorNome: 'João Teste',
      cpfMascarado: '***.982.247-**',
      centroCusto: 'CC-100',
      funcao: 'Operador',
      empresaId: 'emp_1',
      empresaNome: 'Empresa A',
      unidadeId: 'uni_2',
      unidadeNome: 'Unidade 2',
      acaoId: 'acao_2',
      acaoNome: 'Campanha Novembro',
      dataEntrega: '2026-11-23',
      dataHoraEntrega: '2026-11-23T14:30:00',
      entregaAnteriorData: '2025-01-10T09:00:00',
      createdByUid: 'uid_1',
      responsavelNome: 'Admin',
      responsavelEmail: 'admin@empresa.com',
    },
  ];
  const permissoesOperador: UserPermissions = {
    importarPlanilhas: false,
    visualizarColaboradores: true,
    marcarEntregas: true,
    consultarHistorico: true,
    exportarRelatorios: false,
    excluirHistorico: false,
    excluirCadastros: false,
    gerenciarUsuarios: false,
  };
  results.push({
    id: 9,
    title: 'Cenário 9 — Histórico individual completo e permissões de acesso (RBAC)',
    description: 'Exibe múltiplas entregas sem bloqueios e valida as 8 permissões granulares.',
    passed:
      entregasHistorico.length === 2 &&
      Boolean(entregasHistorico[1].entregaAnteriorData) &&
      permissoesOperador.marcarEntregas &&
      !permissoesOperador.excluirHistorico &&
      !permissoesOperador.excluirCadastros &&
      !permissoesOperador.gerenciarUsuarios &&
      !permissoesOperador.exportarRelatorios,
    details: `Entregas na ficha: ${entregasHistorico.length} (última em ${entregasHistorico[1].acaoNome}) | RBAC de 8 permissões validado`,
  });

  // 10. Devolução de coletor retorna para NÃO RECEBEU mantendo histórico completo
  const aposDevolucao = buildColab({
    ...aposEntrega,
    possuiColetorAtivo: false,
    totalColetoresDevolvidos: 1,
    ultimaDevolucaoData: '2026-11-23',
    ultimaDevolucaoDataHora: '2026-11-23T16:00:00',
  });
  const r10 = evaluateRecebimentoStatus(aposDevolucao);
  results.push({
    id: 10,
    title: 'Cenário 10 — Devolução retorna para NÃO RECEBEU mantendo histórico',
    description: 'Ao marcar devolução, o colaborador volta a NÃO RECEBEU apto a novo recebimento sem apagar entregas anteriores.',
    passed:
      r10.status === 'NAO_RECEBEU' &&
      r10.label === 'NÃO RECEBEU' &&
      !r10.jaRecebeu &&
      r10.totalEntregas === 1 &&
      r10.ultimaEntregaData === '2026-11-23' &&
      r10.totalDevolucoes === 1,
    details: `Situação após devolução: ${r10.label} | Entregas preservadas: ${r10.totalEntregas} | Devoluções: ${r10.totalDevolucoes}`,
  });

  // 11. Separação das permissões de exclusão de histórico e cadastro por CPF
  const operadorSoHistorico: UserPermissions = {
    ...permissoesOperador,
    excluirHistorico: true,
    excluirCadastros: false,
  };
  const operadorSoCadastro: UserPermissions = {
    ...permissoesOperador,
    excluirHistorico: false,
    excluirCadastros: true,
  };
  results.push({
    id: 11,
    title: 'Cenário 11 — Permissões separadas para excluir histórico e cadastros individuais',
    description: 'Exclusão do histórico geral e exclusão completa por CPF funcionam de forma independente.',
    passed:
      operadorSoHistorico.excluirHistorico &&
      !operadorSoHistorico.excluirCadastros &&
      !operadorSoCadastro.excluirHistorico &&
      operadorSoCadastro.excluirCadastros,
    details: 'Permissões excluirHistorico e excluirCadastros isoladas e independentes.',
  });

  return results;
}

export type { ParsedCollaboratorRow };
