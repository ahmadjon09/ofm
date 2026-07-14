import React, { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
  Plus,
  Trash2,
  Pencil,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ShoppingCart,
  User,
  DollarSign,
  ArrowLeft,
  Package,
  FileText,
  Printer,
} from 'lucide-react';

const ORDERS_URL = '/orders';
const CLIENTS_URL = '/clients';
const PRODUCTS_URL = '/products';
const STATUS_OPTIONS = ['pending', 'completed', 'cancelled'];
const STATUS_LABELS = {
  pending: 'Kutilmoqda',
  completed: 'Bajarilgan',
  cancelled: 'Bekor qilingan',
};
const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

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

// ---------- Async Search Select ----------
const AsyncSearchSelect = ({
  fetchUrl,
  dataKey,
  value,
  displayValue,
  onSelect,
  onClear,
  placeholder = 'Qidirish...',
  renderOption,
  labelKey = 'name',
  valueKey = '_id',
  subLabelKey = null,
  error = false,
  disabled = false,
  emptyText = 'Natija topilmadi',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const runSearch = useCallback(
    (term) => {
      const currentId = ++requestIdRef.current;
      setLoading(true);
      setFetchError(false);
      const params = new URLSearchParams({ limit: '20' });
      if (term) params.append('search', term);
      api
        .get(`${fetchUrl}?${params.toString()}`)
        .then((res) => {
          if (currentId !== requestIdRef.current) return;
          setOptions(res.data?.data?.[dataKey] || []);
        })
        .catch(() => {
          if (currentId !== requestIdRef.current) return;
          setOptions([]);
          setFetchError(true);
        })
        .finally(() => {
          if (currentId === requestIdRef.current) setLoading(false);
        });
    },
    [fetchUrl, dataKey]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), query ? 350 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [query, isOpen, runSearch]);

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    setQuery('');
  };

  const handleSelect = (opt) => {
    onSelect(opt);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = (e) => {
    e.stopPropagation();
    if (onClear) onClear();
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={`flex items-center justify-between w-full px-3 py-2 border rounded-lg bg-white ${disabled ? 'opacity-60 cursor-not-allowed bg-white' : 'cursor-pointer'
          } focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 ${error ? 'border-red-400' : 'border-gray-300'
          }`}
        onClick={handleOpen}
      >
        <input
          type="text"
          disabled={disabled}
          className="w-full outline-none bg-transparent text-sm disabled:cursor-not-allowed"
          placeholder={placeholder}
          value={isOpen ? query : displayValue || ''}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleOpen}
        />
        <div className="flex items-center gap-1 shrink-0 pl-2">
          {loading && <Loader2 size={14} className="animate-spin text-gray-400" />}
          {!loading && value && onClear && (
            <button
              type="button"
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-700"
              tabIndex={-1}
              title="Tozalash"
            >
              <X size={14} />
            </button>
          )}
          <ChevronRight
            size={16}
            className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      {isOpen && (
        <div className="absolute z-20 w-full mt-1 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {loading && options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Qidirilmoqda...
            </div>
          ) : fetchError ? (
            <div className="px-4 py-3 text-sm text-red-500">Qidirishda xatolik yuz berdi.</div>
          ) : options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">{emptyText}</div>
          ) : (
            options.map((opt) => (
              <div
                key={opt[valueKey]}
                className={`px-4 py-2 text-sm cursor-pointer hover:bg-gray-100 transition ${opt[valueKey] === value ? 'bg-blue-50 text-blue-700' : ''
                  }`}
                onClick={() => handleSelect(opt)}
              >
                {renderOption ? (
                  renderOption(opt)
                ) : (
                  <>
                    <div className="font-medium">{String(opt[labelKey])}</div>
                    {subLabelKey && opt[subLabelKey] != null && (
                      <div className="text-xs text-gray-400">{String(opt[subLabelKey])}</div>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export const Orders = () => {
  // ---------- List state ----------
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [clientFilterLabel, setClientFilterLabel] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // ---------- Detail state ----------
  const [selectedOrder, setSelectedOrder] = useState(null);

  // ---------- Create modal ----------
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const emptyItem = { productId: '', productLabel: '', productSizes: [], size: '', price: '', quantityKg: '' };
  const [createForm, setCreateForm] = useState({
    clientId: '',
    clientLabel: '',
    addToDebt: true,
    items: [{ ...emptyItem }],
  });

  // ---------- Status update modal ----------
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusOrder, setStatusOrder] = useState(null);
  const [newStatus, setNewStatus] = useState('pending');
  const [statusSaving, setStatusSaving] = useState(false);

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
    if (statusFilter) params.append('status', statusFilter);
    if (clientFilter) params.append('clientId', clientFilter);
    if (fromDate) params.append('from', new Date(fromDate).toISOString());
    if (toDate) params.append('to', new Date(toDate).toISOString());
    return params.toString();
  }, [page, limit, statusFilter, clientFilter, fromDate, toDate]);

  // ---------- SWR for list ----------
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    `${ORDERS_URL}?${buildQuery()}`,
    (url) => api.get(url).then((res) => res.data),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const orders = data?.data?.orders || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };
  const totalPages = Math.max(meta.totalPages || 1, 1);

  // ---------- List handlers ----------
  const clearFilters = () => {
    setStatusFilter('');
    setClientFilter('');
    setClientFilterLabel('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };
  const goToPage = (p) => {
    if (p < 1 || p > totalPages) return;
    setPage(p);
  };

  // Close modals on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (createModalOpen && !creating) setCreateModalOpen(false);
        if (statusModalOpen && !statusSaving) setStatusModalOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [createModalOpen, creating, statusModalOpen, statusSaving]);

  // ---------- Create modal ----------
  const openCreateModal = () => {
    setCreateForm({
      clientId: '',
      clientLabel: '',
      addToDebt: true,
      items: [{ ...emptyItem }],
    });
    setCreateErrors({});
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    if (creating) return;
    setCreateModalOpen(false);
  };

  const handleCreateChange = (e) => {
    const { name, value, type, checked } = e.target;
    setCreateForm({
      ...createForm,
      [name]: type === 'checkbox' ? checked : value,
    });
    setCreateErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleClientSelect = (opt) => {
    setCreateForm((prev) => ({ ...prev, clientId: opt._id, clientLabel: opt.name }));
    setCreateErrors((prev) => ({ ...prev, clientId: undefined }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...createForm.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setCreateForm({ ...createForm, items: newItems });
    setCreateErrors((prev) => ({ ...prev, [`item-${index}-${field}`]: undefined }));
  };

  const handleItemProductSelect = (index, opt) => {
    const newItems = [...createForm.items];
    newItems[index] = {
      productId: opt._id,
      productLabel: opt.name,
      productSizes: opt.sizes || [],
      size: '',
      price: '',
      quantityKg: '',
    };
    setCreateForm({ ...createForm, items: newItems });
    setCreateErrors((prev) => ({
      ...prev,
      [`item-${index}-productId`]: undefined,
      [`item-${index}-size`]: undefined,
    }));
  };

  const handleItemSizeChange = (index, sizeValue) => {
    const newItems = [...createForm.items];
    const item = newItems[index];
    const sizeEntry = (item.productSizes || []).find((s) => String(s.size) === String(sizeValue));
    newItems[index] = {
      ...item,
      size: sizeValue,
      price: item.price || (sizeEntry ? String(sizeEntry.price) : ''),
    };
    setCreateForm({ ...createForm, items: newItems });
    setCreateErrors((prev) => ({ ...prev, [`item-${index}-size`]: undefined }));
  };

  const addItemRow = () => {
    setCreateForm({
      ...createForm,
      items: [...createForm.items, { ...emptyItem }],
    });
  };

  const removeItemRow = (index) => {
    if (createForm.items.length <= 1) return;
    setCreateForm({
      ...createForm,
      items: createForm.items.filter((_, i) => i !== index),
    });
  };

  const validateCreate = () => {
    const errors = {};
    if (!createForm.clientId) errors.clientId = 'Mijoz tanlanishi shart.';
    createForm.items.forEach((item, i) => {
      if (!item.productId) errors[`item-${i}-productId`] = 'Mahsulot tanlang.';
      if (!item.size) errors[`item-${i}-size`] = 'O‘lcham tanlang.';
      if (!item.price || Number(item.price) <= 0) errors[`item-${i}-price`] = 'Narx 0 dan katta bo‘lishi kerak.';
      if (!item.quantityKg || Number(item.quantityKg) <= 0) errors[`item-${i}-quantityKg`] = 'Miqdor 0 dan katta bo‘lishi kerak.';
    });
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!validateCreate()) {
      showToast('Iltimos, formadagi xatoliklarni tuzating.', 'error');
      return;
    }

    const payload = {
      clientId: createForm.clientId,
      addToDebt: createForm.addToDebt,
      items: createForm.items.map((item) => ({
        productId: item.productId,
        size: Number(item.size),
        pricePerKg: Number(item.price),
        quantityKg: Number(item.quantityKg),
      })),
    };

    setCreating(true);
    try {
      await api.post(ORDERS_URL, payload);
      showToast('Buyurtma yaratildi.', 'success');
      await mutate();
      setCreateModalOpen(false);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
    } finally {
      setCreating(false);
    }
  };

  // ---------- Status update ----------
  const openStatusModal = (order) => {
    setStatusOrder(order);
    setNewStatus(order.status);
    setStatusModalOpen(true);
  };

  const closeStatusModal = () => {
    if (statusSaving) return;
    setStatusModalOpen(false);
  };

  const handleStatusSubmit = async (e) => {
    e.preventDefault();
    if (!statusOrder) return;
    if (newStatus === statusOrder.status) {
      showToast('Holat o‘zgartirilmadi.', 'info');
      setStatusModalOpen(false);
      return;
    }

    setStatusSaving(true);
    try {
      await api.patch(`${ORDERS_URL}/${statusOrder._id}/status`, { status: newStatus });
      showToast('Holat yangilandi.', 'success');
      await mutate();
      if (selectedOrder && selectedOrder._id === statusOrder._id) {
        setSelectedOrder({ ...selectedOrder, status: newStatus });
      }
      setStatusModalOpen(false);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
    } finally {
      setStatusSaving(false);
    }
  };

  // ---------- Delete ----------
  const requestDeleteOrder = (order) =>
    setConfirmState({ type: 'delete-order', payload: order });

  const handleConfirm = async () => {
    if (!confirmState) return;
    const { type, payload } = confirmState;
    try {
      if (type === 'delete-order') {
        await api.delete(`${ORDERS_URL}/${payload._id}`);
        showToast('Buyurtma o‘chirildi.', 'success');
        if (selectedOrder && selectedOrder._id === payload._id) {
          setSelectedOrder(null);
        }
        await mutate();
      }
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Amalni bajarib bo‘lmadi.', 'error');
    } finally {
      setConfirmState(null);
    }
  };

  const confirmCopy = {
    'delete-order': {
      title: 'Buyurtmani o‘chirish',
      message: (p) =>
        `${p.client?.name || 'Noma’lum mijoz'} uchun ${(p.orderTotal || 0).toLocaleString()} $ lik buyurtmani butunlay o‘chirishni tasdiqlaysizmi? Bu amalni orqaga qaytarib bo‘lmaydi.`,
      confirmLabel: 'Butunlay o‘chirish',
      danger: true,
    },
  };

  // ---------- Navigation ----------
  const goToDetail = (order) => setSelectedOrder(order);
  const goToList = () => setSelectedOrder(null);

  // ---------- Print function ----------
  const handlePrint = () => {
    if (!selectedOrder) return;
    window.print();
  };

  // ============================================================
  // RENDER: DETAIL VIEW
  // ============================================================
  if (selectedOrder) {
    const order = selectedOrder;
    const total = order.orderTotal || 0;

    return (
      <div className="min-h-screen bg-white py-6 px-4 sm:px-6">
        <div className="mx-auto animate-in slide-in-from-left-4 duration-300">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={goToList}
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition print-hide"
            >
              <ArrowLeft size={18} /> Buyurtmalar ro‘yxati
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
                    <ShoppingCart className="text-blue-600" size={28} />
                    Buyurtma #{order._id.slice(-6)}
                  </h1>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      <User size={14} />
                      {order.client?.name || 'Noma’lum'}
                    </span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status] || order.status}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap print-hide">
                  <button
                    onClick={() => openStatusModal(order)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                  >
                    <Pencil size={16} /> Holatni o‘zgartirish
                  </button>
                  <button
                    onClick={() => requestDeleteOrder(order)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                  >
                    <Trash2 size={16} /> O‘chirish
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-6 bg-white border-b border-gray-200">
                <StatCard icon={DollarSign} label="Jami summa" value={`${total.toLocaleString()} $`} color="green" />
                <StatCard icon={Package} label="Mahsulotlar soni" value={order.items?.length || 0} color="blue" />
                <StatCard
                  icon={User}
                  label="Mijoz"
                  value={order.client?.name || 'Noma’lum'}
                  color="purple"
                />
                <StatCard
                  icon={DollarSign}
                  label="Mijoz qarzi"
                  value={order.client?.debt + " $" || '---'}
                  color="purple"
                />
              </div>

              {/* Items table - Excel style */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                  Mahsulotlar ({order.items?.length || 0})
                </h3>
                {order.items?.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    Mahsulotlar yo‘q
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm">
                      <thead className="bg-white border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">Mahsulot</th>
                          <th className="px-4 py-3 text-left font-medium text-gray-600">O‘lcham</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Miqdor (kg)</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Narx (kg / $)</th>
                          <th className="px-4 py-3 text-right font-medium text-gray-600">Summa ($)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {order.items.map((item, idx) => (
                          <tr key={idx} className={`hover:bg-white transition ${idx % 2 === 0 ? 'bg-white' : 'bg-white/50'}`}>
                            <td className="px-4 py-3 font-medium text-gray-800">{item.productCategory}</td>
                            <td className="px-4 py-3 text-gray-600">{item.size}</td>
                            <td className="px-4 py-3 text-right font-medium text-gray-800">
                              {item.quantityKg}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-600">
                              {item.pricePerKg}
                            </td>
                            <td className="px-4 py-3 text-right font-medium text-emerald-700">
                              {item.subtotal?.toLocaleString() || 0}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-white font-semibold border-t-2 border-gray-200">
                          <td colSpan="4" className="px-4 py-3 text-right text-gray-700">Jami:</td>
                          <td className="px-4 py-3 text-right text-emerald-700">{total.toLocaleString()} $</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-200 bg-white/50 text-xs text-gray-400 flex flex-wrap justify-between gap-2">
                <span>ID: {order._id}</span>
                <span>Yaratgan: {order.createdBy?.name || '-'}</span>
                <span>Yangilangan: {new Date(order.updatedAt).toLocaleString('uz-UZ')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modals are now rendered at the very end of the main component return */}
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
            <h1 className="text-2xl font-bold text-gray-900">Buyurtmalar</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {meta.total ? `Jami ${meta.total} ta buyurtma` : 'Buyurtmalarni boshqarish'}
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto"
          >
            <Plus size={18} /> Yangi buyurtma
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 min-w-[220px]">
            <AsyncSearchSelect
              fetchUrl={CLIENTS_URL}
              dataKey="clients"
              value={clientFilter}
              displayValue={clientFilterLabel}
              onSelect={(opt) => {
                setClientFilter(opt._id);
                setClientFilterLabel(opt.name);
                setPage(1);
              }}
              onClear={() => {
                setClientFilter('');
                setClientFilterLabel('');
                setPage(1);
              }}
              placeholder="Mijoz bo‘yicha qidirish..."
              labelKey="name"
              subLabelKey="phone"
              emptyText="Mijoz topilmadi"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">Barcha holatlar</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
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
          {(statusFilter || clientFilter || fromDate || toDate) && (
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
              <p className="text-gray-700 font-medium mb-1">Buyurtmalarni yuklab bo‘lmadi</p>
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
                    <th className="px-4 py-3 font-medium">Mijoz</th>
                    <th className="px-4 py-3 font-medium">Sana</th>
                    <th className="px-4 py-3 font-medium">Holat</th>
                    <th className="px-4 py-3 font-medium text-right">Summa ($)</th>
                    <th className="px-4 py-3 font-medium text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && !data ? (
                    <SkeletonRows rows={limit} />
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-16 text-center">
                        <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium mb-1">Buyurtma topilmadi</p>
                        <p className="text-sm text-gray-400 mb-4">
                          {statusFilter || clientFilter || fromDate || toDate ? 'Qidiruv shartlariga mos buyurtma yo‘q.' : 'Hali birorta buyurtma qo‘shilmagan.'}
                        </p>
                        {!statusFilter && !clientFilter && !fromDate && !toDate && (
                          <button
                            onClick={openCreateModal}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          >
                            <Plus size={16} /> Birinchi buyurtmani qo‘shish
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr
                        key={order._id}
                        className="border-b border-gray-100 last:border-b-0 hover:bg-white transition align-top"
                      >
                        <td
                          className="px-4 py-4 cursor-pointer"
                          onClick={() => goToDetail(order)}
                        >
                          <div className="font-medium text-gray-900 hover:text-blue-600 transition">
                            {order.client?.name || 'Noma’lum'}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                            {STATUS_LABELS[order.status] || order.status}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-gray-900">
                          {order.orderTotal?.toLocaleString() || 0}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => openStatusModal(order)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                              title="Holatni o‘zgartirish"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => requestDeleteOrder(order)}
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
          {!error && orders.length > 0 && (
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

        {/* ====== Create Order Modal ====== */}
        {createModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
            onClick={closeCreateModal}
          >
            <div
              className="bg-white w-full max-w-4xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeCreateModal}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
                disabled={creating}
              >
                <X size={24} />
              </button>

              <h2 className="text-2xl font-bold text-gray-900 mb-1">Yangi buyurtma</h2>
              <p className="text-sm text-gray-500 mb-6">Barcha maydonlarni to‘ldiring.</p>

              <form onSubmit={handleCreateSubmit} className="space-y-5">
                {/* Client - Server search */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mijoz *</label>
                  <AsyncSearchSelect
                    fetchUrl={CLIENTS_URL}
                    dataKey="clients"
                    value={createForm.clientId}
                    displayValue={createForm.clientLabel}
                    onSelect={handleClientSelect}
                    placeholder="Mijoz qidirish (ism yoki tel)..."
                    labelKey="name"
                    subLabelKey="phone"
                    error={!!createErrors.clientId}
                    emptyText="Mijoz topilmadi"
                  />
                  {createErrors.clientId && (
                    <p className="text-xs text-red-500 mt-1">{createErrors.clientId}</p>
                  )}
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Mahsulotlar *</label>
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <Plus size={16} /> Qo‘shish
                    </button>
                  </div>
                  <div className="space-y-3">
                    {createForm.items.map((item, idx) => {
                      const sizes = item.productSizes || [];
                      return (
                        <div
                          key={idx}
                          className="flex flex-wrap items-start gap-3 p-3 bg-white rounded-lg border border-gray-200"
                        >
                          {/* Product - Server search */}
                          <div className="flex-1 min-w-[150px]">
                            <label className="block text-xs text-gray-500 mb-0.5">Mahsulot</label>
                            <AsyncSearchSelect
                              fetchUrl={PRODUCTS_URL}
                              dataKey="products"
                              value={item.productId}
                              displayValue={item.productLabel}
                              onSelect={(opt) => handleItemProductSelect(idx, opt)}
                              placeholder="Mahsulot qidirish..."
                              labelKey="name"
                              subLabelKey="category"
                              error={!!createErrors[`item-${idx}-productId`]}
                              emptyText="Mahsulot topilmadi"
                            />
                            {createErrors[`item-${idx}-productId`] && (
                              <p className="text-xs text-red-500 mt-1">{createErrors[`item-${idx}-productId`]}</p>
                            )}
                          </div>

                          {/* Size dropdown */}
                          <div className="flex-1 min-w-[80px]">
                            <label className="block text-xs text-gray-500 mb-0.5">O‘lcham</label>
                            <select
                              value={item.size}
                              onChange={(e) => handleItemSizeChange(idx, e.target.value)}
                              className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white ${createErrors[`item-${idx}-size`] ? 'border-red-400' : 'border-gray-300'
                                }`}
                              disabled={!item.productId}
                            >
                              <option value="">Tanlang</option>
                              {sizes.map((s) => (
                                <option key={s.size} value={s.size}>
                                  {s.size} ({s.total} kg mavjud)
                                </option>
                              ))}
                            </select>
                            {createErrors[`item-${idx}-size`] && (
                              <p className="text-xs text-red-500 mt-1">{createErrors[`item-${idx}-size`]}</p>
                            )}
                          </div>

                          {/* Price (manual) */}
                          <div className="flex-1 min-w-[80px]">
                            <label className="block text-xs text-gray-500 mb-0.5">Narx (kg / $)</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={item.price}
                              onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                              className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none ${createErrors[`item-${idx}-price`] ? 'border-red-400' : 'border-gray-300'
                                }`}
                              placeholder="0.00"
                            />
                            {createErrors[`item-${idx}-price`] && (
                              <p className="text-xs text-red-500 mt-1">{createErrors[`item-${idx}-price`]}</p>
                            )}
                          </div>

                          {/* Quantity */}
                          <div className="flex-1 min-w-[80px]">
                            <label className="block text-xs text-gray-500 mb-0.5">Miqdor (kg)</label>
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={item.quantityKg}
                              onChange={(e) => handleItemChange(idx, 'quantityKg', e.target.value)}
                              className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none ${createErrors[`item-${idx}-quantityKg`] ? 'border-red-400' : 'border-gray-300'
                                }`}
                              placeholder="0.0"
                            />
                            {createErrors[`item-${idx}-quantityKg`] && (
                              <p className="text-xs text-red-500 mt-1">{createErrors[`item-${idx}-quantityKg`]}</p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition self-center mt-4 disabled:opacity-30 disabled:cursor-not-allowed"
                            disabled={createForm.items.length <= 1}
                            title={createForm.items.length <= 1 ? 'Kamida bitta mahsulot qolishi kerak' : 'Olib tashlash'}
                          >
                            <X size={18} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add to debt toggle */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="addToDebt"
                    checked={createForm.addToDebt}
                    onChange={handleCreateChange}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <label className="text-sm text-gray-700">Mijoz qarziga qo‘shish</label>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    disabled={creating}
                    className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium disabled:opacity-50"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    Yaratish
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* 
         GLOBAL MODALS 
         These are placed outside the conditional rendering of List/Detail views 
         so they work in both contexts.
      */}

      {/* Status Update Modal */}
      {statusModalOpen && statusOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
          onClick={closeStatusModal}
        >
          <div
            className="bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeStatusModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
              disabled={statusSaving}
            >
              <X size={24} />
            </button>

            <h2 className="text-2xl font-bold text-gray-900 mb-1">Holatni o‘zgartirish</h2>
            <p className="text-sm text-gray-500 mb-6">
              Buyurtma #{statusOrder._id.slice(-6)} — joriy holat:{' '}
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[statusOrder.status]}`}>
                {STATUS_LABELS[statusOrder.status] || statusOrder.status}
              </span>
            </p>

            <form onSubmit={handleStatusSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Yangi holat</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={closeStatusModal}
                  disabled={statusSaving}
                  className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition text-sm font-medium disabled:opacity-50"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={statusSaving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                >
                  {statusSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Yangilash
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

      {/* Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />
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
  }
`;

// Inject print styles once
if (typeof document !== 'undefined') {
  const existingStyle = document.getElementById('order-print-styles');
  if (!existingStyle) {
    const styleTag = document.createElement('style');
    styleTag.id = 'order-print-styles';
    styleTag.innerHTML = printStyles;
    document.head.appendChild(styleTag);
  }
}