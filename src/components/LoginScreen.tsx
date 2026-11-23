import React, { useState } from 'react';
import {
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { Mail, Lock, ArrowRight, KeyRound, Info, CheckCircle2, RefreshCw } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';
import { BrandLogo } from './BrandLogo';

interface LoginScreenProps {
  unverifiedUser?: User | null;
}

export function LoginScreen({ unverifiedUser }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showProviderTip, setShowProviderTip] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao autenticar com o Google.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim() || !password) {
      setError('Informe o e-mail e a senha.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setShowProviderTip(true);
        setError('O provedor E-mail/Senha ainda não foi ativado no Firebase Console. Utilize o botão Google acima ou habilite E-mail/Senha no Console.');
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('E-mail ou senha inválidos.');
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao entrar.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    if (!email.trim()) {
      setError('Informe o e-mail cadastrado para recuperação.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSuccessMsg('E-mail de redefinição de senha enviado. Verifique sua caixa de entrada.');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setShowProviderTip(true);
        setError('Habilite o provedor E-mail/Senha no Firebase Console para utilizar recuperação por senha.');
      } else {
        setError(err instanceof Error ? err.message : 'Não foi possível enviar o e-mail de recuperação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedUser) return;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await sendEmailVerification(unverifiedUser);
      setSuccessMsg('Link de verificação reenviado para o seu e-mail. Confirme o link e clique em "Já verifiquei meu e-mail".');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao reenviar verificação.');
    } finally {
      setLoading(false);
    }
  };

  const handleReloadUser = async () => {
    if (!unverifiedUser) return;
    setLoading(true);
    try {
      await unverifiedUser.reload();
      window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  if (unverifiedUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">Verificação de E-mail Pendente</h1>
              <p className="text-xs text-slate-500">{unverifiedUser.email}</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">
            Para proteger o banco de dados corporativo, contas criadas com e-mail e senha precisam confirmar o link enviado para sua caixa de entrada antes de acessar o sistema.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={handleReloadUser}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
              Já verifiquei meu e-mail
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleResendVerification}
              className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg disabled:opacity-50"
            >
              Reenviar e-mail de verificação
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Entrar com outra conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center justify-center gap-3 mb-6">
          <BrandLogo size="lg" />
          <span className="text-xl font-bold tracking-tight text-slate-900 font-display text-center">
            Gestão de Coletores
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="mb-6">
            <h1 className="text-xl font-semibold text-slate-900">
              {mode === 'login' ? 'Acesso ao Sistema' : 'Recuperar Senha'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {mode === 'login'
                ? 'Entre com sua conta corporativa para controlar o recebimento de coletores por CPF.'
                : 'Informe seu e-mail para receber o link de redefinição.'}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-700">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="mb-5 p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
              {successMsg}
            </div>
          )}

          {showProviderTip && (
            <div className="mb-5 p-3.5 rounded-lg bg-cyan-50 border border-cyan-200 text-xs text-cyan-900 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <Info className="w-4 h-4 shrink-0 text-cyan-700" />
                <span>Como ativar E-mail/Senha no Firebase Console</span>
              </div>
              <p>
                Acesse Firebase Console &rarr; Authentication &rarr; Sign-in method &rarr; Adicionar novo provedor &rarr; E-mail/senha.
                Enquanto isso, você pode acessar imediatamente pelo botão Google abaixo.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-slate-900 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            Entrar com conta Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2.5 bg-white text-slate-400">ou com e-mail e senha</span>
            </div>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  E-mail corporativo
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@empresa.com.br"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-700">Senha</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('reset');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="text-xs font-medium text-teal-700 hover:text-teal-800"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <span>{loading ? 'Autenticando...' : 'Entrar no Sistema'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@empresa.com.br"
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 focus:border-teal-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <KeyRound className="w-4 h-4" />
                <span>{loading ? 'Enviando...' : 'Enviar link de recuperação'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setSuccessMsg(null);
                }}
                className="w-full text-center text-xs font-medium text-slate-600 hover:text-slate-900 py-1"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Dados protegidos conforme LGPD · Controle permanente de entregas por CPF
        </p>
      </div>
    </div>
  );
}
