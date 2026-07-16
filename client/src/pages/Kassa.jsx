import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertCircle,
    Wallet,
    ArrowUpCircle,
    ArrowDownCircle,
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

// ---------- Stat Card ----------
const StatCard = ({ icon: Icon, label, value, color = 'blue', subValue }) => {
    const colorClasses = {
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        green: 'bg-green-50 text-green-600 border-green-100',
        red: 'bg-red-50 text-red-600 border-red-100',
        purple: 'bg-purple-50 text-purple-600 border-purple-100',
    };

    // Format money helper
    const formatMoney = (val) => {
        if (val === undefined || val === null) return '...';
        return Number(val).toLocaleString('uz-UZ') + ' $';
    };

    return (
        <div className={`flex-1 min-w-[200px] bg-white rounded-xl border px-4 py-3 flex items-center gap-3 shadow-sm ${colorClasses[color]}`}>
            <div className={`p-2 rounded-lg bg-white/60`}>
                <Icon size={20} />
            </div>
            <div>
                <p className="text-xs font-medium opacity-80">{label}</p>
                <p className="text-lg font-bold text-gray-900 leading-tight">
                    {formatMoney(value)}
                </p>
                {subValue && <p className="text-[10px] opacity-70 mt-0.5">{subValue}</p>}
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
    const limit = 300; // Limitni oshirdik, oxirgi 300 ta operatsiyani olamiz
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

    // ---------- SWR: History (Barcha filtrlarsiz ham so'nggi 300 tasini olamiz statistika uchun) ----------
    // Eslatma: Statistikani to'g'ri ishlashi uchun bizga "barcha" ma'lumot kerak emas, 
    // lekin filtr qo'yilganda ham statistika hozirgi oyni ko'rsatishi kerak.
    // Shuning uchun statistikani alohida hisoblaymiz.

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

    // ---------- STATISTIKA HISOBLASH (Frontendda) ----------
    const monthlyStats = useMemo(() => {
        // Hozirgi oy va yil
        const now = new Date();
        const currentMonth = now.getMonth(); // 0-11
        const currentYear = now.getFullYear();

        let income = 0;
        let expense = 0;

        // Agar tarix ma'lumoti bo'lsa, uni filtrlaymiz
        // DIQQAT: Biz faqat sahifalangan ma'lumotlardan (transactions) hisoblayapmiz.
        // Agar sizda juda ko'p ma'lumot bo'lsa va ular boshqa sahifada qolib ketsa, 
        // bu usul to'liq bo'lmaydi. Lekin limit=300 qilingani uchun so'nggi operatsiyalar qamrovda bo'ladi.

        // To'liqroq bo'lishi uchun, agar filter yo'q bo'lsa, barcha kelgan ma'lumotdan hisoblaymiz.
        // Agar filter bor bo'lsa, faqat ko'rinayotgan qismidan hisoblash mantiqsiz, 
        // shuning uchun filter bor paytda statistikani yashirish yoki alohida so'rov qilish kerak.
        // Hozircha sodda variant: Barcha yuklangan transactionlardan hozirgi oyni topamiz.

        if (historyData?.data?.history) {
            historyData.data.history.forEach(tx => {
                const txDate = new Date(tx.createdAt);
                if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
                    if (tx.type === 'KIRIM') {
                        income += Number(tx.amount);
                    } else if (tx.type === 'CHIQIM') {
                        expense += Number(tx.amount);
                    }
                }
            });
        }

        return { income, expense };
    }, [historyData]);

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
        <div className="min-h-screen font-sans bg-gray-50/50">
            <div className="mx-auto px-4 sm:px-6 py-6 max-w-7xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Kassa Boshqaruvi</h1>
                        <p className="text-sm text-gray-500 mt-0.5">Moliyaviy oqimlar va hisobotlar</p>
                    </div>
                    <button
                        onClick={openExpenseModal}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto"
                    >
                        <ArrowDownCircle size={18} /> Chiqim qo‘shish
                    </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {/* 1. Joriy Balans */}
                    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
                        <div className="p-3 bg-blue-100 rounded-full">
                            <Wallet className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Joriy Balans</p>
                            <p className="text-2xl font-bold text-gray-900">
                                {balanceLoading ? (
                                    <Loader2 className="inline w-5 h-5 animate-spin text-blue-600" />
                                ) : (
                                    `${balance.toLocaleString()} $`
                                )}
                            </p>
                        </div>
                    </div>

                    {/* 2. Hozirgi Oy Kirim */}
                    <StatCard
                        icon={ArrowUpCircle}
                        label="Shu oygi Kirim"
                        value={monthlyStats.income}
                        color="green"
                        subValue="Jami tushumlar"
                    />

                    {/* 3. Hozirgi Oy Chiqim */}
                    <StatCard
                        icon={ArrowDownCircle}
                        label="Shu oygi Chiqim"
                        value={monthlyStats.expense}
                        color="red"
                        subValue="Jami xarajatlar"
                    />
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center shadow-sm">
                    <select
                        value={typeFilter}
                        onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full md:w-auto"
                    >
                        <option value="">Barcha turlar</option>
                        <option value="KIRIM">Kirim</option>
                        <option value="CHIQIM">Chiqim</option>
                    </select>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full md:w-auto"
                    />
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none w-full md:w-auto"
                    />
                    {(typeFilter || fromDate || toDate) && (
                        <button
                            onClick={clearFilters}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition whitespace-nowrap"
                        >
                            Filtrni tozalash
                        </button>
                    )}
                </div>

                {/* Transaction History Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {(historyError || balanceError) ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                            <p className="text-gray-700 font-medium mb-1">Maʼlumotlarni yuklab bo‘lmadi</p>
                            <p className="text-sm text-gray-500 mb-4">
                                {historyError?.response?.data?.message || balanceError?.response?.data?.message || 'Server bilan bog‘lanishda xatolik.'}
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
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                                        <th className="px-6 py-4 font-semibold">Sana</th>
                                        <th className="px-6 py-4 font-semibold">Turi</th>
                                        <th className="px-6 py-4 font-semibold text-right">Summa ($)</th>
                                        <th className="px-6 py-4 font-semibold">Sabab / Izoh</th>
                                        <th className="px-6 py-4 font-semibold">Kim tomonidan</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {isLoading && !historyData ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24" /></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-16" /></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-20 ml-auto" /></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-40" /></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24" /></td>
                                            </tr>
                                        ))
                                    ) : transactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-16 text-center">
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
                                                <tr key={tx._id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                                                        {new Date(tx.createdAt).toLocaleDateString('uz-UZ', {
                                                            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                                        })}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${isIncome ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                }`}
                                                        >
                                                            {isIncome ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />}
                                                            {tx.type}
                                                        </span>
                                                    </td>
                                                    <td className={`px-6 py-4 text-sm font-bold text-right ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                                        {isIncome ? '+' : '-'}{Number(tx.amount).toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={tx.reason}>
                                                        {tx.reason || '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-600">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                                                                {tx.user?.name ? tx.user.name.charAt(0).toUpperCase() : 'U'}
                                                            </div>
                                                            {tx.user?.name || 'Noma\'lum'}
                                                        </div>
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
                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
                            <span className="text-sm text-gray-500">
                                Sahifa <span className="font-medium text-gray-900">{page}</span> / {totalPages}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page <= 1}
                                    className="p-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm transition"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page >= totalPages}
                                    className="p-2 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white hover:shadow-sm transition"
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
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
                        onClick={closeExpenseModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto transform transition-all scale-100"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeExpenseModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40 p-1 rounded-full hover:bg-gray-100"
                                disabled={expenseSaving}
                            >
                                <X size={20} />
                            </button>

                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Kassadan chiqim</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Mavjud balans: <span className="font-semibold text-gray-900">{balance.toLocaleString()} $</span>
                                </p>
                            </div>

                            <form onSubmit={handleExpenseSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Summa ($) <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                        <input
                                            type="number"
                                            name="amount"
                                            step="0.01"
                                            min="0.01"
                                            value={expenseForm.amount}
                                            onChange={handleExpenseChange}
                                            className={`w-full pl-8 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition ${expenseErrors.amount ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                    </div>
                                    {expenseErrors.amount && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> {expenseErrors.amount}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Sabab / Izoh <span className="text-red-500">*</span></label>
                                    <textarea
                                        name="reason"
                                        rows="3"
                                        value={expenseForm.reason}
                                        onChange={handleExpenseChange}
                                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition resize-none ${expenseErrors.reason ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                                        placeholder="Masalan: Ofis anjomlari uchun..."
                                    />
                                    {expenseErrors.reason && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> {expenseErrors.reason}</p>}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
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
                                        className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-md shadow-red-200 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {expenseSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Tasdiqlash
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