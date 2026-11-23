import React, { useCallback, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Edit3,
  FlaskConical,
  Info,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  countOperationalLegacyAndCurrentDocs,
  createManagedUser,
  deleteUserInvite,
  fetchUsersAndInvites,
  isBootstrappedEmail,
  resetOperationalDatabase,
  resolveEffectivePermissions,
  updateManagedUser,
  updateUserInvite,
} from '../lib/firestoreService';
import { runMandatoryBusinessScenarios, type ScenarioTestResult } from '../lib/scenarioTests';
import {
  ALL_ADMIN_PERMISSIONS,
  DEFAULT_OPERADOR_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  type PermissionKey,
  type UserInvite,
  type UserPermissions,
  type UserProfile,
} from '../types/domain';

interface ConfiguracoesViewProps {
  user: User;
  userProfile: UserProfile;
  onRefresh: () => Promise<void>;
}

const CONFIRMATION_PHRASE = 'LIMPAR DADOS';

export function ConfiguracoesView({
  user,
  userProfile,
  onRefresh,
}: ConfiguracoesViewProps) {
  const effectivePerms = resolveEffectivePermissions(userProfile);
  const isMasterAdmin = isBootstrappedEmail(user.email);
  const canManageUsers =
    isMasterAdmin || userProfile.role === 'admin' || effectivePerms.gerenciarUsuarios;

  // Usuários e convites
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [invitesList, setInvitesList] = useState<UserInvite[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Formulário de novo usuário
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [newActive, setNewActive] = useState(true);
  const [newPerms, setNewPerms] = useState<UserPermissions>({ ...DEFAULT_OPERADOR_PERMISSIONS });
  const [creatingUser, setCreatingUser] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);
  const [showEmailProviderHint, setShowEmailProviderHint] = useState(false);

  // Modal de edição
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editingInvite, setEditingInvite] = useState<UserInvite | null>(null);
  const [editName, setEditName] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editPerms, setEditPerms] = useState<UserPermissions>({ ...DEFAULT_OPERADOR_PERMISSIONS });
  const [savingEdit, setSavingEdit] = useState(false);

  // Reinicialização da base operacional
  const [counts, setCounts] = useState<Awaited<
    ReturnType<typeof countOperationalLegacyAndCurrentDocs>
  > | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [resettingDb, setResettingDb] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  // Testes obrigatórios (9 cenários)
  const [testResults, setTestResults] = useState<ScenarioTestResult[] | null>(null);
  const [runningTests, setRunningTests] = useState(false);

  const reloadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { users, invites } = await fetchUsersAndInvites(user, userProfile);
      setUsersList(users);
      setInvitesList(invites);
    } finally {
      setLoadingUsers(false);
    }
  }, [user, userProfile]);

  const reloadCounts = useCallback(async () => {
    if (!isMasterAdmin) return;
    setLoadingCounts(true);
    try {
      const c = await countOperationalLegacyAndCurrentDocs();
      setCounts(c);
    } catch {
      setCounts(null);
    } finally {
      setLoadingCounts(false);
    }
  }, [isMasterAdmin]);

  useEffect(() => {
    reloadUsers();
    reloadCounts();
  }, [reloadUsers, reloadCounts]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserError(null);
    setUserSuccess(null);
    setShowEmailProviderHint(false);

    if (!newName.trim() || !newEmail.trim() || !newPassword) {
      setUserError('Preencha Nome completo, E-mail e Senha inicial.');
      return;
    }
    if (newPassword.length < 6) {
      setUserError('A senha inicial deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setUserError('A confirmação da senha não confere com a senha inicial.');
      return;
    }

    setCreatingUser(true);
    try {
      const res = await createManagedUser(user, {
        displayName: newName,
        email: newEmail,
        password: newPassword,
        active: newActive,
        permissions: newPerms,
      });

      if (res.mode === 'auth_created') {
        setUserSuccess(
          `Usuário ${newName.trim()} (${newEmail.trim().toLowerCase()}) criado no Firebase Auth com suas permissões.${res.emailVerifiedSent ? ' Um e-mail de verificação foi enviado para ativação da conta.' : ''}`
        );
      } else {
        setShowEmailProviderHint(true);
        setUserSuccess(
          `Pré-cadastro com permissões gravado para ${newEmail.trim().toLowerCase()}. O provedor E-mail/Senha ainda não está ativado no Firebase Console — o usuário já pode entrar pelo botão Google ou após a ativação de E-mail/Senha no Console.`
        );
      }

      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewPasswordConfirm('');
      setNewActive(true);
      setNewPerms({ ...DEFAULT_OPERADOR_PERMISSIONS });
      setShowCreateForm(false);
      await reloadUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Erro ao criar usuário.');
    } finally {
      setCreatingUser(false);
    }
  };

  const openEditUser = (target: UserProfile) => {
    setEditingInvite(null);
    setEditingUser(target);
    setEditName(target.displayName);
    setEditActive(target.active);
    setEditPerms(resolveEffectivePermissions(target));
    setUserError(null);
  };

  const openEditInvite = (invite: UserInvite) => {
    setEditingUser(null);
    setEditingInvite(invite);
    setEditName(invite.displayName);
    setEditActive(invite.active);
    setEditPerms({ ...DEFAULT_OPERADOR_PERMISSIONS, ...invite.permissions });
    setUserError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) {
      setUserError('O nome completo não pode ficar vazio.');
      return;
    }
    setSavingEdit(true);
    setUserError(null);
    try {
      if (editingUser) {
        await updateManagedUser(user, editingUser, {
          displayName: editName,
          active: editActive,
          permissions: editPerms,
        });
        setUserSuccess(`Permissões e dados de ${editingUser.email} atualizados.`);
        setEditingUser(null);
      } else if (editingInvite) {
        await updateUserInvite(user, editingInvite.id, {
          displayName: editName,
          active: editActive,
          permissions: editPerms,
        });
        setUserSuccess(`Pré-cadastro de ${editingInvite.email} atualizado.`);
        setEditingInvite(null);
      }
      await reloadUsers();
    } catch (err) {
      setUserError(err instanceof Error ? err.message : 'Erro ao atualizar usuário.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteInvite = async (invite: UserInvite) => {
    await deleteUserInvite(user, invite.id);
    await reloadUsers();
  };

  const handleResetDatabase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMasterAdmin) return;
    if (confirmText.trim().toUpperCase() !== CONFIRMATION_PHRASE) {
      setResetError(`Digite exatamente "${CONFIRMATION_PHRASE}" para confirmar a exclusão.`);
      return;
    }

    setResettingDb(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      const result = await resetOperationalDatabase(user);
      setConfirmText('');
      setResetSuccess(
        `Limpeza concluída com segurança: ${result.deletedCount} registros operacionais antigos/fictícios foram removidos permanentemente. O projeto Firebase, regras de segurança, usuários e sua conta administrativa foram preservados. A base está vazia e pronta para uso real.`
      );
      await reloadCounts();
      await onRefresh();
    } catch (err) {
      setResetError(
        err instanceof Error ? err.message : 'Erro ao executar a limpeza da base operacional.'
      );
    } finally {
      setResettingDb(false);
    }
  };

  const handleRunScenarios = async () => {
    setRunningTests(true);
    try {
      const results = await runMandatoryBusinessScenarios();
      setTestResults(results);
    } finally {
      setRunningTests(false);
    }
  };

  const countPerms = (perms?: UserPermissions) => {
    if (!perms) return 0;
    return PERMISSION_DEFINITIONS.filter((d) => Boolean(perms[d.key])).length;
  };

  const togglePerm = (
    setter: React.Dispatch<React.SetStateAction<UserPermissions>>,
    key: PermissionKey
  ) => {
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const canConfirmReset =
    isMasterAdmin &&
    confirmText.trim().toUpperCase() === CONFIRMATION_PHRASE &&
    !resettingDb;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Configurações, Usuários e Base de Dados
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Gerencie operadores e permissões, execute a limpeza segura dos dados antigos e valide os 11 cenários obrigatórios do sistema.
        </p>
      </div>

      {/* 1. GERENCIAMENTO DE USUÁRIOS E PERMISSÕES (8 PERMISSÕES) */}
      {canManageUsers && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Gerenciamento de Usuários e Permissões
                </h2>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cadastre usuários com senha inicial e defina exatamente quais das 8 permissões cada operador pode acessar. Senhas nunca são gravadas no Firestore.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm((v) => !v);
                setUserError(null);
                setUserSuccess(null);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              {showCreateForm ? 'Fechar formulário' : 'Novo Usuário'}
            </button>
          </div>

          <div className="p-6 space-y-4">
            {userError && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{userError}</span>
              </div>
            )}

            {userSuccess && (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{userSuccess}</span>
              </div>
            )}

            {showEmailProviderHint && (
              <div className="p-3.5 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-900 flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>
                  Para habilitar login direto por e-mail e senha neste projeto Firebase: acesse{' '}
                  <strong>Firebase Console &rarr; Authentication &rarr; Sign-in method &rarr; E-mail/senha</strong> e ative o provedor.
                </span>
              </div>
            )}

            {showCreateForm && (
              <form
                onSubmit={handleCreateUser}
                className="border border-slate-200 rounded-xl p-5 bg-slate-50/70 space-y-5"
              >
                <h3 className="text-sm font-semibold text-slate-900">Cadastrar Novo Usuário</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Nome completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ex.: Ana Paula Ferreira"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      E-mail corporativo *
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="ana@empresa.com.br"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Situação
                    </label>
                    <select
                      value={newActive ? 'ativo' : 'inativo'}
                      onChange={(e) => setNewActive(e.target.value === 'ativo')}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="ativo">Ativo</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Senha inicial (mín. 6 caracteres) *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Confirmação da senha *
                    </label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={newPasswordConfirm}
                      onChange={(e) => setNewPasswordConfirm(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </div>
                </div>

                <div className="space-y-2.5 pt-2 border-t border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      Permissões de Acesso (8 permissões)
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => setNewPerms({ ...ALL_ADMIN_PERMISSIONS })}
                        className="font-medium text-teal-700 hover:text-teal-800"
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewPerms({ ...DEFAULT_OPERADOR_PERMISSIONS })}
                        className="font-medium text-slate-600 hover:text-slate-900"
                      >
                        Padrão operador
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {PERMISSION_DEFINITIONS.map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white border border-slate-200 cursor-pointer hover:border-teal-300"
                      >
                        <input
                          type="checkbox"
                          checked={newPerms[perm.key]}
                          onChange={() => togglePerm(setNewPerms, perm.key)}
                          className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                        />
                        <div className="text-xs">
                          <div className="font-medium text-slate-900">{perm.label}</div>
                          <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                            {perm.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creatingUser}
                    className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
                  >
                    {creatingUser ? 'Criando usuário...' : 'Criar Usuário'}
                  </button>
                </div>
              </form>
            )}

            {/* Tabela de Usuários Cadastrados */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-medium text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Nome completo</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3">Permissões</th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3 text-right">Gerenciar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingUsers ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                        Carregando usuários...
                      </td>
                    </tr>
                  ) : (
                    usersList.map((u) => {
                      const perms = resolveEffectivePermissions(u);
                      const isMaster = u.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
                      return (
                        <tr key={u.uid} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div>{u.displayName}</div>
                            {isMaster && (
                              <span className="text-[11px] font-medium text-teal-700 inline-flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" /> Administrador principal
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono-tabular text-slate-600">{u.email}</td>
                          <td className="px-4 py-3 text-xs font-mono-tabular text-slate-700">
                            {countPerms(perms)} / {PERMISSION_DEFINITIONS.length} ativas
                          </td>
                          <td className="px-4 py-3 text-xs font-medium">
                            {u.active ? (
                              <span className="text-emerald-700">Ativo</span>
                            ) : (
                              <span className="text-rose-700">Inativo</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {!isMaster && (
                              <button
                                type="button"
                                onClick={() => openEditUser(u)}
                                className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-800"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Editar permissões
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {invitesList.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="text-xs font-semibold text-slate-700">
                  Pré-cadastros de Acesso Aguardando Primeiro Login ({invitesList.length})
                </h3>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Nome</th>
                        <th className="px-4 py-2.5">E-mail</th>
                        <th className="px-4 py-2.5">Permissões</th>
                        <th className="px-4 py-2.5">Situação</th>
                        <th className="px-4 py-2.5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invitesList.map((inv) => (
                        <tr key={inv.id}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {inv.displayName}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-slate-600">
                            {inv.email}
                          </td>
                          <td className="px-4 py-2.5 font-mono-tabular text-slate-700">
                            {countPerms(inv.permissions)} / {PERMISSION_DEFINITIONS.length}
                          </td>
                          <td className="px-4 py-2.5">
                            {inv.active ? (
                              <span className="text-emerald-700 font-medium">Ativo</span>
                            ) : (
                              <span className="text-rose-700 font-medium">Inativo</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEditInvite(inv)}
                              className="font-medium text-teal-700 hover:text-teal-800"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteInvite(inv)}
                              className="inline-flex items-center gap-1 font-medium text-rose-600 hover:text-rose-700"
                            >
                              <Trash2 className="w-3 h-3" /> Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. REINICIALIZAÇÃO COMPLETA DA BASE OPERACIONAL (EXCLUSIVA DO ADMIN PRINCIPAL) */}
      {isMasterAdmin && (
        <div className="bg-white border border-rose-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-rose-100 bg-rose-50/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Reinicialização Completa da Base Operacional
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Exclua permanentemente os dados fictícios e antigos do Firestore para começar com a base vazia e pronta para operação real.
              </p>
            </div>
            <button
              type="button"
              onClick={reloadCounts}
              disabled={loadingCounts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingCounts ? 'animate-spin' : ''}`} />
              Atualizar contagem
            </button>
          </div>

          <form onSubmit={handleResetDatabase} className="p-6 space-y-5">
            {resetSuccess && (
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{resetSuccess}</span>
              </div>
            )}

            {resetError && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{resetError}</span>
              </div>
            )}

            {/* Contagem atual no Firestore */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Colaboradores', value: counts?.colaboradores ?? '—' },
                { label: 'Entregas', value: counts?.entregas ?? '—' },
                { label: 'Importações', value: counts?.importacoes ?? '—' },
                { label: 'Ações', value: counts?.acoes ?? '—' },
                { label: 'Empresas / Unid.', value: counts ? counts.empresas + counts.unidades : '—' },
                {
                  label: 'Histórico / Legado',
                  value: counts
                    ? counts.historico +
                      counts.auditoria +
                      counts.importacaoItens +
                      counts.examesLegado +
                      counts.remessasLegado
                    : '—',
                },
              ].map((stat) => (
                <div key={stat.label} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-[11px] font-medium text-slate-500">{stat.label}</div>
                  <div className="text-lg font-bold text-slate-900 font-mono-tabular mt-0.5">
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-4 rounded-lg bg-rose-50/50 border border-rose-200 space-y-1.5">
                <div className="font-semibold text-rose-900">
                  O que será excluído permanentemente ({counts?.total ?? 0} registros):
                </div>
                <ul className="list-disc pl-4 text-rose-800 space-y-0.5">
                  <li>Colaboradores cadastrados e históricos individuais por CPF</li>
                  <li>Histórico de entregas e registros legados de exames ou remessas</li>
                  <li>Importações anteriores e itens vinculados às planilhas</li>
                  <li>Empresas, unidades, ações/campanhas e auditoria operacional antiga</li>
                </ul>
              </div>

              <div className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-200 space-y-1.5">
                <div className="font-semibold text-emerald-900">O que será preservado intacto:</div>
                <ul className="list-disc pl-4 text-emerald-800 space-y-0.5">
                  <li>Projeto Firebase e configurações de conexão</li>
                  <li>Regras de segurança do Firestore (firestore.rules)</li>
                  <li>Configuração do sistema, usuários cadastrados e permissões</li>
                  <li>Sua conta de administrador principal ({BOOTSTRAPPED_ADMIN_EMAIL}) no Firebase Auth</li>
                </ul>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3 pt-1">
              <div className="flex-1 max-w-sm">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirmação explícita — digite <span className="font-mono-tabular text-rose-700">{CONFIRMATION_PHRASE}</span>:
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRMATION_PHRASE}
                  disabled={resettingDb}
                  className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
                />
              </div>

              <button
                type="submit"
                disabled={!canConfirmReset}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                {resettingDb
                  ? 'Limpando base operacional...'
                  : 'Excluir Dados Operacionais Permanentemente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 3. BATERIA DOS 11 CENÁRIOS OBRIGATÓRIOS */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-teal-600" />
              <h2 className="text-base font-semibold text-slate-900">
                Verificação dos 11 Cenários Obrigatórios do Sistema
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Valida CPF e dígitos verificadores, importação de 4 colunas, classificação JÁ RECEBEU / NÃO RECEBEU, devolução preservando histórico, histórico permanente sem bloqueios e RBAC de 8 permissões.
            </p>
          </div>
          <button
            type="button"
            disabled={runningTests}
            onClick={handleRunScenarios}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {runningTests ? 'Executando cenários...' : 'Executar 11 Cenários'}
          </button>
        </div>

        {testResults && (
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
            {testResults.map((t) => (
              <div key={t.id} className="p-3.5 flex items-start justify-between gap-4 bg-white">
                <div className="flex items-start gap-2.5">
                  {t.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-slate-900">{t.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{t.description}</div>
                    <div className="text-xs font-mono-tabular text-slate-700 mt-1">{t.details}</div>
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 ${
                    t.passed ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {t.passed ? 'APROVADO' : 'FALHOU'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. ARQUITETURA & SEGURANÇA */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          <h2 className="text-base font-semibold text-slate-900">
            Banco de Dados Permanente e Proteção LGPD
          </h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Persistência em tempo real via <strong>Cloud Firestore + Firebase Auth</strong> com transações atômicas, regras de segurança aplicando as 8 permissões no servidor e proteção LGPD por índice SHA-256 com exibição mascarada do CPF.
        </p>
      </div>

      {/* Modal de Edição de Usuário / Pré-cadastro */}
      {(editingUser || editingInvite) && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 space-y-5 my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Editar Permissões de Acesso
                </h3>
                <p className="text-xs text-slate-500">
                  {editingUser ? editingUser.email : editingInvite?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingUser(null);
                  setEditingInvite(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Situação</label>
                <select
                  value={editActive ? 'ativo' : 'inativo'}
                  onChange={(e) => setEditActive(e.target.value === 'ativo')}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">
                  Permissões do Usuário (8 permissões)
                </span>
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditPerms({ ...ALL_ADMIN_PERMISSIONS })}
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    Marcar todas
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditPerms({ ...DEFAULT_OPERADOR_PERMISSIONS })}
                    className="font-medium text-slate-600 hover:text-slate-900"
                  >
                    Padrão operador
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {PERMISSION_DEFINITIONS.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:border-teal-300"
                  >
                    <input
                      type="checkbox"
                      checked={editPerms[perm.key]}
                      onChange={() => togglePerm(setEditPerms, perm.key)}
                      className="mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-600"
                    />
                    <div className="text-xs">
                      <div className="font-medium text-slate-900">{perm.label}</div>
                      <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                        {perm.description}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={savingEdit}
                onClick={() => {
                  setEditingUser(null);
                  setEditingInvite(null);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
              >
                {savingEdit ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
