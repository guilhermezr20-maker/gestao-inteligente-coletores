import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { hashString } from './cpf';
import {
  db,
  handleFirestoreError,
  OperationType,
  provisionSecondaryAuthAccount,
} from './firebase';
import {
  evaluateRecebimentoStatus,
  formatDateTimeBR,
  formatMesAno,
  getCentroCusto,
  getNowDateTimeISO,
  getTodayISO,
} from './coletorStatus';
import type { ParsedCollaboratorRow } from './excel';
import {
  ALL_ADMIN_PERMISSIONS,
  DEFAULT_OPERADOR_PERMISSIONS,
  type Acao,
  type AuditoriaLog,
  type Colaborador,
  type ColaboradorHistorico,
  type ColaboradorStatusInfo,
  type Empresa,
  type Entrega,
  type Importacao,
  type ImportacaoItem,
  type Unidade,
  type UserInvite,
  type UserPermissions,
  type UserProfile,
  type UserRole,
} from '../types/domain';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'acoessmaranhao@gmail.com';

export function isBootstrappedEmail(email?: string | null): boolean {
  return (email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function stripUndefined<T extends object>(obj: T): T {
  const clean = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean as T;
}

export function resolveEffectivePermissions(profile: UserProfile): UserPermissions {
  const p = (profile.permissions || {}) as Record<string, boolean | undefined>;
  if (isBootstrappedEmail(profile.email) || profile.role === 'admin') {
    return {
      importarPlanilhas: Boolean(p.importarPlanilhas ?? p.importarPlanilha ?? ALL_ADMIN_PERMISSIONS.importarPlanilhas),
      visualizarColaboradores: Boolean(p.visualizarColaboradores ?? ALL_ADMIN_PERMISSIONS.visualizarColaboradores),
      marcarEntregas: Boolean(p.marcarEntregas ?? p.entregarColetores ?? ALL_ADMIN_PERMISSIONS.marcarEntregas),
      consultarHistorico: Boolean(p.consultarHistorico ?? ALL_ADMIN_PERMISSIONS.consultarHistorico),
      exportarRelatorios: Boolean(p.exportarRelatorios ?? ALL_ADMIN_PERMISSIONS.exportarRelatorios),
      gerenciarUsuarios: Boolean(p.gerenciarUsuarios ?? ALL_ADMIN_PERMISSIONS.gerenciarUsuarios),
    };
  }
  return {
    importarPlanilhas: Boolean(p.importarPlanilhas ?? p.importarPlanilha ?? DEFAULT_OPERADOR_PERMISSIONS.importarPlanilhas),
    visualizarColaboradores: Boolean(p.visualizarColaboradores ?? DEFAULT_OPERADOR_PERMISSIONS.visualizarColaboradores),
    marcarEntregas: Boolean(p.marcarEntregas ?? p.entregarColetores ?? DEFAULT_OPERADOR_PERMISSIONS.marcarEntregas),
    consultarHistorico: Boolean(p.consultarHistorico ?? DEFAULT_OPERADOR_PERMISSIONS.consultarHistorico),
    exportarRelatorios: Boolean(p.exportarRelatorios ?? DEFAULT_OPERADOR_PERMISSIONS.exportarRelatorios),
    gerenciarUsuarios: Boolean(p.gerenciarUsuarios ?? DEFAULT_OPERADOR_PERMISSIONS.gerenciarUsuarios),
  };
}

function buildListQuery(colName: string, user: User, extraConstraints: QueryConstraint[] = []) {
  const constraints: QueryConstraint[] = [...extraConstraints];
  if (!isBootstrappedEmail(user.email)) {
    constraints.push(where('createdByUid', '==', user.uid));
  }
  return query(collection(db, colName), ...constraints);
}

// ---------------------------------------------------------------------------
// Usuários, Convites & Autenticação
// ---------------------------------------------------------------------------

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as UserProfile;
      return {
        ...data,
        permissions: resolveEffectivePermissions(data),
      };
    }

    const cleanEmail = (user.email || 'usuario@sistema.local').toLowerCase();
    let invite: UserInvite | null = null;
    try {
      const emailHash = await hashString(cleanEmail);
      const invSnap = await getDoc(doc(db, 'user_invites', emailHash));
      if (invSnap.exists()) {
        invite = invSnap.data() as UserInvite;
      }
    } catch {
      invite = null;
    }

    const isBootstrapped = isBootstrappedEmail(user.email);
    const role: UserRole = isBootstrapped ? 'admin' : 'operador';
    const permissions: UserPermissions = isBootstrapped
      ? ALL_ADMIN_PERMISSIONS
      : invite?.permissions || DEFAULT_OPERADOR_PERMISSIONS;

    const profile: UserProfile = stripUndefined<UserProfile>({
      uid: user.uid,
      email: user.email || cleanEmail,
      displayName: invite?.displayName || user.displayName || user.email?.split('@')[0] || 'Usuário',
      role,
      active: invite ? invite.active : true,
      permissions,
      createdByUid: invite?.createdByUid || user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, profile);
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchUsersAndInvites(
  user: User,
  currentProfile: UserProfile
): Promise<{ users: UserProfile[]; invites: UserInvite[] }> {
  const effective = resolveEffectivePermissions(currentProfile);
  const canManage =
    isBootstrappedEmail(user.email) ||
    currentProfile.role === 'admin' ||
    effective.gerenciarUsuarios;

  if (!canManage) {
    return { users: [currentProfile], invites: [] };
  }

  try {
    const [usersSnap, invitesSnap] = await Promise.all([
      getDocs(buildListQuery('users', user)),
      getDocs(buildListQuery('user_invites', user)),
    ]);

    const usersMap = new Map<string, UserProfile>();
    usersSnap.docs.forEach((d) => {
      const u = d.data() as UserProfile;
      usersMap.set(u.uid, { ...u, permissions: resolveEffectivePermissions(u) });
    });
    if (!usersMap.has(currentProfile.uid)) {
      usersMap.set(currentProfile.uid, {
        ...currentProfile,
        permissions: resolveEffectivePermissions(currentProfile),
      });
    }

    const users = Array.from(usersMap.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
    const invites = invitesSnap.docs
      .map((d) => d.data() as UserInvite)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return { users, invites };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'users');
  }
}

export async function createManagedUser(
  adminUser: User,
  params: {
    displayName: string;
    email: string;
    password: string;
    active: boolean;
    permissions: UserPermissions;
  }
): Promise<{
  mode: 'auth_created' | 'invite_created';
  profile?: UserProfile;
  invite?: UserInvite;
  emailVerifiedSent?: boolean;
}> {
  const displayName = params.displayName.trim();
  const cleanEmail = params.email.trim().toLowerCase();
  const role: UserRole = params.permissions.gerenciarUsuarios ? 'admin' : 'operador';

  try {
    const { uid, emailVerifiedSent } = await provisionSecondaryAuthAccount({
      email: cleanEmail,
      password: params.password,
      displayName,
    });

    const profile: UserProfile = {
      uid,
      email: cleanEmail,
      displayName,
      role,
      active: params.active,
      permissions: params.permissions,
      createdByUid: adminUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'users', uid), profile);
    await registerAudit(
      adminUser,
      'USUARIO',
      'users',
      uid,
      `Usuário criado: ${displayName} (${cleanEmail}). Situação: ${params.active ? 'Ativo' : 'Inativo'}.`
    );

    return { mode: 'auth_created', profile, emailVerifiedSent };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/email-already-in-use') {
      throw new Error(
        'Este e-mail já está cadastrado no Firebase Authentication. Caso o usuário já tenha acessado, edite as permissões dele na lista abaixo.'
      );
    }
    if (code === 'auth/weak-password') {
      throw new Error('A senha inicial deve possuir pelo menos 6 caracteres.');
    }
    if (code === 'auth/invalid-email') {
      throw new Error('Formato de e-mail inválido.');
    }
    if (code === 'auth/operation-not-allowed') {
      const inviteId = await hashString(cleanEmail);
      const invite: UserInvite = {
        id: inviteId,
        email: cleanEmail,
        displayName,
        role,
        active: params.active,
        permissions: params.permissions,
        createdByUid: adminUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'user_invites', inviteId), invite);
      await registerAudit(
        adminUser,
        'USUARIO',
        'user_invites',
        inviteId,
        `Convite/pré-cadastro criado para ${displayName} (${cleanEmail}).`
      );
      return { mode: 'invite_created', invite };
    }
    throw err instanceof Error ? err : new Error('Não foi possível criar o usuário.');
  }
}

