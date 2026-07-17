import React, { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
    Plus,
    Search,
    Trash2,
    Pencil,
    RotateCw,
    X,
    ChevronLeft,
    ChevronRight,
    Loader2,
    AlertCircle,
    Users,
    Phone,
    DollarSign,
    ShoppingBag,
    ArrowLeft,
    CreditCard,
    FileText,
    Printer,
} from 'lucide-react';

const CLIENTS_URL = '/clients';

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
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-white"
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
                <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16" /></td>
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
export const Clients = () => {
    // ---------- List state ----------
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const limit = 10;

    // ---------- Detail state (ID) ----------
    const [selectedClientId, setSelectedClientId] = useState(null);

    // ---------- Modal states ----------
    const [modalOpen, setModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const [saving, setSaving] = useState(false);
    const [formErrors, setFormErrors] = useState({});
    const [form, setForm] = useState({ name: '', phone: '', debt: '' });

    // ---------- Payment modal ----------
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [paymentForm, setPaymentForm] = useState({ amount: '', note: '' });
    const [paymentSaving, setPaymentSaving] = useState(false);
    const [paymentErrors, setPaymentErrors] = useState({});

    // ---------- Confirm & Toast ----------
    const [confirmState, setConfirmState] = useState(null);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const printRef = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }, []);

    useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

    // ---------- Build query ----------
    const buildQuery = useCallback(() => {
        const params = new URLSearchParams({ page, limit });
        if (search) params.append('search', search);
        return params.toString();
    }, [page, limit, search]);

    // ---------- SWR for list ----------
    const { data, error, isLoading, isValidating, mutate } = useSWR(
        `${CLIENTS_URL}?${buildQuery()}`,
        (url) => api.get(url).then((res) => res.data),
        { keepPreviousData: true, revalidateOnFocus: false }
    );

    const clients = data?.data?.clients || [];
    const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };
    const totalPages = Math.max(meta.totalPages || 1, 1);

    // ---------- SWR for detail ----------
    const {
        data: clientDetailData,
        error: detailError,
        isLoading: detailLoading,
        mutate: mutateDetail,
    } = useSWR(
        selectedClientId ? `${CLIENTS_URL}/${selectedClientId}` : null,
        (url) => api.get(url).then((res) => res.data),
        { revalidateOnFocus: true }
    );

    const client = clientDetailData?.data?.client;

    // ---------- List handlers ----------
    const handleSearch = (e) => {
        setSearchInput(e.target.value);
        setPage(1);
    };
    const clearFilters = () => {
        setSearchInput('');
        setSearch('');
        setPage(1);
    };
    const goToPage = (p) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
    };

    // Debounce search
    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    // Close modals on Escape
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape') {
                if (modalOpen && !saving) setModalOpen(false);
                if (paymentModalOpen && !paymentSaving) setPaymentModalOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [modalOpen, saving, paymentModalOpen, paymentSaving]);

    // ---------- Client modal helpers ----------
    const openCreateModal = () => {
        setEditingClient(null);
        setForm({ name: '', phone: '', debt: '' });
        setFormErrors({});
        setModalOpen(true);
    };

    const openEditModal = (client) => {
        setEditingClient(client);
        setForm({
            name: client.name,
            phone: client.phone,
            debt: client.debt ?? '',
        });
        setFormErrors({});
        setModalOpen(true);
    };

    const closeModal = () => {
        if (saving) return;
        setModalOpen(false);
    };

    const handleFormChange = (e) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });
        setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const validateForm = () => {
        const errors = {};
        if (!form.name.trim()) errors.name = 'Ism majburiy.';
        if (!form.phone.trim()) errors.phone = 'Telefon raqam majburiy.';
        // if (form.debt && Number(form.debt) < 0) {
        //     errors.debt = 'Qarz manfiy bo‘lishi mumkin emas.';
        // }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // ---------- Payment modal helpers ----------
    const openPaymentModal = (client) => {
        setSelectedClientId(client._id);
        setPaymentForm({ amount: '', note: '' });
        setPaymentErrors({});
        setPaymentModalOpen(true);
    };

    const closePaymentModal = () => {
        if (paymentSaving) return;
        setPaymentModalOpen(false);
    };

    const handlePaymentChange = (e) => {
        setPaymentForm({ ...paymentForm, [e.target.name]: e.target.value });
        setPaymentErrors((prev) => ({ ...prev, [e.target.name]: undefined }));
    };

    const validatePayment = () => {
        const errors = {};
        if (!paymentForm.amount || Number(paymentForm.amount) <= 0) {
            errors.amount = 'To‘lov summasi 0 dan katta bo‘lishi kerak.';
        }
        setPaymentErrors(errors);
        return Object.keys(errors).length === 0;
    };

    // ---------- CRUD ----------
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) {
            showToast('Iltimos, formadagi xatoliklarni tuzating.', 'error');
            return;
        }

        const payload = {
            name: form.name.trim(),
            phone: form.phone.trim(),
        };

        // Add debt if it's provided (for manual adjustment)
        if (form.debt !== '' && form.debt !== null && form.debt !== undefined) {
            payload.debt = Number(form.debt);
        }

        setSaving(true);
        try {
            if (editingClient) {
                await api.put(`${CLIENTS_URL}/${editingClient._id}`, payload);
                showToast('Mijoz yangilandi.', 'success');
                if (selectedClientId === editingClient._id) {
                    await mutateDetail();
                }
            } else {
                await api.post(CLIENTS_URL, payload);
                showToast('Mijoz yaratildi.', 'success');
            }
            await mutate();
            setModalOpen(false);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        if (!validatePayment()) {
            showToast('Iltimos, to‘lov summasini to‘g‘ri kiriting.', 'error');
            return;
        }

        setPaymentSaving(true);
        try {
            await api.post(`${CLIENTS_URL}/${selectedClientId}/payments`, {
                amount: Number(paymentForm.amount),
                note: paymentForm.note || '',
            });
            showToast('To‘lov qabul qilindi.', 'success');
            await mutateDetail();
            await mutate();
            setPaymentModalOpen(false);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'To‘lov amalga oshmadi.', 'error');
        } finally {
            setPaymentSaving(false);
        }
    };

    const requestDeleteClient = (client) =>
        setConfirmState({ type: 'delete-client', payload: client });
    const requestRestoreClient = (client) =>
        setConfirmState({ type: 'restore', payload: client });

    const handleConfirm = async () => {
        if (!confirmState) return;
        const { type, payload } = confirmState;
        try {
            if (type === 'delete-client') {
                await api.delete(`${CLIENTS_URL}/${payload._id}`);
                showToast('Mijoz o‘chirildi.', 'success');
                if (selectedClientId === payload._id) {
                    setSelectedClientId(null);
                }
                await mutate();
            } else if (type === 'restore') {
                showToast('Mijozni tiklash uchun tahrirlash orqali faollashtiring.', 'info');
            }
            await mutate();
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Amalni bajarib bo‘lmadi.', 'error');
        } finally {
            setConfirmState(null);
        }
    };

    const confirmCopy = {
        'delete-client': {
            title: 'Mijozni o‘chirish',
            message: (p) => `“${p.name}” mijozini o‘chirishni tasdiqlaysizmi?`,
            confirmLabel: 'O‘chirish',
            danger: true,
        },
        restore: {
            title: 'Mijozni tiklash',
            message: () => `Mijozni tiklash funksiyasi hozircha mavjud emas. Tahrirlash orqali uni qayta faollashtiring.`,
            confirmLabel: 'Tushunarli',
            danger: false,
        },
    };

    // ---------- Navigation ----------
    const goToDetail = (clientId) => setSelectedClientId(clientId);
    const goToList = () => setSelectedClientId(null);

    // ---------- Print function ----------
    const handlePrint = () => {
        if (!client) return;
        window.print();
    };

    // ---------- Payment quick-amount helpers ----------
    const currentDebt = client?.debt || 0;
    const paymentAmountNum = Number(paymentForm.amount) || 0;

    // ============================================================
    // RENDER: DETAIL VIEW
    // ============================================================
    if (selectedClientId) {
        if (detailLoading) {
            return (
                <div className="min-h-screen bg-white flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <span className="ml-3 text-gray-600">Yuklanmoqda...</span>
                </div>
            );
        }
        if (detailError || !client) {
            return (
                <div className="min-h-screen bg-white flex items-center justify-center px-4">
                    <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Mijoz topilmadi</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            {detailError?.response?.data?.message || 'Mijoz mavjud emas yoki o‘chirilgan.'}
                        </p>
                        <button
                            onClick={goToList}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                            Mijozlar ro‘yxatiga qaytish
                        </button>
                    </div>
                </div>
            );
        }

        const isDeleted = client.isDeleted;
        const totalOrders = client.orders?.length || 0;
        const totalPaid = client.paymentHistory?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
        const debt = client.debt || 0;

        return (
            <div className="min-h-screen bg-white py-6 px-4 sm:px-6">
                <div className="mx-auto animate-in slide-in-from-left-4 duration-300">
                    <div className="flex items-center justify-between mb-6">
                        <button
                            onClick={goToList}
                            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition"
                        >
                            <ArrowLeft size={18} /> Mijozlar ro‘yxati
                        </button>
                        <button
                            onClick={handlePrint}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium shadow-sm transition print-hide"
                        >
                            <Printer size={18} /> Chop etish
                        </button>
                    </div>

                    {/* Printable content */}
                    <div ref={printRef} className="print-content">
                        <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-gray-200 flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                                        <Users className="text-blue-600" size={28} />
                                        {client.name}
                                    </h1>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                            <Phone size={14} />
                                            {client.phone}
                                        </span>
                                        {isDeleted && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">
                                                <Trash2 size={14} />
                                                O‘chirilgan
                                            </span>
                                        )}
                                        <span className="text-xs text-gray-400">
                                            Qo‘shilgan: {new Date(client.createdAt).toLocaleDateString('uz-UZ')}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-2 flex-wrap print-hide">
                                    {!isDeleted && (
                                        <button
                                            onClick={() => openPaymentModal(client)}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                                        >
                                            <CreditCard size={16} /> To‘lov qo‘shish
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-6 bg-white border-b border-gray-200">
                                <StatCard icon={DollarSign} label="Qarz" value={`${debt.toLocaleString()} $`} color="red" />
                                <StatCard icon={CreditCard} label="To‘langan" value={`${totalPaid.toLocaleString()} $`} color="green" />
                                <StatCard icon={ShoppingBag} label="Buyurtmalar soni" value={totalOrders} color="blue" />
                                <StatCard
                                    icon={Users}
                                    label="Holati"
                                    value={isDeleted ? 'O‘chirilgan' : 'Faol'}
                                    color={isDeleted ? 'red' : 'green'}
                                />
                            </div>

                            {/* Payment History - Excel style */}
                            <div className="p-6">
                                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                                    To‘lovlar tarixi ({client.paymentHistory?.length || 0})
                                </h3>
                                {client.paymentHistory?.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-sm">
                                        <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                                        Hali to‘lovlar yo‘q
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                        <table className="w-full text-sm">
                                            <thead className="bg-white border-b border-gray-200">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-600">Sana</th>
                                                    <th className="px-4 py-3 text-right font-medium text-gray-600">Summa ($)</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-600">Izoh</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-600">Qo‘shgan</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {client.paymentHistory.map((payment, idx) => (
                                                    <tr key={idx} className={`hover:bg-white transition ${idx % 2 === 0 ? 'bg-white' : 'bg-white/50'}`}>
                                                        <td className="px-4 py-3 text-gray-600">
                                                            {new Date(payment.date).toLocaleDateString('uz-UZ')}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                                                            {payment.amount.toLocaleString()}
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-500">{payment.note || '-'}</td>
                                                        <td className="px-4 py-3 text-gray-500">{payment.user?.name || '-'}</td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-white font-semibold border-t-2 border-gray-200">
                                                    <td colSpan="1" className="px-4 py-3 text-right text-gray-700">Jami:</td>
                                                    <td className="px-4 py-3 text-right text-emerald-700">{totalPaid.toLocaleString()} $</td>
                                                    <td colSpan="2"></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Orders Table - Excel style */}
                            {client.orders && client.orders.length > 0 && (
                                <div className="px-6 pb-6">
                                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                                        Buyurtmalar ({client.orders.length})
                                    </h3>
                                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                                        <table className="w-full text-sm">
                                            <thead className="bg-white border-b border-gray-200">
                                                <tr>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-600">#</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-600">Sana</th>
                                                    <th className="px-4 py-3 text-right font-medium text-gray-600">Summa ($)</th>
                                                    <th className="px-4 py-3 text-left font-medium text-gray-600">Holat</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {client.orders.map((order, idx) => (
                                                    <tr key={order._id} className={`hover:bg-white transition ${idx % 2 === 0 ? 'bg-white' : 'bg-white/50'}`}>
                                                        <td className="px-4 py-3 text-gray-600">{idx + 1}</td>
                                                        <td className="px-4 py-3 text-gray-600">
                                                            {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                                                            {order.orderTotal?.toLocaleString() || 0}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${order.status === 'completed'
                                                                ? 'bg-green-100 text-green-700'
                                                                : order.status === 'cancelled'
                                                                    ? 'bg-red-100 text-red-700'
                                                                    : 'bg-yellow-100 text-yellow-700'
                                                                }`}>
                                                                {order.status === 'pending' ? 'Kutilmoqda' : order.status === 'completed' ? 'Bajarilgan' : 'Bekor'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-white font-semibold border-t-2 border-gray-200">
                                                    <td colSpan="2" className="px-4 py-3 text-right text-gray-700">Jami:</td>
                                                    <td className="px-4 py-3 text-right text-emerald-700">
                                                        {client.orders.reduce((sum, o) => sum + (o.orderTotal || 0), 0).toLocaleString()} $
                                                    </td>
                                                    <td></td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            <div className="px-6 py-4 border-t border-gray-200 bg-white/50 text-xs text-gray-400 flex flex-wrap justify-between gap-2">
                                <span>ID: {client._id}</span>
                                <span>Yangilangan: {new Date(client.updatedAt).toLocaleString('uz-UZ')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modals & overlays */}
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
                                {editingClient ? 'Mijozni tahrirlash' : 'Yangi mijoz qo‘shish'}
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                {editingClient ? 'Maʼlumotlarni o‘zgartiring va saqlang.' : 'Barcha maydonlarni to‘ldiring.'}
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
                                        placeholder="+998901234567"
                                    />
                                    {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Qarz ($)</label>
                                    <input
                                        type="number"
                                        name="debt"
                                        step="0.01"
                                        min="0"
                                        value={form.debt}
                                        onChange={handleFormChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${formErrors.debt ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                            }`}
                                        placeholder="0.00"
                                    />
                                    {formErrors.debt && <p className="text-xs text-red-500 mt-1">{formErrors.debt}</p>}
                                    {editingClient && (
                                        <p className="text-xs text-gray-400 mt-1">Qarzni qo‘lda tuzatish (agar kerak bo‘lsa)</p>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={saving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {editingClient ? 'Yangilash' : 'Yaratish'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Payment Modal */}
                {paymentModalOpen && client && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
                        onClick={closePaymentModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closePaymentModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
                                disabled={paymentSaving}
                            >
                                <X size={24} />
                            </button>

                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <CreditCard size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-gray-900 truncate">To‘lov qo‘shish</h2>
                                    <p className="text-sm text-gray-500 truncate">{client.name}</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5 grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Joriy qarz</p>
                                    <p className="text-lg font-bold text-red-600">{currentDebt.toLocaleString()} $</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">To‘lovdan keyin</p>
                                    <p className={`text-lg font-bold ${paymentAmountNum > 0 && currentDebt - paymentAmountNum <= 0
                                        ? 'text-emerald-600'
                                        : 'text-gray-900'
                                        }`}>
                                        {Math.max(currentDebt - paymentAmountNum, 0).toLocaleString()} $
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Summa ($) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        step="0.01"
                                        min="0.01"
                                        autoFocus
                                        value={paymentForm.amount}
                                        onChange={handlePaymentChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-medium ${paymentErrors.amount ? 'border-red-400' : 'border-gray-300 focus:border-emerald-500'
                                            }`}
                                        placeholder="100000"
                                    />
                                    {paymentErrors.amount ? (
                                        <p className="text-xs text-red-500 mt-1">{paymentErrors.amount}</p>
                                    ) : paymentAmountNum > currentDebt && currentDebt > 0 ? (
                                        <p className="text-xs text-amber-600 mt-1">
                                            Kiritilgan summa joriy qarzdan {(paymentAmountNum - currentDebt).toLocaleString()} $ ko‘p.
                                        </p>
                                    ) : null}

                                    {currentDebt > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <button
                                                type="button"
                                                onClick={() => setPaymentForm(prev => ({ ...prev, amount: String(Math.round(currentDebt * 0.25 * 100) / 100) }))}
                                                className="px-2.5 py-1 text-xs font-medium rounded-full border border-gray-300 text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition"
                                            >
                                                25%
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentForm(prev => ({ ...prev, amount: String(Math.round(currentDebt * 0.5 * 100) / 100) }))}
                                                className="px-2.5 py-1 text-xs font-medium rounded-full border border-gray-300 text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition"
                                            >
                                                50%
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPaymentForm(prev => ({ ...prev, amount: String(currentDebt) }))}
                                                className="px-2.5 py-1 text-xs font-medium rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                                            >
                                                To‘liq ({currentDebt.toLocaleString()} $)
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Izoh</label>
                                    <input
                                        type="text"
                                        name="note"
                                        value={paymentForm.note}
                                        onChange={handlePaymentChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                        placeholder="Naqd to‘lov"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={closePaymentModal}
                                        disabled={paymentSaving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={paymentSaving || !paymentForm.amount}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {paymentSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        To‘lov qo‘shish
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Confirm Dialog */}
                <ConfirmDialog
                    open={!!confirmState}
                    title={confirmState ? confirmCopy[confirmState.type].title : ''}
                    message={confirmState ? confirmCopy[confirmState.type].message(confirmState.payload) : ''}
                    confirmLabel={confirmState ? confirmCopy[confirmState.type].confirmLabel : ''}
                    danger={confirmState ? confirmCopy[confirmState.type].danger : true}
                    onConfirm={handleConfirm}
                    onCancel={() => setConfirmState(null)}
                />

                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        );
    }

    // ============================================================
    // RENDER: LIST VIEW
    // ============================================================
    return (
        <div className="min-h-screen bg-white font-sans">
            <div className="mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Mijozlar</h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {meta.total ? `Jami ${meta.total} ta mijoz` : 'Mijozlarni boshqarish'}
                        </p>
                    </div>
                    <button
                        onClick={openCreateModal}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto"
                    >
                        <Plus size={18} /> Yangi mijoz
                    </button>
                </div>

                {/* Toolbar */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={handleSearch}
                            placeholder="Ism yoki telefon bo‘yicha qidirish..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
                    {search && (
                        <button
                            onClick={clearFilters}
                            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 whitespace-nowrap"
                        >
                            Tozalash
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {error ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                            <p className="text-gray-700 font-medium mb-1">Mijozlarni yuklab bo‘lmadi</p>
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
                                        <th className="px-4 py-3 font-medium text-right">Qarz ($)</th>
                                        <th className="px-4 py-3 font-medium text-right">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isLoading && !data ? (
                                        <SkeletonRows rows={limit} />
                                    ) : clients.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="px-4 py-16 text-center">
                                                <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-600 font-medium mb-1">Mijoz topilmadi</p>
                                                <p className="text-sm text-gray-400 mb-4">
                                                    {search ? 'Qidiruv shartlariga mos mijoz yo‘q.' : 'Hali birorta mijoz qo‘shilmagan.'}
                                                </p>
                                                {!search && (
                                                    <button
                                                        onClick={openCreateModal}
                                                        className="text-sm font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                                                    >
                                                        <Plus size={16} /> Birinchi mijozni qo‘shish
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ) : (
                                        clients.map((client) => (
                                            <tr
                                                key={client._id}
                                                className={`border-b border-gray-100 last:border-b-0 hover:bg-white transition align-top ${client.isDeleted ? 'opacity-50' : ''}`}
                                            >
                                                <td
                                                    className="px-4 py-4 cursor-pointer"
                                                    onClick={() => goToDetail(client._id)}
                                                >
                                                    <div className="font-medium text-gray-900 hover:text-blue-600 transition">
                                                        {client.name}
                                                    </div>
                                                    {client.isDeleted && (
                                                        <span className="inline-flex items-center gap-1 mt-1 text-xs text-red-500">
                                                            <Trash2 size={12} /> O‘chirilgan
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-gray-600">{client.phone}</td>
                                                <td className="px-4 py-4 text-right font-medium text-red-600">
                                                    {client.debt?.toLocaleString() || 0}
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="flex justify-end gap-1">
                                                        {client.isDeleted ? (
                                                            <button
                                                                onClick={() => requestRestoreClient(client)}
                                                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                                                title="Tiklash"
                                                            >
                                                                <RotateCw size={18} />
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => openPaymentModal(client)}
                                                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                                                    title="To‘lov qo‘shish"
                                                                >
                                                                    <CreditCard size={18} />
                                                                </button>
                                                                <button
                                                                    onClick={() => openEditModal(client)}
                                                                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                                    title="Tahrirlash"
                                                                >
                                                                    <Pencil size={18} />
                                                                </button>
                                                                <button
                                                                    onClick={() => requestDeleteClient(client)}
                                                                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                                    title="O‘chirish"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </button>
                                                            </>
                                                        )}
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
                    {!error && clients.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm">
                            <span className="text-gray-500">
                                {page}-sahifa / {totalPages} {isValidating && <Loader2 className="inline w-4 h-4 animate-spin ml-1" />}
                            </span>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page <= 1}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page >= totalPages}
                                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white"
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Modals */}
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
                                {editingClient ? 'Mijozni tahrirlash' : 'Yangi mijoz qo‘shish'}
                            </h2>
                            <p className="text-sm text-gray-500 mb-6">
                                {editingClient ? 'Maʼlumotlarni o‘zgartiring va saqlang.' : 'Barcha maydonlarni to‘ldiring.'}
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
                                        placeholder="+998901234567"
                                    />
                                    {formErrors.phone && <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Qarz ($)</label>
                                    <input
                                        type="number"
                                        name="debt"
                                        step="0.01"
                                        // min="0"
                                        value={form.debt}
                                        onChange={handleFormChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none ${formErrors.debt ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                                            }`}
                                        placeholder="0.00"
                                    />
                                    {formErrors.debt && <p className="text-xs text-red-500 mt-1">{formErrors.debt}</p>}
                                    {editingClient && (
                                        <p className="text-xs text-gray-400 mt-1">Qarzni qo‘lda tuzatish (agar kerak bo‘lsa)</p>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        disabled={saving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {editingClient ? 'Yangilash' : 'Yaratish'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Payment Modal (from list) */}
                {paymentModalOpen && selectedClientId && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
                        onClick={closePaymentModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative animate-in zoom-in-95 slide-in-from-bottom-2 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closePaymentModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
                                disabled={paymentSaving}
                            >
                                <X size={24} />
                            </button>

                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-11 h-11 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                    <CreditCard size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-lg font-bold text-gray-900 truncate">To‘lov qo‘shish</h2>
                                    <p className="text-sm text-gray-500 truncate">Mijoz ID: {selectedClientId.slice(-6)}</p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-200 bg-white p-4 mb-5 grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">Joriy qarz</p>
                                    <p className="text-lg font-bold text-red-600">—</p>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 mb-0.5">To‘lovdan keyin</p>
                                    <p className="text-lg font-bold text-gray-900">—</p>
                                </div>
                            </div>

                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Summa ($) *</label>
                                    <input
                                        type="number"
                                        name="amount"
                                        step="0.01"
                                        min="0.01"
                                        autoFocus
                                        value={paymentForm.amount}
                                        onChange={handlePaymentChange}
                                        className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-lg font-medium ${paymentErrors.amount ? 'border-red-400' : 'border-gray-300 focus:border-emerald-500'
                                            }`}
                                        placeholder="100000"
                                    />
                                    {paymentErrors.amount && <p className="text-xs text-red-500 mt-1">{paymentErrors.amount}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Izoh</label>
                                    <input
                                        type="text"
                                        name="note"
                                        value={paymentForm.note}
                                        onChange={handlePaymentChange}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                        placeholder="Naqd to‘lov"
                                    />
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                                    <button
                                        type="button"
                                        onClick={closePaymentModal}
                                        disabled={paymentSaving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={paymentSaving || !paymentForm.amount}
                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {paymentSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        To‘lov qo‘shish
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <ConfirmDialog
                    open={!!confirmState}
                    title={confirmState ? confirmCopy[confirmState.type].title : ''}
                    message={confirmState ? confirmCopy[confirmState.type].message(confirmState.payload) : ''}
                    confirmLabel={confirmState ? confirmCopy[confirmState.type].confirmLabel : ''}
                    danger={confirmState ? confirmCopy[confirmState.type].danger : true}
                    onConfirm={handleConfirm}
                    onCancel={() => setConfirmState(null)}
                />

                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </div>
    );
};

// ---------- Print styles ----------
const printStyles = `
  @media print {
    body * {
      visibility: hidden;
    }
    .print-content, .print-content * {
      visibility: visible;
    }
    .print-content {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      padding: 20px;
    }
    .print-hide {
      display: none !important;
    }
    .print-content .bg-white {
      background: white !important;
      border: 1px solid #ddd !important;
      box-shadow: none !important;
    }
    .print-content .border-gray-200 {
      border-color: #ddd !important;
    }
    .print-content table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .print-content table th,
    .print-content table td {
      border: 1px solid #ddd;
      padding: 6px 10px;
      text-align: left;
    }
    .print-content table th {
      background: #f3f4f6 !important;
      font-weight: 600;
      color: #1f2937;
    }
    .print-content table td.text-right {
      text-align: right !important;
    }
    .print-content .bg-white {
      background: #f9fafb !important;
    }
    .print-content .bg-gray-100 {
      background: #f3f4f6 !important;
    }
    .print-content .bg-gray-200 {
      background: #e5e7eb !important;
    }
    .print-content .p-6 {
      padding: 16px !important;
    }
    .print-content .rounded-2xl {
      border-radius: 0 !important;
    }
    .print-content .rounded-xl {
      border-radius: 0 !important;
    }
    .print-content .shadow-sm,
    .print-content .shadow-md {
      box-shadow: none !important;
    }
    .print-content .text-emerald-700 {
      color: #047857 !important;
    }
    .print-content .text-red-600 {
      color: #dc2626 !important;
    }
    .print-content .text-gray-900 {
      color: #111827 !important;
    }
    .print-content .text-gray-700 {
      color: #374151 !important;
    }
    .print-content .font-semibold {
      font-weight: 600 !important;
    }
    .print-content .font-bold {
      font-weight: 700 !important;
    }
    .print-content .uppercase {
      text-transform: uppercase !important;
    }
    .print-content .tracking-wider {
      letter-spacing: 0.05em !important;
    }
      @page {
      margin: 0.8cm;
    }
    
    .print-content table {
      page-break-inside: auto;
    }
    .print-content tr {
      page-break-inside: avoid;
    }
    .print-content thead {
      display: table-header-group;
    }
    
    /* Jadval ichidagi padding va fontni kichraytirish */
    .print-content td,
    .print-content th {
      padding: 4px 6px !important;
      font-size: 10px !important;
    }
    .print-content .p-6 {
      padding: 8px !important;
    }
    .print-content h1 {
      font-size: 18px !important;
    }
    .print-content .text-sm {
      font-size: 10px !important;
    }
  }
`;

if (!document.getElementById("print-style")) {
    const style = document.createElement("style");
    style.id = "print-style";
    style.innerHTML = printStyles;
    document.head.appendChild(style);
}