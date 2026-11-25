'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ClipboardList,
  Database,
  Download,
  History,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AviatorLogo } from '@/components/icons/AviatorLogo';
import { formatMoney, getMultiplierBadgeColor } from '@/shared/format';
import {
  AuthUser,
  GameEngineConfig,
  LivePlayerBet,
  PersonalBetRecord,
  RoundHistoryItem,
  RoundPhase,
  TopWinRecord,
} from '@/shared/types';

interface AdminUserRow {
  id: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
  status: 'active' | 'blocked';
  maskedName: string;
  balance: number;
  currency: string;
  betsCount: number;
  recentBets: PersonalBetRecord[];
  createdAt: string;
}

interface AdminAuditEntry {
  id: string;
  timestamp: number;
  actorEmail: string;
  action: string;
  target: string;
  details: string;
}

interface AdminOverviewData {
  mongoConnected: boolean;
  stats: {
    totalUsers: number;
    activeUsers: number;
    blockedUsers: number;
    totalVirtualBalance: number;
    totalUserBets: number;
    totalWagered: number;
    totalPaidOut: number;
    connectedClients: number;
    authenticatedOnline: number;
  };
  multiplierStats: {
    totalRounds: number;
    under2x: number;
    from2to10x: number;
    over10x: number;
  };
  liveRound: {
    roundId: number;
    phase: RoundPhase;
    multiplier: number;
    totalBetsCount: number;
    remainingBetsCount: number;
    totalRoundPayout: number;
    liveBets: LivePlayerBet[];
  };
  history: RoundHistoryItem[];
  topWins: TopWinRecord[];
  engineConfig: GameEngineConfig;
  auditLogs: AdminAuditEntry[];
  users: AdminUserRow[];
}

type AdminTab = 'users' | 'rounds' | 'config' | 'audit';

