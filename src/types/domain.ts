export type UserRole = 'admin' | 'operador';

export interface UserPermissions {
  importarPlanilhas: boolean;
  visualizarColaboradores: boolean;
  marcarEntregas: boolean;
  consultarHistorico: boolean;
  exportarRelatorios: boolean;
  excluirHistorico: boolean;
  excluirCadastros: boolean;
  gerenciarUsuarios: boolean;
}

export type PermissionKey = keyof UserPermissions;

export const PERMISSION_DEFINITIONS: Array<{
  key: PermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'importarPlanilhas',
    label: 'Importar planilhas',
    description: 'Enviar arquivos Excel (.xlsx), mapear colunas e gravar colaboradores por ação.',
  },
  {
    key: 'visualizarColaboradores',
    label: 'Visualizar colaboradores',
    description: 'Acessar o controle de coletores, filtros de recebimento e ficha individual por CPF.',
  },
  {
    key: 'marcarEntregas',
    label: 'Marcar entregas e devoluções',
    description: 'Registrar entregas ("MARCAR COMO RECEBIDO") e devoluções de coletores.',
  },
  {
    key: 'consultarHistorico',
    label: 'Consultar histórico',
    description: 'Visualizar o histórico permanente de entregas por colaborador, unidade e ação.',
  },
  {
    key: 'exportarRelatorios',
    label: 'Exportar relatórios',
    description: 'Visualizar indicadores e exportar listas e históricos para Excel (.xlsx).',
  },
  {
    key: 'excluirHistorico',
    label: 'Excluir histórico geral',
    description: 'Remover registros individuais ou limpar todo o histórico de entregas.',
  },
  {
    key: 'excluirCadastros',
    label: 'Excluir cadastros individuais',
    description: 'Excluir permanentemente o cadastro de um colaborador e todos os registros do CPF.',
  },
  {
    key: 'gerenciarUsuarios',
    label: 'Gerenciar usuários',
    description: 'Cadastrar usuários, definir permissões granulares e ativar ou desativar acessos.',
  },
];

export const ALL_ADMIN_PERMISSIONS: UserPermissions = {
  importarPlanilhas: true,
  visualizarColaboradores: true,
  marcarEntregas: true,
  consultarHistorico: true,
  exportarRelatorios: true,
  excluirHistorico: true,
  excluirCadastros: true,
  gerenciarUsuarios: true,
};

export const DEFAULT_OPERADOR_PERMISSIONS: UserPermissions = {
  importarPlanilhas: true,
  visualizarColaboradores: true,
  marcarEntregas: true,
  consultarHistorico: true,
  exportarRelatorios: true,
  excluirHistorico: false,
  excluirCadastros: false,
  gerenciarUsuarios: false,
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  permissions?: UserPermissions;
  createdByUid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserInvite {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  permissions: UserPermissions;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Empresa {
  id: string;
  nome: string;
  cnpj?: string;
  ativa: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Unidade {
  id: string;
  empresaId: string;
  empresaNome: string;
  nome: string;
  codigo?: string;
  cidade?: string;
  estado?: string;
  ativa: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Acao {
  id: string;
  empresaId: string;
  empresaNome: string;
  unidadeId: string;
  unidadeNome: string;
  nome: string;
  mesReferencia: number;
  anoReferencia: number;
  status: 'aberta' | 'concluida';
  totalColaboradores: number;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type RecebimentoStatus = 'JA_RECEBEU' | 'NAO_RECEBEU';

export interface ColaboradorStatusInfo {
  status: RecebimentoStatus;
  label: 'JÁ RECEBEU' | 'NÃO RECEBEU';
  jaRecebeu: boolean;
  totalEntregas: number;
  ultimaEntregaData: string | null;
  ultimaEntregaDataHora: string | null;
  totalDevolucoes: number;
  ultimaDevolucaoData: string | null;
  ultimaDevolucaoDataHora: string | null;
}

export interface Colaborador {
  id: string;
  cpfHash: string;
  cpfMascarado: string;
  nome: string;
  nomeNormalizado: string;
  centroCusto?: string;
  setor?: string;
  funcao: string;
  ultimaEmpresaId?: string;
  ultimaEmpresaNome?: string;
  ultimaUnidadeId?: string;
  ultimaUnidadeNome?: string;
  ultimaAcaoId?: string;
  ultimaAcaoNome?: string;
  ultimaEntregaId?: string;
  ultimaEntregaData?: string;
  ultimaEntregaDataHora?: string;
  possuiColetorAtivo?: boolean;
  ultimaDevolucaoData?: string;
  ultimaDevolucaoDataHora?: string;
  totalColetoresDevolvidos?: number;
  totalColetoresRecebidos: number;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type HistoricoTipo =
  | 'CADASTRO_INICIAL'
  | 'ATUALIZACAO_CADASTRAL'
  | 'PARTICIPACAO_ACAO'
  | 'ENTREGA_COLETOR'
  | 'DEVOLUCAO_COLETOR';

export interface ColaboradorHistorico {
  id: string;
  colaboradorHash: string;
  cpfMascarado: string;
  tipo: HistoricoTipo;
  descricao: string;
  empresaNome?: string;
  unidadeNome?: string;
  acaoId?: string;
  acaoNome?: string;
  mesReferencia?: number;
  anoReferencia?: number;
  dataEvento: string;
  createdByUid: string;
  usuarioNome: string;
  createdAt?: unknown;
}

export interface Importacao {
  id: string;
  fileHash: string;
  nomeArquivo: string;
  empresaId: string;
  empresaNome: string;
  unidadeId: string;
  unidadeNome: string;
  acaoId: string;
  acaoNome: string;
  mesReferencia: number;
  anoReferencia: number;
  totalLinhas: number;
  novosColaboradores?: number;
  atualizados?: number;
  errosCount?: number;
  duplicadosArquivo?: number;
  jaReceberamCount?: number;
  naoReceberamCount?: number;
  createdByUid: string;
  responsavelNome: string;
  responsavelEmail: string;
  createdAt?: unknown;
}

export interface ImportacaoItem {
  id: string;
  importacaoId: string;
  acaoId: string;
  acaoNome: string;
  empresaId: string;
  empresaNome: string;
  unidadeId: string;
  unidadeNome: string;
  mesReferencia: number;
  anoReferencia: number;
  colaboradorHash: string;
  colaboradorNome: string;
  cpfMascarado: string;
  centroCusto?: string;
  setor?: string;
  funcao: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Entrega {
  id: string;
  colaboradorHash: string;
  colaboradorNome: string;
  cpfMascarado: string;
  centroCusto?: string;
  setor?: string;
  funcao: string;
  empresaId: string;
  empresaNome: string;
  unidadeId: string;
  unidadeNome: string;
  acaoId: string;
  acaoNome: string;
  dataEntrega: string;
  dataHoraEntrega: string;
  entregaAnteriorData?: string;
  createdByUid: string;
  responsavelNome: string;
  responsavelEmail: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AuditoriaLog {
  id: string;
  tipo: string;
  entidade: string;
  entidadeId: string;
  descricao: string;
  createdByUid: string;
  usuarioNome: string;
  usuarioEmail: string;
  createdAt?: unknown;
}

export type MenuKey =
  | 'dashboard'
  | 'importar'
  | 'controle'
  | 'historico'
  | 'relatorios'
  | 'configuracoes';
