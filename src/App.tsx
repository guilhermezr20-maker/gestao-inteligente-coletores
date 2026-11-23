import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  RefreshCw,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import { auth, testConnection } from './lib/firebase';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  ensureUserProfile,
  fetchAllImportacaoItens,
  fetchAllOperationalData,
  resolveEffectivePermissions,
} from './lib/firestoreService';
import type {
  Acao,
  Colaborador,
  Empresa,
  Entrega,
  ImportacaoItem,
  MenuKey,
  Unidade,
  UserPermissions,
  UserProfile,
} from './types/domain';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginScreen } from './components/LoginScreen';
import { DashboardView } from './components/DashboardView';
import { ImportarPlanilhaView } from './components/ImportarPlanilhaView';
import { ControleColetoresView } from './components/ControleColetoresView';
import { HistoricoEntregasView } from './components/HistoricoEntregasView';
import { RelatoriosView } from './components/RelatoriosView';
import { ConfiguracoesView } from './components/ConfiguracoesView';
import { ColaboradorFichaModal } from './components/ColaboradorFichaModal';
import { BrandLogo } from './components/BrandLogo';

const MENU_ITEMS: Array<{
  key: MenuKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'importar', label: 'Importar planilha', icon: FileSpreadsheet },
  { key: 'controle', label: 'Controle de coletores', icon: PackageCheck },
  { key: 'historico', label: 'Histórico de entregas', icon: History },
  { key: 'relatorios', label: 'Relatórios', icon: FileText },
  { key: 'configuracoes', label: 'Configurações', icon: Settings },
];