export default function AdminPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modals state
  const [balanceTarget, setBalanceTarget] = useState<AdminUserRow | null>(null);
  const [balanceMode, setBalanceMode] = useState<'add' | 'set'>('add');
  const [balanceAmount, setBalanceAmount] = useState('500');
  const [betsModalUser, setBetsModalUser] = useState<AdminUserRow | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUserRow | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserRow | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'user' | 'admin'>('user');
  const [createBalance, setCreateBalance] = useState('1000');

  const [configDraft, setConfigDraft] = useState<GameEngineConfig | null>(null);

  const notify = useCallback((type: 'ok' | 'err', text: string) => {
    setBanner({ type, text });
    setTimeout(() => setBanner(null), 4000);
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = (await res.json()) as { user: AuthUser | null };
      setCurrentUser(data.user ?? null);
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/overview', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as AdminOverviewData;
      setOverview(data);
      setConfigDraft((prev) => prev ?? data.engineConfig);
    } catch {
      // ignore transient poll errors
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    fetchOverview();
    const id = setInterval(fetchOverview, 3000);
    return () => clearInterval(id);
  }, [currentUser, fetchOverview]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: loginEmail, password: loginPassword }),
      });
      const data = (await res.json()) as { user?: AuthUser; error?: string };
      if (!res.ok || !data.user) {
        setLoginError(data.error ?? 'Credenciais inválidas.');
        return;
      }
      if (data.user.role !== 'admin') {
        setLoginError('Esta conta não tem permissões de administrador.');
        setCurrentUser(data.user);
        return;
      }
      setCurrentUser(data.user);
    } catch {
      setLoginError('Erro de ligação ao servidor.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    setOverview(null);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: createUsername,
        email: createEmail,
        password: createPassword,
        role: createRole,
        balance: parseFloat(createBalance) || 1000,
      }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok) {
      notify('err', data.error ?? 'Erro ao criar conta.');
      return;
    }
    setCreateOpen(false);
    setCreateUsername('');
    setCreateEmail('');
    setCreatePassword('');
    setCreateRole('user');
    setCreateBalance('1000');
    notify('ok', 'Conta criada com sucesso.');
    fetchOverview();
  };

  const handleUpdateBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!balanceTarget) return;
    const parsed = parseFloat(balanceAmount);
    if (!Number.isFinite(parsed)) return;

    const res = await fetch(`/api/admin/users/${balanceTarget.id}/balance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: balanceMode, amount: parsed }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (res.ok) {
      notify('ok', `Saldo de ${balanceTarget.username} actualizado.`);
      setBalanceTarget(null);
      fetchOverview();
    } else {
      notify('err', data.error ?? 'Erro ao actualizar saldo.');
    }
  };

  const handleToggleRole = async (u: AdminUserRow) => {
    const nextRole = u.role === 'admin' ? 'user' : 'admin';
    const res = await fetch(`/api/admin/users/${u.id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: nextRole }),
    });
    const data = (await res.json()) as { error?: string };
    if (res.ok) {
      notify('ok', `Permissões de ${u.username} alteradas para ${nextRole}.`);
      fetchOverview();
    } else {
      notify('err', data.error ?? 'Erro ao alterar função.');
    }
  };

  const handleToggleStatus = async (u: AdminUserRow) => {
    const nextStatus = u.status === 'blocked' ? 'active' : 'blocked';
    const res = await fetch(`/api/admin/users/${u.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = (await res.json()) as { error?: string };
    if (res.ok) {
      notify(
        'ok',
        nextStatus === 'blocked'
          ? `Conta ${u.username} bloqueada.`
          : `Conta ${u.username} desbloqueada.`
      );
      fetchOverview();
    } else {
      notify('err', data.error ?? 'Erro ao alterar estado.');
    }
  };

  const handleRevokeSession = async (u: AdminUserRow) => {
    const res = await fetch(`/api/admin/users/${u.id}/revoke`, {
      method: 'POST',
    });
    if (res.ok) {
      notify('ok', `Sessões de ${u.username} encerradas.`);
      fetchOverview();
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;
    const res = await fetch(`/api/admin/users/${passwordTarget.id}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPasswordInput }),
    });
    const data = (await res.json()) as { error?: string };
    if (res.ok) {
      notify('ok', `Senha de ${passwordTarget.username} redefinida.`);
      setPasswordTarget(null);
      setNewPasswordInput('');
      fetchOverview();
    } else {
      notify('err', data.error ?? 'Erro ao redefinir senha.');
    }
  };

  const confirmDeleteUser = async () => {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { error?: string };
    if (res.ok) {
      notify('ok', `Conta ${deleteTarget.username} removida.`);
      setDeleteTarget(null);
      fetchOverview();
    } else {
      notify('err', data.error ?? 'Erro ao remover conta.');
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configDraft) return;
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configDraft),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      engineConfig?: GameEngineConfig;
      error?: string;
    };
    if (res.ok && data.engineConfig) {
      setConfigDraft(data.engineConfig);
      notify('ok', 'Configurações do motor actualizadas ao vivo.');
      fetchOverview();
    } else {
      notify('err', data.error ?? 'Erro ao guardar configurações.');
    }
  };

  const exportCsv = (filename: string, rows: string[][]) => {
    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredUsers = useMemo(() => {
    if (!overview) return [];
    const q = searchQuery.trim().toLowerCase();
    return overview.users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (
        q &&
        !u.username.toLowerCase().includes(q) &&
        !u.email.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [overview, searchQuery, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredUsers.slice(start, start + PAGE_SIZE);
  }, [filteredUsers, page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, roleFilter, statusFilter]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0e0f14] text-white flex items-center justify-center text-sm text-[#8e92a1]">
        A verificar sessão administrativa...
      </div>
    );
  }

  if (!currentUser || currentUser.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0e0f14] text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#181921] border border-[#2c2f3d] rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#252734] bg-[#14151b] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AviatorLogo size="sm" />
              <span className="px-2 py-0.5 rounded-full bg-[#e50539]/15 border border-[#e50539]/40 text-[11px] font-bold text-[#ff6b89]">
                ADMIN
              </span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs text-[#9ea2b0] hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao Jogo
            </Link>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#e50539]" />
                Área Administrativa
              </h1>
              <p className="text-xs text-[#8d91a0] mt-1">
                Inicie sessão com uma conta de administrador para gerir utilizadores, saldos virtuais e configurações do motor.
              </p>
            </div>

            {currentUser && currentUser.role !== 'admin' && (
              <div className="p-3 rounded-xl bg-[#34161e] border border-[#e50539]/50 text-xs text-[#ff9bb0] flex items-center justify-between gap-2">
                <span>
                  Sessão actual ({currentUser.email}) não é administradora.
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-2.5 py-1 rounded-lg bg-[#e50539] text-white font-semibold shrink-0"
                >
                  Sair
                </button>
              </div>
            )}

            {loginError && (
              <div className="p-3 rounded-xl bg-[#34161e] border border-[#e50539]/50 text-xs text-[#ff9bb0]">
                {loginError}
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#a5a8b6]">
                  Email de Administrador
                </span>
                <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#e50539]">
                  <Mail className="w-4 h-4 text-[#787c8c] shrink-0" />
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="admin@bombabet.com"
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                </div>
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[#a5a8b6]">
                  Palavra-passe
                </span>
                <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 focus-within:border-[#e50539]">
                  <Lock className="w-4 h-4 text-[#787c8c] shrink-0" />
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-2.5 rounded-xl bg-gradient-to-b from-[#e50539] to-[#b5042d] hover:from-[#f01347] hover:to-[#c90533] text-white text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                {loginSubmitting ? 'A autenticar...' : 'Entrar no Painel Admin'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const multTotal = Math.max(1, overview?.multiplierStats.totalRounds ?? 1);
  const pctUnder2 = Math.round(((overview?.multiplierStats.under2x ?? 0) / multTotal) * 100);
  const pct2to10 = Math.round(((overview?.multiplierStats.from2to10x ?? 0) / multTotal) * 100);
  const pctOver10 = Math.max(0, 100 - pctUnder2 - pct2to10);

  return (
    <div className="min-h-screen bg-[#0e0f14] text-white flex flex-col">
      {/* Header */}
      <header className="bg-[#14151b] border-b border-[#242632] px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AviatorLogo size="md" />
            <span className="px-2.5 py-0.5 rounded-full bg-[#e50539]/15 border border-[#e50539]/40 text-[11px] font-bold text-[#ff6b89]">
              ÁREA ADMINISTRATIVA
            </span>
            {overview && (
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] border ${
                  overview.mongoConnected
                    ? 'bg-[#152917] border-[#29552e] text-[#7ef263]'
                    : 'bg-[#331a1f] border-[#662c38] text-[#ff8fa5]'
                }`}
              >
                <Database className="w-3 h-3" />
                {overview.mongoConnected ? 'nhabombabetdb • Ligado' : 'BD Desligada'}
              </span>
            )}
            {overview?.engineConfig.maintenanceMode && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/50 text-[11px] font-bold text-amber-300">
                MANUTENÇÃO ACTIVA
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden md:inline text-xs text-[#9ea2b0]">
              {currentUser.email}
            </span>
            <button
              type="button"
              onClick={fetchOverview}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d1f29] hover:bg-[#272a38] border border-[#2f3344] text-xs font-medium text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Actualizar
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2ca616] hover:bg-[#34bd1b] text-xs font-bold text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Ir para o Jogo
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2b171d] hover:bg-[#3c1e26] border border-[#5c2836] text-xs font-semibold text-[#ff93aa]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-5">
        {banner && (
          <div
            className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
              banner.type === 'ok'
                ? 'bg-[#152d17] border-[#36b51a] text-[#8df774]'
                : 'bg-[#34161e] border-[#e50539] text-[#ff9bb0]'
            }`}
          >
            {banner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{banner.text}</span>
          </div>
        )}

        {/* KPI Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#181921] border border-[#262835] rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-[#8d91a0]">
              <span>Contas Registadas</span>
              <Users className="w-4 h-4 text-[#3999f7]" />
            </div>
            <div className="text-2xl font-black font-mono mt-2">
              {overview?.stats.totalUsers ?? '—'}
            </div>
            <div className="text-[11px] text-[#707484] mt-1">
              {overview?.stats.activeUsers ?? 0} activas • {overview?.stats.blockedUsers ?? 0} bloqueadas
            </div>
          </div>

          <div className="bg-[#181921] border border-[#262835] rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-[#8d91a0]">
              <span>Saldo Virtual Total</span>
              <Wallet className="w-4 h-4 text-[#36b51a]" />
            </div>
            <div className="text-2xl font-black font-mono text-[#36b51a] mt-2">
              {overview ? `${formatMoney(overview.stats.totalVirtualBalance)} MZN` : '—'}
            </div>
            <div className="text-[11px] text-[#707484] mt-1">
              Apostado: {formatMoney(overview?.stats.totalWagered ?? 0)} • Pago: {formatMoney(overview?.stats.totalPaidOut ?? 0)}
            </div>
          </div>

          <div className="bg-[#181921] border border-[#262835] rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-[#8d91a0]">
              <span>Ronda em Tempo Real</span>
              <History className="w-4 h-4 text-[#e50539]" />
            </div>
            <div className="text-2xl font-black font-mono mt-2 flex items-baseline gap-2">
              <span>#{overview?.liveRound.roundId ?? '—'}</span>
              <span className="text-base text-[#ef9b1a]">
                {overview ? `${overview.liveRound.multiplier.toFixed(2)}x` : ''}
              </span>
            </div>
            <div className="text-[11px] text-[#707484] mt-1">
              Estado: {overview?.liveRound.phase ?? '—'} • {overview?.liveRound.totalBetsCount ?? 0} apostas
            </div>
          </div>

          <div className="bg-[#181921] border border-[#262835] rounded-2xl p-4">
            <div className="flex items-center justify-between text-xs text-[#8d91a0]">
              <span>Ligações WebSocket</span>
              <Shield className="w-4 h-4 text-[#9d5cf6]" />
            </div>
            <div className="text-2xl font-black font-mono mt-2">
              {overview?.stats.connectedClients ?? 0}
            </div>
            <div className="text-[11px] text-[#707484] mt-1">
              {overview?.stats.authenticatedOnline ?? 0} autenticados online
            </div>
          </div>
        </section>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              activeTab === 'users'
                ? 'bg-[#2c2d37] border-[#424554] text-white'
                : 'bg-[#15161d] border-[#242632] text-[#8e92a1] hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Gestão de Utilizadores
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rounds')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              activeTab === 'rounds'
                ? 'bg-[#2c2d37] border-[#424554] text-white'
                : 'bg-[#15161d] border-[#242632] text-[#8e92a1] hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Rondas & Estatísticas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('config')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              activeTab === 'config'
                ? 'bg-[#2c2d37] border-[#424554] text-white'
                : 'bg-[#15161d] border-[#242632] text-[#8e92a1] hover:text-white'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            Configurações do Jogo
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
              activeTab === 'audit'
                ? 'bg-[#2c2d37] border-[#424554] text-white'
                : 'bg-[#15161d] border-[#242632] text-[#8e92a1] hover:text-white'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Auditoria ({overview?.auditLogs.length ?? 0})
          </button>
        </div>

        {/* TAB 1: USERS */}
        {activeTab === 'users' && (
          <section className="bg-[#181921] border border-[#262835] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#242632] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-white mr-2">
                  Contas em <code className="text-[#7ef263]">nhabombabetdb.Users</code>
                </h2>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2ca616] hover:bg-[#34bd1b] text-xs font-bold text-white"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Novo Utilizador
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportCsv('utilizadores-aviator.csv', [
                      ['Username', 'Email', 'Funcao', 'Estado', 'Saldo', 'Moeda', 'Apostas'],
                      ...filteredUsers.map((u) => [
                        u.username,
                        u.email,
                        u.role,
                        u.status,
                        u.balance.toFixed(2),
                        u.currency,
                        String(u.betsCount),
                      ]),
                    ])
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1e202b] hover:bg-[#282b39] border border-[#313547] text-xs text-[#d2d5e0]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar CSV
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value as 'all' | 'admin' | 'user')}
                  className="bg-[#121319] border border-[#282b38] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="all">Todas funções</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'blocked')}
                  className="bg-[#121319] border border-[#282b38] rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
                >
                  <option value="all">Todos estados</option>
                  <option value="active">Activos</option>
                  <option value="blocked">Bloqueados</option>
                </select>
                <div className="flex items-center gap-2 bg-[#121319] border border-[#282b38] rounded-xl px-3 py-1.5 w-full sm:w-64">
                  <Search className="w-4 h-4 text-[#787c8c] shrink-0" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar utilizador ou email..."
                    className="w-full bg-transparent text-xs text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#14151b] border-b border-[#242632] text-[#858999]">
                    <th className="py-2.5 px-4 font-semibold">Utilizador</th>
                    <th className="py-2.5 px-4 font-semibold">Email</th>
                    <th className="py-2.5 px-4 font-semibold">Função / Estado</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Saldo Virtual</th>
                    <th className="py-2.5 px-4 font-semibold text-center">Apostas</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222430]">
                  {paginatedUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-[#1d1f29]/70">
                      <td className="py-3 px-4 font-semibold text-white">
                        {u.username}
                      </td>
                      <td className="py-3 px-4 text-[#b4b7c4] font-mono">
                        {u.email}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              u.role === 'admin'
                                ? 'bg-[#e50539]/20 text-[#ff708c] border border-[#e50539]/40'
                                : 'bg-[#252734] text-[#b4b7c4]'
                            }`}
                          >
                            {u.role}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              u.status === 'blocked'
                                ? 'bg-[#3b151e] text-[#ff708c] border border-[#6e2436]'
                                : 'bg-[#152d17] text-[#7ef263] border border-[#28542c]'
                            }`}
                          >
                            {u.status === 'blocked' ? 'Bloqueado' : 'Activo'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#36b51a]">
                        {formatMoney(u.balance)} {u.currency}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-[#c8cbd6]">
                        {u.betsCount}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setBalanceTarget(u);
                              setBalanceMode('add');
                              setBalanceAmount('500');
                            }}
                            className="px-2 py-1 rounded-lg bg-[#19331c] hover:bg-[#224626] border border-[#36b51a]/50 text-[#7ef263] text-[11px] font-semibold"
                          >
                            Saldo
                          </button>
                          <button
                            type="button"
                            onClick={() => setBetsModalUser(u)}
                            className="px-2 py-1 rounded-lg bg-[#1e202b] hover:bg-[#292c3b] border border-[#313547] text-white text-[11px]"
                          >
                            Apostas
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordTarget(u);
                              setNewPasswordInput('');
                            }}
                            title="Redefinir palavra-passe"
                            className="p-1.5 rounded-lg bg-[#1e202b] hover:bg-[#292c3b] border border-[#313547] text-[#b4b7c4] hover:text-white"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>
                          {u.email.toLowerCase() !== 'admin@bombabet.com' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleRole(u)}
                                className="px-2 py-1 rounded-lg bg-[#1e202b] hover:bg-[#292c3b] border border-[#313547] text-[#a5a8b6] hover:text-white text-[11px]"
                              >
                                {u.role === 'admin' ? 'User' : 'Admin'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(u)}
                                title={u.status === 'blocked' ? 'Desbloquear conta' : 'Bloquear conta'}
                                className={`px-2 py-1 rounded-lg border text-[11px] inline-flex items-center gap-1 ${
                                  u.status === 'blocked'
                                    ? 'bg-[#173019] border-[#36b51a]/50 text-[#7ef263]'
                                    : 'bg-[#2e1b18] border-[#6e3a28] text-amber-300'
                                }`}
                              >
                                <Ban className="w-3 h-3" />
                                {u.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRevokeSession(u)}
                                className="px-2 py-1 rounded-lg bg-[#1e202b] hover:bg-[#292c3b] border border-[#313547] text-[#a5a8b6] hover:text-white text-[11px]"
                                title="Terminar sessão remota"
                              >
                                Revogar
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(u)}
                                title="Remover conta"
                                className="p-1.5 rounded-lg bg-[#2b171d] hover:bg-[#3f1f28] border border-[#5c2836] text-[#ff849d]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedUsers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#7c8090]">
                        Nenhum utilizador encontrado para os filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-[#242632] flex items-center justify-between text-xs text-[#9ea2b0]">
                <span>
                  Página {page} de {totalPages} ({filteredUsers.length} contas)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded-lg bg-[#1e202b] border border-[#313547] disabled:opacity-40"
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded-lg bg-[#1e202b] border border-[#313547] disabled:opacity-40"
                  >
                    Seguinte
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* TAB 2: ROUNDS & STATS */}
        {activeTab === 'rounds' && (
          <div className="space-y-4">
            {/* Multiplier Distribution */}
            <section className="bg-[#181921] border border-[#262835] rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">
                  Distribuição de Multiplicadores ({overview?.multiplierStats.totalRounds ?? 0} rondas)
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    exportCsv('rondas-aviator.csv', [
                      ['Ronda', 'Crash', 'DataHora', 'SHA256'],
                      ...(overview?.history ?? []).map((r) => [
                        String(r.roundId),
                        r.crashPoint.toFixed(2),
                        new Date(r.timestamp).toISOString(),
                        r.hash,
                      ]),
                    ])
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1e202b] hover:bg-[#282b39] border border-[#313547] text-xs text-[#d2d5e0]"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar CSV
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="bg-[#121319] border border-[#242632] rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#3999f7] font-bold">Baixos (&lt; 2.00x)</span>
                    <span className="font-mono">
                      {overview?.multiplierStats.under2x ?? 0} ({pctUnder2}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1e2230] overflow-hidden">
                    <div className="h-full bg-[#3999f7]" style={{ width: `${pctUnder2}%` }} />
                  </div>
                </div>
                <div className="bg-[#121319] border border-[#242632] rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#9d5cf6] font-bold">Médios (2.00x – 9.99x)</span>
                    <span className="font-mono">
                      {overview?.multiplierStats.from2to10x ?? 0} ({pct2to10}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1e2230] overflow-hidden">
                    <div className="h-full bg-[#9d5cf6]" style={{ width: `${pct2to10}%` }} />
                  </div>
                </div>
                <div className="bg-[#121319] border border-[#242632] rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-[#e938a3] font-bold">Altos (≥ 10.00x)</span>
                    <span className="font-mono">
                      {overview?.multiplierStats.over10x ?? 0} ({pctOver10}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#1e2230] overflow-hidden">
                    <div className="h-full bg-[#e938a3]" style={{ width: `${pctOver10}%` }} />
                  </div>
                </div>
              </div>
            </section>

            {/* Live Bets + Top Wins */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="bg-[#181921] border border-[#262835] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#242632] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">
                    Apostas na Ronda Actual (#{overview?.liveRound.roundId})
                  </h3>
                  <span className="text-xs font-mono text-[#ef9b1a]">
                    {overview?.liveRound.phase} • {overview?.liveRound.multiplier.toFixed(2)}x
                  </span>
                </div>
                <div className="p-3 max-h-72 overflow-y-auto space-y-1.5 text-xs">
                  {(overview?.liveRound.liveBets ?? []).length === 0 ? (
                    <div className="text-center py-6 text-[#787c8c]">
                      Sem apostas activas neste instante.
                    </div>
                  ) : (
                    (overview?.liveRound.liveBets ?? []).map((b) => (
                      <div
                        key={b.id}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-lg border ${
                          b.cashoutMultiplier
                            ? 'bg-[#172e19] border-[#274b29]'
                            : 'bg-[#13141a] border-[#232530]'
                        }`}
                      >
                        <span className="font-mono text-[#d8dae2]">{b.maskedName}</span>
                        <span className="font-mono">{formatMoney(b.betAmount)} MZN</span>
                        <span className="font-mono font-bold text-[#7ef263]">
                          {b.cashoutMultiplier
                            ? `${b.cashoutMultiplier.toFixed(2)}x (${formatMoney(b.payout ?? 0)})`
                            : 'Em jogo'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="bg-[#181921] border border-[#262835] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#242632] flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Principais Ganhos da Sessão
                  </h3>
                </div>
                <div className="p-3 max-h-72 overflow-y-auto space-y-1.5 text-xs">
                  {(overview?.topWins ?? []).length === 0 ? (
                    <div className="text-center py-6 text-[#787c8c]">
                      Os maiores ganhos aparecerão aqui após algumas rondas.
                    </div>
                  ) : (
                    (overview?.topWins ?? []).map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center justify-between px-3 py-1.5 rounded-lg border bg-[#172e19] border-[#274b29]"
                      >
                        <span className="font-mono text-white">
                          {w.maskedName} <span className="text-[#889e8a]">#{w.roundId}</span>
                        </span>
                        <span className="font-mono text-[#c5dec7]">
                          {formatMoney(w.betAmount)} × {w.cashoutMultiplier.toFixed(2)}x
                        </span>
                        <span className="font-mono font-bold text-[#7df564]">
                          {formatMoney(w.payout)} MZN
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Rounds Table */}
            <section className="bg-[#181921] border border-[#262835] rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-[#242632] flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">
                  Últimas Rondas Geradas no Servidor
                </h2>
                <span className="text-xs text-[#8d91a0]">
                  Aleatoriedade criptográfica via <code className="text-white">crypto.randomBytes</code>
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#14151b] border-b border-[#242632] text-[#858999]">
                      <th className="py-2.5 px-4 font-semibold">Ronda</th>
                      <th className="py-2.5 px-4 font-semibold">Multiplicador Crash</th>
                      <th className="py-2.5 px-4 font-semibold">Hora</th>
                      <th className="py-2.5 px-4 font-semibold">Hash SHA-256</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222430]">
                    {(overview?.history ?? []).map((r) => (
                      <tr key={r.roundId} className="hover:bg-[#1d1f29]/70">
                        <td className="py-2.5 px-4 font-mono font-bold text-white">
                          #{r.roundId}
                        </td>
                        <td
                          className={`py-2.5 px-4 font-mono font-bold ${getMultiplierBadgeColor(
                            r.crashPoint
                          )}`}
                        >
                          {r.crashPoint.toFixed(2)}x
                        </td>
                        <td className="py-2.5 px-4 text-[#a5a8b6] font-mono">
                          {new Date(r.timestamp).toLocaleTimeString('pt-PT')}
                        </td>
                        <td className="py-2.5 px-4 text-[#787c8c] font-mono text-[11px] truncate max-w-[320px]">
                          {r.hash}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: ENGINE CONFIG */}
        {activeTab === 'config' && configDraft && (
          <section className="bg-[#181921] border border-[#262835] rounded-2xl p-5 max-w-2xl">
            <h2 className="text-sm font-bold text-white mb-1">
              Configurações do Motor de Jogo em Tempo Real
            </h2>
            <p className="text-xs text-[#8d91a0] mb-4">
              Alterações aplicadas imediatamente no servidor sem reiniciar a aplicação.
            </p>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[#a5a8b6]">Aposta Mínima (MZN)</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={configDraft.minBet}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, minBet: parseFloat(e.target.value) || 0.1 })
                    }
                    className="w-full bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 font-mono text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[#a5a8b6]">Aposta Máxima (MZN)</span>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={configDraft.maxBet}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, maxBet: parseFloat(e.target.value) || 10000 })
                    }
                    className="w-full bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 font-mono text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[#a5a8b6]">Contagem Decrescente (ms)</span>
                  <input
                    type="number"
                    step="500"
                    min="2000"
                    max="15000"
                    value={configDraft.countdownMs}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        countdownMs: parseInt(e.target.value, 10) || 5500,
                      })
                    }
                    className="w-full bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 font-mono text-white"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[#a5a8b6]">Taxa de Crescimento (growthRate)</span>
                  <input
                    type="number"
                    step="0.000005"
                    min="0.00003"
                    max="0.00018"
                    value={configDraft.growthRate}
                    onChange={(e) =>
                      setConfigDraft({
                        ...configDraft,
                        growthRate: parseFloat(e.target.value) || 0.000068,
                      })
                    }
                    className="w-full bg-[#121319] border border-[#282b38] rounded-xl px-3 py-2 font-mono text-white"
                  />
                </label>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center justify-between p-3 rounded-xl bg-[#121319] border border-[#252734] cursor-pointer">
                  <div>
                    <div className="font-semibold text-white">Jogadores Simulados (Bots)</div>
                    <div className="text-[11px] text-[#7c8090]">
                      Activa ou desactiva apostas simuladas globais para todos os clientes.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={configDraft.botsEnabled}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, botsEnabled: e.target.checked })
                    }
                    className="accent-[#36b51a] w-4 h-4"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl bg-[#121319] border border-[#252734] cursor-pointer">
                  <div>
                    <div className="font-semibold text-amber-300">Modo Manutenção</div>
                    <div className="text-[11px] text-[#7c8090]">
                      Pausa o início de novas rondas e impede novas apostas enquanto activo.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={configDraft.maintenanceMode}
                    onChange={(e) =>
                      setConfigDraft({ ...configDraft, maintenanceMode: e.target.checked })
                    }
                    className="accent-amber-400 w-4 h-4"
                  />
                </label>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-[#2ca616] hover:bg-[#34bd1b] text-white font-bold"
              >
                Aplicar Configurações no Servidor
              </button>
            </form>
          </section>
        )}

        {/* TAB 4: AUDIT LOG */}
        {activeTab === 'audit' && (
          <section className="bg-[#181921] border border-[#262835] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[#242632]">
              <h2 className="text-sm font-bold text-white">
                Registo de Auditoria Administrativa
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#14151b] border-b border-[#242632] text-[#858999]">
                    <th className="py-2.5 px-4 font-semibold">Hora</th>
                    <th className="py-2.5 px-4 font-semibold">Administrador</th>
                    <th className="py-2.5 px-4 font-semibold">Acção</th>
                    <th className="py-2.5 px-4 font-semibold">Alvo</th>
                    <th className="py-2.5 px-4 font-semibold">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#222430]">
                  {(overview?.auditLogs ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#787c8c]">
                        Ainda não existem acções registadas nesta sessão.
                      </td>
                    </tr>
                  ) : (
                    (overview?.auditLogs ?? []).map((entry) => (
                      <tr key={entry.id} className="hover:bg-[#1d1f29]/70">
                        <td className="py-2.5 px-4 font-mono text-[#9ea2b0]">
                          {new Date(entry.timestamp).toLocaleTimeString('pt-PT')}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-white">
                          {entry.actorEmail}
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-[#7ef263]">
                          {entry.action}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[#d2d5e0]">
                          {entry.target}
                        </td>
                        <td className="py-2.5 px-4 text-[#a5a8b6]">{entry.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {/* Create User Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md bg-[#181921] border border-[#2d303e] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#262835] bg-[#14151b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Criar Nova Conta</h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1 text-[#8c909e] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="p-4 space-y-3 text-xs">
              <input
                type="text"
                required
                minLength={3}
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                placeholder="Nome de utilizador"
                className="w-full bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 text-white"
              />
              <input
                type="email"
                required
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="Email"
                className="w-full bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 text-white"
              />
              <input
                type="password"
                required
                minLength={6}
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Palavra-passe (mín. 6 caracteres)"
                className="w-full bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value as 'user' | 'admin')}
                  className="bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 text-white"
                >
                  <option value="user">Utilizador</option>
                  <option value="admin">Administrador</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={createBalance}
                  onChange={(e) => setCreateBalance(e.target.value)}
                  placeholder="Saldo inicial"
                  className="bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 font-mono text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#2ca616] hover:bg-[#34bd1b] text-white font-bold"
              >
                Criar Conta na Base de Dados
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Balance Modal */}
      {balanceTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setBalanceTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#181921] border border-[#2d303e] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#262835] bg-[#14151b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Ajustar Saldo — {balanceTarget.username}
              </h3>
              <button
                type="button"
                onClick={() => setBalanceTarget(null)}
                className="p-1 text-[#8c909e] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateBalance} className="p-4 space-y-3 text-xs">
              <div className="text-[#9ea2b0]">
                Saldo actual:{' '}
                <strong className="text-[#36b51a] font-mono">
                  {formatMoney(balanceTarget.balance)} {balanceTarget.currency}
                </strong>
              </div>
              <div className="grid grid-cols-2 gap-1.5 bg-[#121319] p-1 rounded-full border border-[#262834]">
                <button
                  type="button"
                  onClick={() => setBalanceMode('add')}
                  className={`py-1.5 rounded-full font-semibold ${
                    balanceMode === 'add' ? 'bg-[#2c2d37] text-white' : 'text-[#8e92a1]'
                  }`}
                >
                  Adicionar (+)
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceMode('set')}
                  className={`py-1.5 rounded-full font-semibold ${
                    balanceMode === 'set' ? 'bg-[#2c2d37] text-white' : 'text-[#8e92a1]'
                  }`}
                >
                  Definir Exacto
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                value={balanceAmount}
                onChange={(e) => setBalanceAmount(e.target.value)}
                className="w-full bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 font-mono font-bold text-white focus:outline-none focus:border-[#36b51a]"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-[#2ca616] hover:bg-[#34bd1b] text-white font-bold"
              >
                Guardar Saldo Virtual
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {passwordTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPasswordTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#181921] border border-[#2d303e] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#262835] bg-[#14151b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Redefinir Senha — {passwordTarget.username}
              </h3>
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                className="p-1 text-[#8c909e] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleResetPassword} className="p-4 space-y-3 text-xs">
              <input
                type="password"
                required
                minLength={6}
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                placeholder="Nova palavra-passe (mín. 6 caracteres)"
                className="w-full bg-[#121319] border border-[#2a2c38] rounded-xl px-3 py-2 text-white"
              />
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-[#e50539] hover:bg-[#f21649] text-white font-bold"
              >
                Confirmar Nova Senha
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-[#181921] border border-[#5c2836] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#262835] bg-[#14151b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#ff849d]">Confirmar Remoção</h3>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="p-1 text-[#8c909e] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4 text-xs">
              <p className="text-[#d2d5e0]">
                Tem a certeza de que pretende eliminar permanentemente a conta{' '}
                <strong className="text-white">{deleteTarget.username}</strong> ({deleteTarget.email})?
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-3 py-1.5 rounded-lg bg-[#1e202b] border border-[#313547] text-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteUser}
                  className="px-3 py-1.5 rounded-lg bg-[#e50539] hover:bg-[#f21649] text-white font-bold"
                >
                  Eliminar Conta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Bets Modal */}
      {betsModalUser && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setBetsModalUser(null)}
        >
          <div
            className="w-full max-w-lg bg-[#181921] border border-[#2d303e] rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-[#262835] bg-[#14151b] flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                Últimas Apostas — {betsModalUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setBetsModalUser(null)}
                className="p-1 text-[#8c909e] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2 text-xs">
              {betsModalUser.recentBets.length === 0 ? (
                <div className="text-center py-6 text-[#7e8291]">
                  Sem apostas registadas para este utilizador.
                </div>
              ) : (
                betsModalUser.recentBets.map((b) => (
                  <div
                    key={b.id}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                      b.status === 'WON'
                        ? 'bg-[#172e19] border-[#274b29]'
                        : 'bg-[#25171c] border-[#3d2129]'
                    }`}
                  >
                    <div>
                      <div className="font-semibold text-white">
                        Ronda #{b.roundId} • Painel {b.slotId}
                      </div>
                      <div className="text-[11px] text-[#9ea2b0] font-mono">
                        Aposta: {formatMoney(b.betAmount)} MZN • Crash: {b.crashPoint.toFixed(2)}x
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold">
                      {b.status === 'WON' ? (
                        <span className="text-[#6ef056]">
                          +{formatMoney(b.payout)} ({b.cashoutMultiplier?.toFixed(2)}x)
                        </span>
                      ) : (
                        <span className="text-[#ff6a85]">-{formatMoney(b.betAmount)}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
