'use client';

import React, { useEffect, useState } from 'react';
import { X, UserPlus, LogIn, Mail, Lock, User } from 'lucide-react';
import { AuthUser } from '@/shared/types';

interface AuthModalProps {
  open: boolean;
  initialMode?: 'register' | 'login';
  onClose: () => void;
  onAuthenticated: (user: AuthUser, mode: 'register' | 'login') => void;
}

export function AuthModal({
  open,
  initialMode = 'register',
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<'register' | 'login'>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setError(null);
    }
  }, [open, initialMode]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('As palavras-passe não coincidem.');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password }),
        });
        const data = (await res.json()) as { user?: AuthUser; error?: string };
        if (!res.ok || !data.user) {
          setError(data.error ?? 'Erro ao criar conta.');
          return;
        }
        onAuthenticated(data.user, 'register');
        onClose();
      } catch {
        setError('Falha de ligação ao servidor.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error ?? 'Credenciais inválidas.');
        return;
      }
      onAuthenticated(data.user, 'login');
      onClose();
    } catch {
      setError('Falha de ligação ao servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#181921] border border-[#2d303e] rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[#262835] flex items-center justify-between bg-[#14151b]">
          <div className="flex items-center gap-2">
            {mode === 'register' ? (
              <UserPlus className="w-4 h-4 text-[#36b51a]" />
            ) : (
              <LogIn className="w-4 h-4 text-[#36b51a]" />
            )}
            <h2 className="text-sm font-bold text-white">
              {mode === 'register' ? 'Criar Conta Virtual' : 'Entrar na Conta'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-[#8c909e] hover:text-white hover:bg-[#232532]"
            aria-label="Fechar janela de conta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Tabs */}
          <div className="grid grid-cols-2 gap-1 bg-[#121319] p-1 rounded-full border border-[#252734]">
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-1.5 rounded-full text-xs font-semibold transition-colors ${
                mode === 'register'
                  ? 'bg-[#2c2d37] text-white'
                  : 'text-[#8e92a1] hover:text-white'
              }`}
            >
              Criar Conta
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-1.5 rounded-full text-xs font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-[#2c2d37] text-white'
                  : 'text-[#8e92a1] hover:text-white'
              }`}
            >
              Entrar
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded-xl bg-[#34161e] border border-[#e50539]/60 text-xs text-[#ff9bb0]">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' ? (
              <>
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[#a5a8b6]">
                    Nome de utilizador
                  </span>
                  <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#36b51a]">
                    <User className="w-4 h-4 text-[#787c8c] shrink-0" />
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={20}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ex.: piloto_mz"
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                    />
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[#a5a8b6]">
                    Email
                  </span>
                  <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#36b51a]">
                    <Mail className="w-4 h-4 text-[#787c8c] shrink-0" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@exemplo.com"
                      className="w-full bg-transparent text-xs text-white focus:outline-none"
                    />
                  </div>
                </label>
              </>
            ) : (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#a5a8b6]">
                  Email ou nome de utilizador
                </span>
                <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#36b51a]">
                  <User className="w-4 h-4 text-[#787c8c] shrink-0" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="piloto_mz ou email@exemplo.com"
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                </div>
              </label>
            )}

            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[#a5a8b6]">
                Palavra-passe
              </span>
              <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#36b51a]">
                <Lock className="w-4 h-4 text-[#787c8c] shrink-0" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-transparent text-xs text-white focus:outline-none"
                />
              </div>
            </label>

            {mode === 'register' && (
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#a5a8b6]">
                  Confirmar palavra-passe
                </span>
                <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#36b51a]">
                  <Lock className="w-4 h-4 text-[#787c8c] shrink-0" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a palavra-passe"
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                </div>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-b from-[#39ba1d] to-[#279914] hover:from-[#40c922] hover:to-[#2da918] text-white text-xs font-bold shadow-md transition-all disabled:opacity-50"
            >
              {loading
                ? 'A processar...'
                : mode === 'register'
                  ? 'Criar Conta (1,000.00 MZN virtuais)'
                  : 'Entrar na Conta'}
            </button>
          </form>

          <p className="text-[10px] text-center text-[#787c8c]">
            Conta com créditos virtuais guardados na base de dados para histórico e saldo persistente.
          </p>
        </div>
      </div>
    </div>
  );
}