function hasMenuPermission(
  menuKey: MenuKey,
  perms: UserPermissions,
  isMasterAdmin: boolean
): boolean {
  if (isMasterAdmin) return true;
  switch (menuKey) {
    case 'dashboard':
      return true;
    case 'importar':
      return perms.importarPlanilhas;
    case 'controle':
      return perms.visualizarColaboradores || perms.marcarEntregas;
    case 'historico':
      return perms.consultarHistorico || perms.excluirHistorico;
    case 'relatorios':
      return perms.exportarRelatorios || perms.visualizarColaboradores || perms.consultarHistorico;
    case 'configuracoes':
      return perms.gerenciarUsuarios;
    default:
      return false;
  }
}

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedAcaoForControle, setSelectedAcaoForControle] = useState<string | undefined>(undefined);
  const [selectedColaboradorForFicha, setSelectedColaboradorForFicha] = useState<Colaborador | null>(
    null
  );

  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [importacaoItens, setImportacaoItens] = useState<ImportacaoItem[]>([]);
  const [entregas, setEntregas] = useState<Entrega[]>([]);

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          const profile = await ensureUserProfile(firebaseUser);
          setUserProfile(profile);
        } catch (err) {
          setDataError(err instanceof Error ? err.message : 'Erro ao carregar perfil.');
        }
      } else {
        setUserProfile(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const refreshData = useCallback(async () => {
    if (!user || !user.emailVerified) return;
    setLoadingData(true);
    setDataError(null);
    try {
      const [opData, itens] = await Promise.all([
        fetchAllOperationalData(user),
        fetchAllImportacaoItens(user),
      ]);
      setEmpresas(opData.empresas);
      setUnidades(opData.unidades);
      setAcoes(opData.acoes);
      setColaboradores(opData.colaboradores);
      setEntregas(opData.entregas);
      setImportacaoItens(itens);
    } catch (err) {
      setDataError(err instanceof Error ? err.message : 'Falha ao carregar dados do banco.');
    } finally {
      setLoadingData(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && user.emailVerified && userProfile) {
      refreshData();
    }
  }, [user, userProfile, refreshData]);

  const activeFichaColaborador = useMemo(() => {
    if (!selectedColaboradorForFicha) return null;
    return (
      colaboradores.find((c) => c.cpfHash === selectedColaboradorForFicha.cpfHash) ||
      selectedColaboradorForFicha
    );
  }, [selectedColaboradorForFicha, colaboradores]);

  const isMasterAdmin = (user?.email || '').toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;
  const effectivePermissions = useMemo(
    () => (userProfile ? resolveEffectivePermissions(userProfile) : null),
    [userProfile]
  );

  const visibleMenuItems = useMemo(() => {
    if (!effectivePermissions) return [];
    return MENU_ITEMS.filter((item) =>
      hasMenuPermission(item.key, effectivePermissions, isMasterAdmin)
    );
  }, [effectivePermissions, isMasterAdmin]);

  useEffect(() => {
    if (visibleMenuItems.length > 0 && !visibleMenuItems.some((m) => m.key === activeMenu)) {
      setActiveMenu(visibleMenuItems[0].key);
    }
  }, [visibleMenuItems, activeMenu]);

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Inicializando autenticação e banco de dados...</div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!user.emailVerified) {
    return <LoginScreen unverifiedUser={user} />;
  }

  if (!userProfile || !effectivePermissions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-sm text-slate-500">Carregando permissões de acesso...</div>
      </div>
    );
  }

  if (!userProfile.active) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Acesso Desativado</h2>
          <p className="text-sm text-slate-600">
            Sua conta ({user.email}) está temporariamente desativada. Solicite a reativação ao administrador do sistema.
          </p>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg"
          >
            Sair
          </button>
        </div>
      </div>
    );
  }

  const currentMenuAllowed = hasMenuPermission(activeMenu, effectivePermissions, isMasterAdmin);
  const currentMenuMeta = MENU_ITEMS.find((m) => m.key === activeMenu) || MENU_ITEMS[0];

  const handleNavigate = (menu: MenuKey) => {
    if (!hasMenuPermission(menu, effectivePermissions, isMasterAdmin)) return;
    setActiveMenu(menu);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar Desktop */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 shrink-0">
          <BrandLogo size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-slate-900 font-display whitespace-nowrap truncate">
              Gestão de Coletores
            </div>
            <div className="text-[11px] text-slate-400 leading-none truncate">Controle por CPF</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menu principal">
          {visibleMenuItems.map((item) => {
            const Icon = item.icon;
            const active = activeMenu === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 text-xs text-slate-500">
          <div className="font-medium text-slate-800 truncate">{userProfile.displayName}</div>
          <div className="truncate mt-0.5">{userProfile.email}</div>
          <div className="mt-1 text-[11px] text-teal-700 font-medium">
            {isMasterAdmin || userProfile.role === 'admin' ? 'Administrador' : 'Operador'}
          </div>
        </div>
      </aside>

      {/* Drawer Mobile / Tablet */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <BrandLogo size="sm" />
                <span className="text-sm font-bold text-slate-900 font-display truncate">
                  Gestão de Coletores
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {visibleMenuItems.map((item) => {
                const Icon = item.icon;
                const active = activeMenu === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleNavigate(item.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
                      active ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Área Principal */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 truncate">
              <span className="hidden sm:inline whitespace-nowrap">Gestão de Coletores</span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <span className="font-semibold text-slate-900 truncate">{currentMenuMeta.label}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={refreshData}
              disabled={loadingData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>

            <button
              type="button"
              onClick={() => signOut(auth)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-rose-700 hover:bg-rose-50 border border-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {dataError && (
            <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
              {dataError}
            </div>
          )}

          {!currentMenuAllowed ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
              <ShieldAlert className="w-8 h-8 text-rose-600 mx-auto" />
              <h2 className="text-lg font-semibold text-slate-900">Acesso Não Autorizado</h2>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Seu perfil não possui permissão para acessar esta funcionalidade. Solicite a liberação ao administrador em Configurações.
              </p>
            </div>
          ) : (
            <>
              {activeMenu === 'dashboard' && (
                <DashboardView
                  empresas={empresas}
                  unidades={unidades}
                  acoes={acoes}
                  colaboradores={colaboradores}
                  entregas={entregas}
                  importacaoItens={importacaoItens}
                  onNavigate={handleNavigate}
                  canImport={isMasterAdmin || effectivePermissions.importarPlanilhas}
                  canViewControle={
                    isMasterAdmin ||
                    effectivePermissions.visualizarColaboradores ||
                    effectivePermissions.marcarEntregas
                  }
                />
              )}

              {activeMenu === 'importar' && (
                <ImportarPlanilhaView
                  user={user}
                  empresas={empresas}
                  unidades={unidades}
                  onImportSuccess={async (acaoId) => {
                    await refreshData();
                    setSelectedAcaoForControle(acaoId);
                    if (hasMenuPermission('controle', effectivePermissions, isMasterAdmin)) {
                      setActiveMenu('controle');
                    }
                  }}
                />
              )}

              {activeMenu === 'controle' && (
                <ControleColetoresView
                  user={user}
                  acoes={acoes}
                  colaboradores={colaboradores}
                  importacaoItens={importacaoItens}
                  initialAcaoId={selectedAcaoForControle}
                  canMarkDelivery={isMasterAdmin || effectivePermissions.marcarEntregas}
                  canDeleteCadastro={isMasterAdmin || effectivePermissions.excluirCadastros}
                  onRefresh={refreshData}
                  onOpenColaborador={(colaborador) => setSelectedColaboradorForFicha(colaborador)}
                />
              )}

              {activeMenu === 'historico' && (
                <HistoricoEntregasView
                  user={user}
                  empresas={empresas}
                  unidades={unidades}
                  acoes={acoes}
                  colaboradores={colaboradores}
                  entregas={entregas}
                  canDeleteHistorico={isMasterAdmin || effectivePermissions.excluirHistorico}
                  onRefresh={refreshData}
                  onOpenColaborador={(colaborador) => setSelectedColaboradorForFicha(colaborador)}
                />
              )}

              {activeMenu === 'relatorios' && (
                <RelatoriosView
                  empresas={empresas}
                  unidades={unidades}
                  acoes={acoes}
                  colaboradores={colaboradores}
                  entregas={entregas}
                  importacaoItens={importacaoItens}
                  canExport={isMasterAdmin || effectivePermissions.exportarRelatorios}
                />
              )}

              {activeMenu === 'configuracoes' && (
                <ConfiguracoesView
                  user={user}
                  userProfile={userProfile}
                  onRefresh={refreshData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Modal Global de Ficha Individual por CPF */}
      {activeFichaColaborador && (
        <ColaboradorFichaModal
          user={user}
          colaborador={activeFichaColaborador}
          canMarkDelivery={isMasterAdmin || effectivePermissions.marcarEntregas}
          canDeleteCadastro={isMasterAdmin || effectivePermissions.excluirCadastros}
          onRefresh={refreshData}
          onDeleted={() => setSelectedColaboradorForFicha(null)}
          onClose={() => setSelectedColaboradorForFicha(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