export async function updateManagedUser(
  adminUser: User,
  targetUser: UserProfile,
  updates: {
    displayName?: string;
    active?: boolean;
    permissions?: UserPermissions;
    role?: UserRole;
  }
): Promise<void> {
  if (isBootstrappedEmail(targetUser.email)) {
    throw new Error('O administrador principal do sistema não pode ser desativado ou alterado.');
  }
  const path = `users/${targetUser.uid}`;
  try {
    const nextPermissions = updates.permissions || resolveEffectivePermissions(targetUser);
    const nextRole: UserRole =
      updates.role || (nextPermissions.gerenciarUsuarios ? 'admin' : 'operador');

    await updateDoc(doc(db, 'users', targetUser.uid), {
      ...stripUndefined({
        displayName: updates.displayName?.trim(),
        active: updates.active,
        permissions: nextPermissions,
        role: nextRole,
      }),
      updatedAt: serverTimestamp(),
    });

    await registerAudit(
      adminUser,
      'USUARIO',
      'users',
      targetUser.uid,
      `Permissões atualizadas para ${targetUser.email} (${updates.active === false ? 'Inativo' : 'Ativo'}).`
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserInvite(
  adminUser: User,
  inviteId: string,
  updates: { displayName?: string; active?: boolean; permissions?: UserPermissions }
): Promise<void> {
  const path = `user_invites/${inviteId}`;
  try {
    await updateDoc(doc(db, 'user_invites', inviteId), {
      ...stripUndefined(updates),
      updatedAt: serverTimestamp(),
    });
    await registerAudit(adminUser, 'USUARIO', 'user_invites', inviteId, 'Pré-cadastro atualizado.');
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteUserInvite(adminUser: User, inviteId: string): Promise<void> {
  const path = `user_invites/${inviteId}`;
  try {
    await deleteDoc(doc(db, 'user_invites', inviteId));
    await registerAudit(adminUser, 'USUARIO', 'user_invites', inviteId, 'Pré-cadastro removido.');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

export async function registerAudit(
  user: User,
  tipo: string,
  entidade: string,
  entidadeId: string,
  descricao: string
): Promise<void> {
  const id = makeId('aud');
  const path = `auditoria/${id}`;
  try {
    await setDoc(doc(db, 'auditoria', id), {
      id,
      tipo,
      entidade,
      entidadeId,
      descricao: descricao.slice(0, 500),
      createdByUid: user.uid,
      usuarioNome: user.displayName || user.email || 'Operador',
      usuarioEmail: user.email || '',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ---------------------------------------------------------------------------
// Carregamento Operacional Completo
// ---------------------------------------------------------------------------

export async function fetchAllOperationalData(user: User) {
  try {
    const [
      empresasSnap,
      unidadesSnap,
      acoesSnap,
      colaboradoresSnap,
      importacoesSnap,
      entregasSnap,
      auditoriaSnap,
    ] = await Promise.all([
      getDocs(buildListQuery('empresas', user)),
      getDocs(buildListQuery('unidades', user)),
      getDocs(buildListQuery('acoes', user)),
      getDocs(buildListQuery('colaboradores', user)),
      getDocs(buildListQuery('importacoes', user)),
      getDocs(buildListQuery('entregas', user)),
      getDocs(buildListQuery('auditoria', user)),
    ]);

    return {
      empresas: empresasSnap.docs
        .map((d) => d.data() as Empresa)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      unidades: unidadesSnap.docs
        .map((d) => d.data() as Unidade)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      acoes: acoesSnap.docs
        .map((d) => d.data() as Acao)
        .sort((a, b) => b.anoReferencia - a.anoReferencia || b.mesReferencia - a.mesReferencia),
      colaboradores: colaboradoresSnap.docs
        .map((d) => d.data() as Colaborador)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
      importacoes: importacoesSnap.docs.map((d) => d.data() as Importacao),
      entregas: entregasSnap.docs
        .map((d) => d.data() as Entrega)
        .sort((a, b) =>
          (b.dataHoraEntrega || b.dataEntrega).localeCompare(a.dataHoraEntrega || a.dataEntrega)
        ),
      auditoria: auditoriaSnap.docs.map((d) => d.data() as AuditoriaLog),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'operational_collections');
  }
}

export async function fetchAllImportacaoItens(user: User): Promise<ImportacaoItem[]> {
  const path = 'importacao_itens';
  try {
    const q = buildListQuery('importacao_itens', user);
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ImportacaoItem);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchColaboradorTimeline(
  user: User,
  colaboradorHash: string
): Promise<{
  historico: ColaboradorHistorico[];
  entregas: Entrega[];
}> {
  try {
    const [histSnap, entSnap] = await Promise.all([
      getDocs(
        buildListQuery('colaboradores_historico', user, [
          where('colaboradorHash', '==', colaboradorHash),
        ])
      ),
      getDocs(
        buildListQuery('entregas', user, [where('colaboradorHash', '==', colaboradorHash)])
      ),
    ]);

    const historico = histSnap.docs
      .map((d) => d.data() as ColaboradorHistorico)
      .sort((a, b) => b.dataEvento.localeCompare(a.dataEvento));
    const entregas = entSnap.docs
      .map((d) => d.data() as Entrega)
      .sort((a, b) =>
        (b.dataHoraEntrega || b.dataEntrega).localeCompare(a.dataHoraEntrega || a.dataEntrega)
      );

    return { historico, entregas };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `colaborador_timeline/${colaboradorHash}`);
  }
}

// ---------------------------------------------------------------------------
// Reinicialização Segura da Base Operacional (preserva Projeto, Regras, Auth, Config)
// ---------------------------------------------------------------------------

export async function countOperationalLegacyAndCurrentDocs(): Promise<{
  empresas: number;
  unidades: number;
  acoes: number;
  colaboradores: number;
  importacoes: number;
  importacaoItens: number;
  entregas: number;
  historico: number;
  auditoria: number;
  examesLegado: number;
  remessasLegado: number;
  total: number;
}> {
  const cols = [
    'empresas',
    'unidades',
    'acoes',
    'colaboradores',
    'importacoes',
    'importacao_itens',
    'entregas',
    'colaboradores_historico',
    'auditoria',
    'exames',
    'remessas',
  ] as const;

  const snaps = await Promise.all(cols.map((c) => getDocs(collection(db, c))));
  const [
    empresas,
    unidades,
    acoes,
    colaboradores,
    importacoes,
    importacaoItens,
    entregas,
    historico,
    auditoria,
    examesLegado,
    remessasLegado,
  ] = snaps.map((s) => s.size);

  const total =
    empresas +
    unidades +
    acoes +
    colaboradores +
    importacoes +
    importacaoItens +
    entregas +
    historico +
    auditoria +
    examesLegado +
    remessasLegado;

  return {
    empresas,
    unidades,
    acoes,
    colaboradores,
    importacoes,
    importacaoItens,
    entregas,
    historico,
    auditoria,
    examesLegado,
    remessasLegado,
    total,
  };
}

export async function resetOperationalDatabase(user: User): Promise<{
  deletedCount: number;
  byCollection: Record<string, number>;
}> {
  if (!isBootstrappedEmail(user.email)) {
    throw new Error('Somente o administrador principal pode executar a reinicialização da base.');
  }

  // Ordem respeitando dependências operacionais e removendo também coleções legadas antigas
  const collectionsToClear = [
    'exames',
    'remessas',
    'entregas',
    'importacao_itens',
    'importacoes',
    'colaboradores_historico',
    'colaboradores',
    'acoes',
    'unidades',
    'empresas',
    'auditoria',
  ] as const;

  let deletedCount = 0;
  const byCollection: Record<string, number> = {};

  for (const colName of collectionsToClear) {
    try {
      const snap = await getDocs(collection(db, colName));
      byCollection[colName] = snap.size;
      if (snap.empty) continue;

      const docsList = snap.docs;
      const chunkSize = 350;
      for (let i = 0; i < docsList.length; i += chunkSize) {
        const chunk = docsList.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        deletedCount += chunk.length;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, colName);
    }
  }

  return { deletedCount, byCollection };
}

// ---------------------------------------------------------------------------
// Empresas, Unidades e Ações
// ---------------------------------------------------------------------------

export async function createOrGetEmpresa(user: User, nome: string, cnpj?: string): Promise<Empresa> {
  const cleanName = nome.trim();
  const existing = await getDocs(buildListQuery('empresas', user));
  const found = existing.docs
    .map((d) => d.data() as Empresa)
    .find((e) => e.nome.toLowerCase() === cleanName.toLowerCase());
  if (found) return found;

  const id = makeId('emp');
  const payload: Empresa = stripUndefined({
    id,
    nome: cleanName,
    cnpj: cnpj?.trim() ? cnpj.trim() : undefined,
    ativa: true,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(doc(db, 'empresas', id), payload);
    await registerAudit(user, 'EMPRESA', 'empresas', id, `Empresa cadastrada: ${cleanName}`);
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `empresas/${id}`);
  }
}

export async function createOrGetUnidade(
  user: User,
  params: { empresaId: string; empresaNome: string; nome: string; codigo?: string; cidade?: string; estado?: string }
): Promise<Unidade> {
  const cleanName = params.nome.trim();
  const existing = await getDocs(
    buildListQuery('unidades', user, [where('empresaId', '==', params.empresaId)])
  );
  const found = existing.docs
    .map((d) => d.data() as Unidade)
    .find((u) => u.nome.toLowerCase() === cleanName.toLowerCase());
  if (found) return found;

  const id = makeId('uni');
  const payload: Unidade = stripUndefined({
    id,
    empresaId: params.empresaId,
    empresaNome: params.empresaNome,
    nome: cleanName,
    codigo: params.codigo?.trim() || undefined,
    cidade: params.cidade?.trim() || undefined,
    estado: params.estado?.trim() || undefined,
    ativa: true,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    await setDoc(doc(db, 'unidades', id), payload);
    await registerAudit(
      user,
      'UNIDADE',
      'unidades',
      id,
      `Unidade cadastrada: ${cleanName} (${params.empresaNome})`
    );
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `unidades/${id}`);
  }
}

export async function createOrGetAcao(
  user: User,
  params: {
    empresaId: string;
    empresaNome: string;
    unidadeId: string;
    unidadeNome: string;
    nome: string;
    mesReferencia: number;
    anoReferencia: number;
  }
): Promise<Acao> {
  const cleanName = params.nome.trim();
  const existing = await getDocs(
    buildListQuery('acoes', user, [where('unidadeId', '==', params.unidadeId)])
  );
  const found = existing.docs
    .map((d) => d.data() as Acao)
    .find(
      (a) =>
        a.nome.toLowerCase() === cleanName.toLowerCase() &&
        a.mesReferencia === params.mesReferencia &&
        a.anoReferencia === params.anoReferencia
    );
  if (found) return found;

  const id = makeId('acao');
  const payload: Acao = {
    id,
    empresaId: params.empresaId,
    empresaNome: params.empresaNome,
    unidadeId: params.unidadeId,
    unidadeNome: params.unidadeNome,
    nome: cleanName,
    mesReferencia: params.mesReferencia,
    anoReferencia: params.anoReferencia,
    status: 'aberta',
    totalColaboradores: 0,
    createdByUid: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'acoes', id), payload);
    await registerAudit(
      user,
      'ACAO',
      'acoes',
      id,
      `Ação criada: ${cleanName} (${formatMesAno(params.mesReferencia, params.anoReferencia)})`
    );
    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `acoes/${id}`);
  }
}

// ---------------------------------------------------------------------------
// Prévia e Importação de Planilha de Colaboradores
// ---------------------------------------------------------------------------

export interface CollaboratorPreviewItem {
  row: ParsedCollaboratorRow;
  isNew: boolean;
  hasCadastralChanges: boolean;
  cadastralDiffs: string[];
  existingColaborador?: Colaborador;
  recebimento: ColaboradorStatusInfo;
}

export interface CollaboratorImportPreview {
  fileHash: string;
  duplicateFileAlreadyImported: boolean;
  items: CollaboratorPreviewItem[];
  invalidRows: ParsedCollaboratorRow[];
  stats: {
    totalValid: number;
    novos: number;
    existentes: number;
    atualizacoesCadastrais: number;
    jaReceberam: number;
    naoReceberam: number;
    erros: number;
    duplicadosNoArquivo: number;
  };
}

export async function previewCollaboratorImport(
  user: User,
  acaoId: string,
  fileHash: string,
  rows: ParsedCollaboratorRow[]
): Promise<CollaboratorImportPreview> {
  const existingImportsSnap = await getDocs(
    buildListQuery('importacoes', user, [
      where('acaoId', '==', acaoId),
      where('fileHash', '==', fileHash),
    ])
  );
  const duplicateFileAlreadyImported = !existingImportsSnap.empty;

  const allColabsSnap = await getDocs(buildListQuery('colaboradores', user));
  const colabMap = new Map<string, Colaborador>();
  allColabsSnap.docs.forEach((d) => colabMap.set(d.id, d.data() as Colaborador));

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  let novos = 0;
  let existentes = 0;
  let atualizacoesCadastrais = 0;
  let jaReceberam = 0;
  let naoReceberam = 0;

  const items: CollaboratorPreviewItem[] = validRows.map((row) => {
    const existing = colabMap.get(row.cpfHash);
    const isNew = !existing;
    const cadastralDiffs: string[] = [];

    if (existing) {
      existentes++;
      const prevCentroCusto = getCentroCusto(existing);
      if (existing.nome !== row.nome) cadastralDiffs.push(`Nome: "${existing.nome}" -> "${row.nome}"`);
      if (prevCentroCusto !== row.centroCusto) {
        cadastralDiffs.push(`Centro de custo: "${prevCentroCusto}" -> "${row.centroCusto}"`);
      }
      if (existing.funcao !== row.funcao) cadastralDiffs.push(`Função: "${existing.funcao}" -> "${row.funcao}"`);
      if (cadastralDiffs.length > 0) atualizacoesCadastrais++;
    } else {
      novos++;
    }

    const recebimento = evaluateRecebimentoStatus(existing);
    if (recebimento.jaRecebeu) jaReceberam++;
    else naoReceberam++;

    return {
      row,
      isNew,
      hasCadastralChanges: cadastralDiffs.length > 0,
      cadastralDiffs,
      existingColaborador: existing,
      recebimento,
    };
  });

  return {
    fileHash,
    duplicateFileAlreadyImported,
    items,
    invalidRows,
    stats: {
      totalValid: validRows.length,
      novos,
      existentes,
      atualizacoesCadastrais,
      jaReceberam,
      naoReceberam,
      erros: invalidRows.filter((r) => !r.duplicateInFile).length,
      duplicadosNoArquivo: invalidRows.filter((r) => r.duplicateInFile).length,
    },
  };
}

export async function commitCollaboratorImport(
  user: User,
  params: {
    nomeArquivo: string;
    empresa: Empresa;
    unidade: Unidade;
    acao: Acao;
    mesReferencia: number;
    anoReferencia: number;
    preview: CollaboratorImportPreview;
  }
): Promise<Importacao> {
  if (params.preview.duplicateFileAlreadyImported) {
    throw new Error(
      'Esta mesma planilha já foi importada para esta ação. Reimportação bloqueada para evitar duplicidade.'
    );
  }

  const importacaoId = makeId('imp');
  const todayISO = getTodayISO();
  const responsavelNome = user.displayName || user.email || 'Operador';

  const existingActionItemsSnap = await getDocs(
    buildListQuery('importacao_itens', user, [where('acaoId', '==', params.acao.id)])
  );
  const existingItemIds = new Set(existingActionItemsSnap.docs.map((d) => d.id));

  const chunkSize = 120;
  for (let i = 0; i < params.preview.items.length; i += chunkSize) {
    const chunk = params.preview.items.slice(i, i + chunkSize);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const colabRef = doc(db, 'colaboradores', item.row.cpfHash);

      if (item.isNew) {
        const colabDoc: Colaborador = {
          id: item.row.cpfHash,
          cpfHash: item.row.cpfHash,
          cpfMascarado: item.row.cpfMascarado,
          nome: item.row.nome,
          nomeNormalizado: item.row.nomeNormalizado,
          centroCusto: item.row.centroCusto,
          funcao: item.row.funcao,
          ultimaEmpresaId: params.empresa.id,
          ultimaEmpresaNome: params.empresa.nome,
          ultimaUnidadeId: params.unidade.id,
          ultimaUnidadeNome: params.unidade.nome,
          ultimaAcaoId: params.acao.id,
          ultimaAcaoNome: params.acao.nome,
          totalColetoresRecebidos: 0,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        batch.set(colabRef, colabDoc);

        const histId = makeId('hist');
        batch.set(doc(db, 'colaboradores_historico', histId), {
          id: histId,
          colaboradorHash: item.row.cpfHash,
          cpfMascarado: item.row.cpfMascarado,
          tipo: 'CADASTRO_INICIAL',
          descricao: `Cadastro inicial via planilha na ação "${params.acao.nome}" (${item.row.centroCusto} · ${item.row.funcao}).`,
          empresaNome: params.empresa.nome,
          unidadeNome: params.unidade.nome,
          acaoId: params.acao.id,
          acaoNome: params.acao.nome,
          mesReferencia: params.mesReferencia,
          anoReferencia: params.anoReferencia,
          dataEvento: todayISO,
          createdByUid: user.uid,
          usuarioNome: responsavelNome,
          createdAt: serverTimestamp(),
        });
      } else {
        // Atualiza dados cadastrais preservando integralmente o histórico de recebimento
        batch.update(colabRef, {
          nome: item.row.nome,
          nomeNormalizado: item.row.nomeNormalizado,
          centroCusto: item.row.centroCusto,
          funcao: item.row.funcao,
          ultimaEmpresaId: params.empresa.id,
          ultimaEmpresaNome: params.empresa.nome,
          ultimaUnidadeId: params.unidade.id,
          ultimaUnidadeNome: params.unidade.nome,
          ultimaAcaoId: params.acao.id,
          ultimaAcaoNome: params.acao.nome,
          setor: deleteField(),
          possuiColetorPendente: deleteField(),
          proximoElegivelData: deleteField(),
          ultimoExameData: deleteField(),
          totalColetoresUtilizados: deleteField(),
          totalExamesRealizados: deleteField(),
          updatedAt: serverTimestamp(),
        });

        if (item.hasCadastralChanges) {
          const histChangeId = makeId('hist');
          batch.set(doc(db, 'colaboradores_historico', histChangeId), {
            id: histChangeId,
            colaboradorHash: item.row.cpfHash,
            cpfMascarado: item.row.cpfMascarado,
            tipo: 'ATUALIZACAO_CADASTRAL',
            descricao: `Atualização cadastral: ${item.cadastralDiffs.join('; ')}. Histórico de recebimento preservado.`,
            empresaNome: params.empresa.nome,
            unidadeNome: params.unidade.nome,
            acaoId: params.acao.id,
            acaoNome: params.acao.nome,
            mesReferencia: params.mesReferencia,
            anoReferencia: params.anoReferencia,
            dataEvento: todayISO,
            createdByUid: user.uid,
            usuarioNome: responsavelNome,
            createdAt: serverTimestamp(),
          });
        }

        const histPartId = makeId('hist');
        batch.set(doc(db, 'colaboradores_historico', histPartId), {
          id: histPartId,
          colaboradorHash: item.row.cpfHash,
          cpfMascarado: item.row.cpfMascarado,
          tipo: 'PARTICIPACAO_ACAO',
          descricao: `Incluído na ação "${params.acao.nome}" (${params.unidade.nome}). Situação no histórico: ${item.recebimento.label}.`,
          empresaNome: params.empresa.nome,
          unidadeNome: params.unidade.nome,
          acaoId: params.acao.id,
          acaoNome: params.acao.nome,
          mesReferencia: params.mesReferencia,
          anoReferencia: params.anoReferencia,
          dataEvento: todayISO,
          createdByUid: user.uid,
          usuarioNome: responsavelNome,
          createdAt: serverTimestamp(),
        });
      }

      const itemId = `${params.acao.id}_${item.row.cpfHash}`;
      const itemRef = doc(db, 'importacao_itens', itemId);
      if (existingItemIds.has(itemId)) {
        batch.update(itemRef, {
          importacaoId,
          colaboradorNome: item.row.nome,
          centroCusto: item.row.centroCusto,
          funcao: item.row.funcao,
          setor: deleteField(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(itemRef, {
          id: itemId,
          importacaoId,
          acaoId: params.acao.id,
          acaoNome: params.acao.nome,
          empresaId: params.empresa.id,
          empresaNome: params.empresa.nome,
          unidadeId: params.unidade.id,
          unidadeNome: params.unidade.nome,
          mesReferencia: params.mesReferencia,
          anoReferencia: params.anoReferencia,
          colaboradorHash: item.row.cpfHash,
          colaboradorNome: item.row.nome,
          cpfMascarado: item.row.cpfMascarado,
          centroCusto: item.row.centroCusto,
          funcao: item.row.funcao,
          createdByUid: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'importacao_batch');
    }
  }

  const importacaoDoc: Importacao = {
    id: importacaoId,
    fileHash: params.preview.fileHash,
    nomeArquivo: params.nomeArquivo.slice(0, 240),
    empresaId: params.empresa.id,
    empresaNome: params.empresa.nome,
    unidadeId: params.unidade.id,
    unidadeNome: params.unidade.nome,
    acaoId: params.acao.id,
    acaoNome: params.acao.nome,
    mesReferencia: params.mesReferencia,
    anoReferencia: params.anoReferencia,
    totalLinhas: params.preview.items.length + params.preview.invalidRows.length,
    novosColaboradores: params.preview.stats.novos,
    atualizados: params.preview.stats.atualizacoesCadastrais,
    errosCount: params.preview.stats.erros,
    duplicadosArquivo: params.preview.stats.duplicadosNoArquivo,
    jaReceberamCount: params.preview.stats.jaReceberam,
    naoReceberamCount: params.preview.stats.naoReceberam,
    createdByUid: user.uid,
    responsavelNome,
    responsavelEmail: user.email || '',
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'importacoes', importacaoId), importacaoDoc);
    const totalItensSnap = await getDocs(
      buildListQuery('importacao_itens', user, [where('acaoId', '==', params.acao.id)])
    );
    await updateDoc(doc(db, 'acoes', params.acao.id), {
      totalColaboradores: totalItensSnap.size,
      updatedAt: serverTimestamp(),
    });
    await registerAudit(
      user,
      'IMPORTACAO',
      'importacoes',
      importacaoId,
      `Importação de ${params.preview.items.length} colaboradores para "${params.acao.nome}" (${params.preview.stats.jaReceberam} já receberam, ${params.preview.stats.naoReceberam} ainda não receberam).`
    );
    return importacaoDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `importacoes/${importacaoId}`);
  }
}

// ---------------------------------------------------------------------------
// Registro de Entrega (MARCAR COMO RECEBIDO — Sem bloqueios ou prazos)
// ---------------------------------------------------------------------------

export async function marcarColetorRecebido(
  user: User,
  params: {
    colaboradorHash: string;
    empresaId: string;
    empresaNome: string;
    unidadeId: string;
    unidadeNome: string;
    acaoId: string;
    acaoNome: string;
    dataEntregaISO?: string;
    dataHoraEntregaISO?: string;
  }
): Promise<Entrega> {
  const dataEntrega = params.dataEntregaISO || getTodayISO();
  const dataHoraEntrega = params.dataHoraEntregaISO || getNowDateTimeISO();
  const entregaId = makeId('ent');
  const histId = makeId('hist');
  const auditId = makeId('aud');
  const responsavelNome = user.displayName || user.email || 'Operador';

  const colabRef = doc(db, 'colaboradores', params.colaboradorHash);
  const entregaRef = doc(db, 'entregas', entregaId);
  const histRef = doc(db, 'colaboradores_historico', histId);
  const auditRef = doc(db, 'auditoria', auditId);

  try {
    const entregaCriada = await runTransaction(db, async (tx) => {
      const colabSnap = await tx.get(colabRef);
      if (!colabSnap.exists()) {
        throw new Error('Colaborador não encontrado no banco de dados.');
      }

      const colab = colabSnap.data() as Colaborador;
      const centroCusto = getCentroCusto(colab);
      const entregaAnteriorData = colab.ultimaEntregaDataHora || colab.ultimaEntregaData || undefined;

      const entregaDoc: Entrega = stripUndefined<Entrega>({
        id: entregaId,
        colaboradorHash: colab.cpfHash,
        colaboradorNome: colab.nome,
        cpfMascarado: colab.cpfMascarado,
        centroCusto,
        funcao: colab.funcao,
        empresaId: params.empresaId,
        empresaNome: params.empresaNome,
        unidadeId: params.unidadeId,
        unidadeNome: params.unidadeNome,
        acaoId: params.acaoId,
        acaoNome: params.acaoNome,
        dataEntrega,
        dataHoraEntrega,
        entregaAnteriorData,
        createdByUid: user.uid,
        responsavelNome,
        responsavelEmail: user.email || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(entregaRef, entregaDoc);
      tx.update(colabRef, {
        centroCusto,
        ultimaEmpresaId: params.empresaId,
        ultimaEmpresaNome: params.empresaNome,
        ultimaUnidadeId: params.unidadeId,
        ultimaUnidadeNome: params.unidadeNome,
        ultimaAcaoId: params.acaoId,
        ultimaAcaoNome: params.acaoNome,
        ultimaEntregaId: entregaId,
        ultimaEntregaData: dataEntrega,
        ultimaEntregaDataHora: dataHoraEntrega,
        totalColetoresRecebidos: (colab.totalColetoresRecebidos || 0) + 1,
        // Limpa eventuais campos legados se ainda existirem antes de reset
        setor: deleteField(),
        possuiColetorPendente: deleteField(),
        proximoElegivelData: deleteField(),
        ultimoExameData: deleteField(),
        totalColetoresUtilizados: deleteField(),
        totalExamesRealizados: deleteField(),
        updatedAt: serverTimestamp(),
      });

      tx.set(histRef, {
        id: histId,
        colaboradorHash: colab.cpfHash,
        cpfMascarado: colab.cpfMascarado,
        tipo: 'ENTREGA_COLETOR',
        descricao: entregaAnteriorData
          ? `Nova entrega registrada em ${formatDateTimeBR(dataHoraEntrega, dataEntrega)} na ação "${params.acaoNome}" (${params.unidadeNome}). Recebimento anterior em ${formatDateTimeBR(entregaAnteriorData)}.`
          : `Coletor marcado como recebido em ${formatDateTimeBR(dataHoraEntrega, dataEntrega)} na ação "${params.acaoNome}" (${params.unidadeNome}).`,
        empresaNome: params.empresaNome,
        unidadeNome: params.unidadeNome,
        acaoId: params.acaoId,
        acaoNome: params.acaoNome,
        dataEvento: dataEntrega,
        createdByUid: user.uid,
        usuarioNome: responsavelNome,
        createdAt: serverTimestamp(),
      });

      tx.set(auditRef, {
        id: auditId,
        tipo: 'ENTREGA',
        entidade: 'entregas',
        entidadeId: entregaId,
        descricao: `Coletor marcado como recebido para ${colab.nome} (${colab.cpfMascarado}) em ${params.unidadeNome}.`,
        createdByUid: user.uid,
        usuarioNome: responsavelNome,
        usuarioEmail: user.email || '',
        createdAt: serverTimestamp(),
      });

      return entregaDoc;
    });

    return entregaCriada;
  } catch (error) {
    if (error instanceof Error && error.message.includes('não encontrado')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `entregas/${entregaId}`);
  }
}

export async function marcarLoteComoRecebido(
  user: User,
  itens: Array<{
    colaboradorHash: string;
    empresaId: string;
    empresaNome: string;
    unidadeId: string;
    unidadeNome: string;
    acaoId: string;
    acaoNome: string;
  }>
): Promise<{ sucesso: number; erros: Array<{ hash: string; motivo: string }> }> {
  let sucesso = 0;
  const erros: Array<{ hash: string; motivo: string }> = [];

  for (const item of itens) {
    try {
      await marcarColetorRecebido(user, item);
      sucesso++;
    } catch (error) {
      erros.push({
        hash: item.colaboradorHash,
        motivo: error instanceof Error ? error.message : 'Erro ao registrar entrega.',
      });
    }
  }

  return { sucesso, erros };
}
