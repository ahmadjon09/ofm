import React, { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
    Plus,
    Search,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertCircle,
    DollarSign,
    Wallet,
    Calendar,
    ArrowUpCircle,
    ArrowDownCircle,
    User,
    FileText,
} from 'lucide-react';

const KASSA_URL = '/kassa';
const HISTORY_URL = '/kassa/history';
const EXPENSE_URL = '/kassa/expense';

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

// ---------- Confirm Dialog (for future use) ----------
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
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
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
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16 ml-auto" /></td>
            </tr>
        ))}
    </>
);

// ---------- Stat Card ----------
const StatCard = ({ icon: Icon, label, value, color = 'blue' }) => {
    const colorClasses = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        red: 'bg-red-50 text-red-600',
        purple: 'bg-purple-50 text-purple-600',
        orange: 'bg-orange-50 text-orange-600',
        yellow: 'bg-yellow-50 text-yellow-600',
    };
    return (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm">
            <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
                <Icon size={18} />
            </div>
            <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-semibold text-gray-900">{value}</p>
            </div>
        </div>
    );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export const Kassa = () => {
    // ---------- State ----------
    const [page, setPage] = useState(1);
    const limit = 50;
    const [typeFilter, setTypeFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // ---------- Expense modal ----------
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm, setExpenseForm] = useState({ amount: '', reason: '' });
    const [expenseErrors, setExpenseErrors] = useState({});
    const [expenseSaving, setExpenseSaving] = useState(false);

    // ---------- Toast ----------
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }, []);

    useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

    // ---------- SWR: Balance ----------
    const {
        data: balanceData,
        error: balanceError,
        isLoading: balanceLoading,
        mutate: mutateBalance,
    } = useSWR(
        KASSA_URL,
        (url) => api.get(url).then((res) => res.data),
        { revalidateOnFocus: true }
    );

    const balance = balanceData?.data?.balance ?? 0;

    // ---------- SWR: History ----------
    const buildQuery = useCallback(() => {
        const params = new URLSearchParams({ page, limit });
        if (typeFilter) params.append('type', typeFilter);
        if (fromDate) params.append('from', new Date(fromDate).toISOString());
        if (toDate) params.append('to', new Date(toDate).toISOString());
        return params.toString();
    }, [page, limit, typeFilter, fromDate, toDate]);

    const {
        data: historyData,
        error: historyError,
        isLoading: historyLoading,
        isValidating,
        mutate: mutateHistory,
    } = useSWR(
        `${HISTORY_URL}?${buildQuery()}`,
        (url) => api.get(url).then((res) => res.data),
        { keepPreviousData: true, revalidateOnFocus: false }
    );

    const transactions = historyData?.data?.history || [];
    const meta = historyData?.meta || { total: 0, page: 1, totalPages: 1 };
    const totalPages = Math.max(meta.totalPages || 1, 1);

    // ---------- Handlers ----------
    const clearFilters = () => {
        setTypeFilter('');
        setFromDate('');
        setToDate('');
        setPage(1);
    };

    const goToPage = (p) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
    };

    // ---------- Expense modal ----------
    const openExpenseModal = () => {
        setExpenseForm({ amount: '', reason: '' });
        setExpenseErrors({});
        setExpenseModalOpen(true);
    };

    const closeExpenseModal = () => {
        if (expenseSaving) return;
        setExpenseModalOpen(false);
    };

    const handleExpenseChange = (e) => {
        const { name, value } = e.target;
        setExpenseForm({ ...expenseForm, [name]: value });
        setExpenseErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const validateExpense = () => {
        const errors = {};
        if (!expenseForm.amount || Number(expenseForm.amount) <= 0) {
            errors.amount = 'Summa 0 dan katta bo‘lishi kerak.';
        }
        if (!expenseForm.reason || !expenseForm.reason.trim()) {
            errors.reason = 'Sabab kiritilishi shart.';
        }
        setExpenseErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleExpenseSubmit = async (e) => {
        e.preventDefault();
        if (!validateExpense()) {
            showToast('Iltimos, xatoliklarni tuzating.', 'error');
            return;
        }

        setExpenseSaving(true);
        try {
            await api.post(EXPENSE_URL, {
                amount: Number(expenseForm.amount),
                reason: expenseForm.reason.trim(),
            });
            showToast('Chiqim muvaffaqiyatli yozildi.', 'success');
            await mutateBalance();
            await mutateHistory();
            setExpenseModalOpen(false);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setExpenseSaving(false);
        }
    };

    // ---------- Loading states ----------
    const isLoading = balanceLoading || historyLoading;

    return (
        <div className="min-h-screen font-sans">
            <div className="mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Kassa</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Kassa balansi va operatsiyalar</p>
                    </div>
                    <button
                        onClick={openExpenseModal}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto"
                    >
                        <ArrowDownCircle size={18} /> Chiqim qo‘shish
                    </button>
                </div>

                {/* Balance Card */}
                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 rounded-2xl">
                                <Wallet className="w-8 h-8 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Joriy balans</p>
                                <p className="text-3xl font-bold text-gray-900">
                                    {balanceLoading ? (
                                        <Loader2 className="inline w-6 h-6 animate-spin text-blue-600" />
                                    ) : (
                                        `${balance.toLocaleString()} $`
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <StatCard
                                icon={ArrowUpCircle}
                                label="Kirimlar"
                                value="—"
                                color="green"
                            />
                            <StatCard
                                icon={ArrowDownCircle}
                                label="Chiqimlar"
                                value="—"
                                color="red"
                            />
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
                    <select
                        value={typeFilter}
                        onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    >
                        <option value="">Barcha turlar</option>
                        <option value="KIRIM">Kirim</option>
                        <option value="CHIQIM">Chiqim</option>
                    </select>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Dan"
                    />
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="Gacha"
                    />
                    {(typeFilter || fromDate || toDate) && (
                        <button
                            onClick={clearFilters}
                            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
                        >
                            Tozalash
                        </button>
                    )}
                </div>

                {/* Transaction History */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {(historyError || balanceError) ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                            <p className="text-gray-700 font-medium mb-1">Maʼlumotlarni yuklab bo‘lmadi</p>
                            <p className="text-sm text-gray-500 mb-4">
                                {historyError?.response?.data?.message || balanceError?.response?.data?.message || 'Server bilan bog‘lanishda xatolik yuz berdi.'}
                            </p>
                            <button
                                onClick={() => { mutateBalance(); mutateHistory(); }}
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
                                        <th className="px-4 py-3 font-medium">Sana</th>
                                        <th className="px-4 py-3 font-medium">Turi</th>
                                        <th className="px-4 py-3 font-medium">Summa ($)</th>
                                        <th className="px-4 py-3 font-medium">Sabab / Izoh</th>
                                        <th className="px-4 py-3 font-medium">Kim tomonidan</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading && !historyData ? (
                                        <SkeletonRows rows={limit} />
                                    ) : transactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-4 py-16 text-center">
                                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-600 font-medium mb-1">Operatsiyalar topilmadi</p>
                                                <p className="text-sm text-gray-400">
                                                    {typeFilter || fromDate || toDate ? 'Filtrlash shartlariga mos operatsiya yo‘q.' : 'Hali hech qanday operatsiya qayd etilmagan.'}
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        transactions.map((tx) => {
                                            const isIncome = tx.type === 'KIRIM';
                                            return (
                                                <tr key={tx._id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition">
                                                    <td className="px-4 py-4 text-gray-600">
                                                        {new Date(tx.createdAt).toLocaleDateString('uz-UZ')}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <span
                                                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                }`}
                                                        >
                                                            {isIncome ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                                                            {tx.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-4 font-medium text-gray-900">
                                                        {tx.amount?.toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-4 text-gray-600 max-w-xs truncate">
                                                        {tx.reason || '-'}
                                                    </td>
                                                    <td className="px-4 py-4 text-gray-600">
                                                        {tx.user?.name || '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {!historyError && transactions.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm">
                            <span className="text-gray-500">
                                {page}-sahifa / {totalPages} {isValidating && <Loader2 className="inline w-4 h-4 animate-spin ml-1" />}
                            </span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page <= 1}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page >= totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* ====== Expense Modal ====== */}
                {expenseModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
                        onClick={closeExpenseModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeExpenseModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
                                disabled={expenseSaving}
                            >
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl font-bold text-gray-900 mb-1">Kassadan chiqim</h2>
                            <p className="text-sm text-gray-500 mb-6">
                                Joriy balans: <span className="font-medium text-gray-900">{balance.toLocaleString()} $</span>
                            </p>

                            <form onSubmit={handleExpenseSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Summa ($) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        step="0.01"
                                        min="0.01"
                                        value={expenseForm.amount}
                                        onChange={handleExpenseChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${expenseErrors.amount ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                            }`}
                                        placeholder="0.00"
                                    />
                                    {expenseErrors.amount && <p className="text-xs text-red-500 mt-1">{expenseErrors.amount}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Sabab *</label>
                                    <textarea
                                        name="reason"
                                        rows="3"
                                        value={expenseForm.reason}
                                        onChange={handleExpenseChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${expenseErrors.reason ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                            }`}
                                        placeholder="Nimaga pul olinyapti?"
                                    />
                                    {expenseErrors.reason && <p className="text-xs text-red-500 mt-1">{expenseErrors.reason}</p>}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={closeExpenseModal}
                                        disabled={expenseSaving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={expenseSaving}
                                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {expenseSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Chiqim qo‘shish
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ====== Toast ====== */}
                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </div>
    );
};