import React, { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
    Users as UsersIcon,
    Plus,
    Search,
    Pencil,
    Trash2,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertCircle,
    UserCheck,
    UserX,
} from 'lucide-react';

const USERS_URL = '/users';
const REGISTER_URL = '/auth/register';
const ROLES = ['admin', 'manager', 'worker'];

// ---------- Toast ----------
const Toast = ({ toast, onClose }) => {
    if (!toast) return null;
    const styles = {
        error: 'bg-red-600',
        success: 'bg-emerald-600',
        info: 'bg-gray-800',
    };
    return (
        <div className="fixed bottom-6 right-6 z-[100] animate-in slide-in-from-bottom-4 duration-200">
            <div className={`${styles[toast.type] || styles.info} text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 max-w-sm`}>
                <span className="text-sm">{toast.message}</span>
                <button onClick={onClose} className="text-white/70 hover:text-white">
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};

// ---------- Confirm Dialog ----------
const ConfirmDialog = ({ open, title, message, confirmLabel = 'Tasdiqlash', danger = true, onConfirm, onCancel }) => {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
                <p className="text-sm text-gray-500 mb-6">{message}</p>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:"
                    >
                        Bekor qilish
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------- Skeleton ----------
const SkeletonRows = ({ rows = 5 }) => (
    <>
        {Array.from({ length: rows }).map((_, i) => (
            <tr key={i} className="border-b border-gray-100 animate-pulse">
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16 ml-auto" /></td>
            </tr>
        ))}
    </>
);

// ---------- Main Component ----------
export const Users = () => {
    // ---------- State ----------
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [page, setPage] = useState(1);
    const limit = 10;

    const [modalOpen, setModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});

    const [form, setForm] = useState({
        name: '',
        phone: '',
        role: 'worker',
        isActive: true,
        password: '', // only used when creating
    });

    const [confirmState, setConfirmState] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }, []);

    useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

    // ---------- SWR ----------
    const buildQuery = useCallback(() => {
        const params = new URLSearchParams({ page, limit });
        if (search) params.append('search', search);
        if (roleFilter) params.append('role', roleFilter);
        return params.toString();
    }, [page, limit, search, roleFilter]);

    const { data, error, isLoading, isValidating, mutate } = useSWR(
        `${USERS_URL}?${buildQuery()}`,
        (url) => api.get(url).then((res) => res.data),
        { keepPreviousData: true, revalidateOnFocus: false }
    );

    const users = data?.data?.users || [];
    const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };
    const totalPages = Math.max(meta.totalPages || 1, 1);

    // ---------- Handlers ----------
    const handleSearch = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };
    const handleRoleFilter = (e) => {
        setRoleFilter(e.target.value);
        setPage(1);
    };
    const clearFilters = () => {
        setSearch('');
        setRoleFilter('');
        setPage(1);
    };
    const goToPage = (p) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
    };

    // ---------- Modal ----------
    const openCreateModal = () => {
        setEditingUser(null);
        setForm({ name: '', phone: '', role: 'worker', isActive: true, password: '' });
        setFormErrors({});
        setModalOpen(true);
    };

    const openEditModal = (user) => {
        setEditingUser(user);
        setForm({
            name: user.name,
            phone: user.phone,
            role: user.role,
            isActive: user.isActive,
            password: '', // not editable
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
    };

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm({
            ...form,
            [name]: type === 'checkbox' ? checked : value,
        });
        setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    // ---------- Validation ----------
    const validateForm = () => {
        const errors = {};
        if (!form.name.trim()) errors.name = 'Ism majburiy.';
        if (!form.phone.trim()) errors.phone = 'Telefon raqam majburiy.';
        if (!editingUser && !form.password.trim()) errors.password = 'Parol majburiy.';
        if (!editingUser && form.password.length < 6) errors.password = 'Parol kamida 6 belgi.';
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // ---------- CRUD ----------
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) {
            showToast('Iltimos, formadagi xatoliklarni tuzating.', 'error');
            return;
        }

        setSaving(true);
        try {
            if (editingUser) {
                // Update
                const payload = {
                    name: form.name,
                    phone: form.phone,
                    role: form.role,
                    isActive: form.isActive,
                };
                await api.put(`${USERS_URL}/${editingUser._id}`, payload);
                showToast('Foydalanuvchi yangilandi.', 'success');
            } else {
                // Create via /auth/register
                const payload = {
                    name: form.name,
                    phone: form.phone,
                    password: form.password,
                    role: form.role,
                };
                await api.post(REGISTER_URL, payload);
                showToast('Foydalanuvchi yaratildi.', 'success');
            }
            await mutate();
            closeModal();
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const requestDeleteUser = (user) => {
        setConfirmState({ type: 'delete-user', payload: user });
    };

    const handleConfirm = async () => {
        if (!confirmState) return;
        const { payload } = confirmState;
        try {
            await api.delete(`${USERS_URL}/${payload._id}`);
            showToast('Foydalanuvchi o‘chirildi.', 'success');
            await mutate();
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Amalni bajarib bo‘lmadi.', 'error');
        } finally {
            setConfirmState(null);
        }
    };

    // ---------- Render ----------
    return (
        <div className="min-h-screen  font-sans">
            <div className="mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <UsersIcon className="text-blue-600" size={28} />
                            Foydalanuvchilar
                        </h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {meta.total ? `Jami ${meta.total} ta foydalanuvchi` : 'Foydalanuvchilarni boshqarish'}
                        </p>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto"
                    >
                        <Plus size={18} /> Yangi foydalanuvchi
                    </button>
                </div>

                {/* Toolbar */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            value={search}
                            onChange={handleSearch}
                            placeholder="Ism yoki telefon bo‘yicha qidirish..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                    <select
                        value={roleFilter}
                        onChange={handleRoleFilter}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                        <option value="">Barcha rollar</option>
                        {ROLES.map((r) => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                        ))}
                    </select>
                    {(search || roleFilter) && (
                        <button
                            onClick={clearFilters}
                            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
                        >
                            Filtrlarni tozalash
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {error ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                            <p className="text-gray-700 font-medium mb-1">Foydalanuvchilarni yuklab bo‘lmadi</p>
                            <p className="text-sm text-gray-500 mb-4">
                                {error.response?.data?.message || 'Server bilan bog‘lanishda xatolik yuz berdi.'}
                            </p>
                            <button
                                onClick={() => mutate()}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                            >
                                Qayta urinish
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                                        <th className="px-4 py-3 font-medium">Ism</th>
                                        <th className="px-4 py-3 font-medium">Telefon</th>
                                        <th className="px-4 py-3 font-medium">Rol</th>
                                        <th className="px-4 py-3 font-medium text-center">Holat</th>
                                        <th className="px-4 py-3 font-medium text-right">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading && !data ? (
                                        <SkeletonRows rows={limit} />
                                    ) : users.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-16 text-center">
                                                <UsersIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-600 font-medium mb-1">Foydalanuvchi topilmadi</p>
                                                <p className="text-sm text-gray-400">
                                                    {search || roleFilter ? 'Qidiruv shartlariga mos foydalanuvchi yo‘q.' : 'Hali birorta foydalanuvchi qo‘shilmagan.'}
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        users.map((user) => (
                                            <tr key={user._id} className="border-b border-gray-100 last:border-b-0 hover: transition">
                                                <td className="px-4 py-4 font-medium text-gray-900">{user.name}</td>
                                                <td className="px-4 py-4 text-gray-600">{user.phone}</td>
                                                <td className="px-4 py-4">
                                                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${user.role === 'admin'
                                                        ? 'bg-red-100 text-red-700'
                                                        : user.role === 'manager'
                                                            ? 'bg-yellow-100 text-yellow-700'
                                                            : 'bg-blue-100 text-blue-700'
                                                        }`}>
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    {user.isActive ? (
                                                        <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                                                            <UserCheck size={16} /> Faol
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-gray-500 text-sm">
                                                            <UserX size={16} /> Bloklangan
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => openEditModal(user)}
                                                            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                            title="Tahrirlash"
                                                        >
                                                            <Pencil size={18} />
                                                        </button>
                                                        <button
                                                            onClick={() => requestDeleteUser(user)}
                                                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                            title="O‘chirish"
                                                        >
                                                            <Trash2 size={18} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {!error && users.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm">
                            <span className="text-gray-500">
                                {page}-sahifa / {totalPages} {isValidating && <Loader2 className="inline w-4 h-4 animate-spin ml-1" />}
                            </span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page <= 1}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page >= totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ====== Modal ====== */}
                {modalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
                        onClick={closeModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
                                disabled={saving}
                            >
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl font-bold text-gray-900 mb-1">
                                {editingUser ? 'Foydalanuvchini tahrirlash' : 'Yangi foydalanuvchi qo‘shish'}
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                {editingUser ? 'Maʼlumotlarni o‘zgartiring va saqlang.' : 'Barcha maydonlarni to‘ldiring.'}
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ism *</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={form.name}
                                        onChange={handleFormChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${formErrors.name ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                            }`}
                                    />
                                    {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefon *</label>
                                    <input
                                        type="text"
                                        name="phone"
                                        value={form.phone}
                                        onChange={handleFormChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${formErrors.phone ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                            }`}
                                    />
                                    {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
                                </div>

                                {!editingUser && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Parol *</label>
                                        <input
                                            type="password"
                                            name="password"
                                            value={form.password}
                                            onChange={handleFormChange}
                                            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${formErrors.password ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                                }`}
                                            placeholder="Kamida 6 belgi"
                                        />
                                        {formErrors.password && <p className="text-xs text-red-500 mt-1">{formErrors.password}</p>}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                                    <select
                                        name="role"
                                        value={form.role}
                                        onChange={handleFormChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        name="isActive"
                                        checked={form.isActive}
                                        onChange={handleFormChange}
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <label className="text-sm text-gray-700">Faol</label>
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={saving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover: transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {editingUser ? 'Yangilash' : 'Yaratish'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ====== Confirm Dialog ====== */}
                <ConfirmDialog
                    open={!!confirmState}
                    title="Foydalanuvchini o‘chirish"
                    message={confirmState ? `“${confirmState.payload.name}” foydalanuvchini o‘chirishni tasdiqlaysizmi?` : ''}
                    confirmLabel="O‘chirish"
                    danger={true}
                    onConfirm={handleConfirm}
                    onCancel={() => setConfirmState(null)}
                />

                {/* ====== Toast ====== */}
                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </div>
    );
};