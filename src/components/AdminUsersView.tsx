import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyRound,
  Loader2,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  createAdminUser,
  deleteAdminUser,
  fetchAdminUsers,
  updateAdminUser,
} from '../services/alumniApi';
import type { AppUser, UserRole } from '../types/alumni';

interface AdminUsersViewProps {
  currentUser: AppUser;
  onAlumniListChanged?: () => void;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  currentUser,
  onAlumniListChanged,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [isCreating, setIsCreating] = useState(false);

  // Reset password modal state
  const [resetTarget, setResetTarget] = useState<AppUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchAdminUsers();
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pengguna.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const counts = useMemo(() => {
    const adminCount = users.filter((u) => u.role === 'admin').length;
    const activeCount = users.filter((u) => u.isActive).length;
    const inactiveCount = users.length - activeCount;
    return {
      total: users.length,
      admin: adminCount,
      active: activeCount,
      inactive: inactiveCount,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        (u.username ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q) ||
        (u.alumniName ?? '').toLowerCase().includes(q)
      );
    });
  }, [users, searchQuery, roleFilter]);

  const handleToggleRole = async (target: AppUser, nextRole: UserRole) => {
    setActionError(null);
    try {
      const updated = await updateAdminUser(target.id, { role: nextRole });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === updated.id
            ? { ...updated, alumniId: u.alumniId, alumniName: u.alumniName }
            : u
        )
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengubah role pengguna.');
    }
  };

  const handleToggleActive = async (target: AppUser) => {
    setActionError(null);
    try {
      const updated = await updateAdminUser(target.id, { isActive: !target.isActive });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === updated.id
            ? { ...updated, alumniId: u.alumniId, alumniName: u.alumniName }
            : u
        )
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengubah status akun.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setIsCreating(true);
    try {
      const created = await createAdminUser({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        role: newRole,
        isActive: true,
      });
      setUsers((prev) => [created, ...prev]);
      setShowCreateModal(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal membuat akun baru.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setActionError(null);
    setIsResetting(true);
    try {
      await updateAdminUser(resetTarget.id, { password: resetPassword });
      setResetTarget(null);
      setResetPassword('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal mengatur ulang kata sandi.');
    } finally {
      setIsResetting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setActionError(null);
    try {
      await deleteAdminUser(target.id);
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      onAlumniListChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Gagal menghapus akun.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Kelola Pengguna &amp; Role Admin
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Atur akun pengguna (`app_users`), hak akses Admin vs User, serta status keaktifan akun.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setActionError(null);
            setShowCreateModal(true);
          }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400 whitespace-nowrap"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Tambah Akun</span>
        </button>
      </div>

      {/* KPI Row */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Akun</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {counts.total}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Akun Admin</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-sky-700 dark:text-sky-400">
            {counts.admin}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Akun Aktif</div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {counts.active}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Dinonaktifkan
          </div>
          <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-slate-500 dark:text-slate-400">
            {counts.inactive}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari username, email, atau nama alumni terhubung..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
            />
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(['all', 'admin', 'user'] as const).map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  roleFilter === role
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {role === 'all' ? 'Semua' : role === 'admin' ? 'Admin' : 'User'}
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-800/70 dark:bg-rose-950/60 dark:text-rose-300">
            {actionError}
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-sm text-slate-600 dark:text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
            <span>Memuat data pengguna...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-rose-700 dark:text-rose-400">{error}</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-600 dark:text-slate-400">
            Tidak ada akun pengguna yang cocok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                  <th className="px-4 py-3">Akun (Username &amp; Email)</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pin Alumni Terhubung</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser.id;
                  return (
                    <tr
                      key={u.id}
                      className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 align-middle">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {u.username || u.email || '-'}
                          {isSelf && (
                            <span className="ml-2 text-xs font-normal text-sky-700 dark:text-sky-400">
                              (Anda)
                            </span>
                          )}
                        </div>
                        {u.email && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {u.email}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <select
                          value={u.role}
                          disabled={isSelf}
                          onChange={(e) => void handleToggleRole(u, e.target.value as UserRole)}
                          aria-label={`Ubah role untuk ${u.username || u.email || u.id}`}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:disabled:bg-slate-800/40 dark:disabled:text-slate-500"
                        >
                          <option value="user">User (Alumni)</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          disabled={isSelf}
                          onClick={() => void handleToggleActive(u)}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-60 ${
                            u.isActive
                              ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                          }`}
                        >
                          {u.isActive ? (
                            <>
                              <UserCheck className="h-3.5 w-3.5" />
                              <span>Aktif</span>
                            </>
                          ) : (
                            <>
                              <UserX className="h-3.5 w-3.5" />
                              <span>Nonaktif</span>
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-middle text-xs text-slate-700 dark:text-slate-300">
                        {u.alumniName ? (
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {u.alumniName}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">
                            Belum ada pin lokasi
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-middle text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setResetTarget(u);
                              setResetPassword('');
                            }}
                            title="Reset kata sandi"
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            <span>Reset Sandi</span>
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(u)}
                              title="Hapus akun"
                              className="rounded-md border border-slate-200 p-1.5 text-rose-600 hover:bg-rose-50 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/60"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Tambah Akun Baru
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Kata Sandi (min. 6 karakter)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Role
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as UserRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-sky-400"
                >
                  <option value="user">User (Alumni)</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  {isCreating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Simpan Akun</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Reset Kata Sandi
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              Akun:{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {resetTarget.username || resetTarget.email}
              </span>
            </p>
            <form onSubmit={handleResetPasswordSubmit} className="mt-3 space-y-3">
              <input
                type="password"
                required
                minLength={6}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Kata sandi baru (min. 6 karakter)"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-sky-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isResetting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-500 dark:text-slate-950 dark:hover:bg-sky-400"
                >
                  {isResetting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Simpan Sandi</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/50">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
              Hapus Akun?
            </h3>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
              Akun{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {deleteTarget.username || deleteTarget.email}
              </span>{' '}
              akan dihapus dari tabel pengguna.
            </p>
            {deleteTarget.role === 'user' && (
              <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Catatan: Data lokasi alumni yang terhubung dengan akun ini juga akan otomatis ikut terhapus dari peta dan direktori.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDelete()}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
