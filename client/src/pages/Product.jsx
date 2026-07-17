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
  Box,
  Loader2,
  AlertCircle,
  Package,
  Tag,
  Ruler,
  DollarSign,
  ArrowLeft,
  Eye,
  Layers, // Icon for boxes
} from 'lucide-react';

// ---------- Constants ----------
const CATEGORIES = [
  "Melkiy",
  "Krupniy",
  "Ostriy",
  "Parma",
  "Sink",
  "Tom ranglik",
  "Ostriy ranglik",
  "Metal",
  "Chupik",
  "Akfa",
  "Polvon",
  "Universal"
];
const PRODUCTS_URL = '/products';
const SORT_OPTIONS = [
  { value: 'newest', label: 'Yangi qo‘shilgan' },
  { value: 'oldest', label: 'Eski qo‘shilgan' },
  { value: 'name', label: 'Nomi bo‘yicha' },
];
const emptySize = () => ({ size: '', price: '', boxes: '', box_kg: '' });

// ---------- Custom Hook: Arrow Key Navigation ----------
// This hook allows moving focus between inputs using Left/Right arrows
const useArrowKeyNavigation = (modalOpen) => {
  useEffect(() => {
    if (!modalOpen) return;

    const handleKeyDown = (e) => {
      // Only trigger on Left/Right arrows
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      // Ignore if modifier keys are pressed (e.g., Alt+Left for browser back)
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const activeElement = document.activeElement;

      // Check if the active element is an input within our modal
      // We assume inputs in the modal have a specific data attribute or class, 
      // or we just check if they are inside the modal container.
      // Here we check if it's an input/textarea/select
      if (!activeElement || !['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName)) {
        return;
      }

      // Find all focusable elements in the form/modal
      // We look for inputs specifically to avoid focusing buttons accidentally during data entry
      const form = activeElement.closest('form');
      if (!form) return;

      const focusableInputs = Array.from(form.querySelectorAll('input, select, textarea'));
      const currentIndex = focusableInputs.indexOf(activeElement);

      if (currentIndex === -1) return;

      let nextIndex;
      if (e.key === 'ArrowRight') {
        nextIndex = currentIndex + 1;
      } else {
        nextIndex = currentIndex - 1;
      }

      // Wrap around or stop at edges? Let's stop at edges for better UX in forms
      if (nextIndex >= 0 && nextIndex < focusableInputs.length) {
        e.preventDefault(); // Prevent cursor movement inside text if desired, or just move focus
        focusableInputs[nextIndex].focus();
        // Optional: Select all text in the new input for quick replacement
        // focusableInputs[nextIndex].select(); 
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);
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
        <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-32" /></td>
        <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-20" /></td>
        <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-48" /></td>
        <td className="px-4 py-4"><div className="h-4 bg-gray-200 rounded w-16 ml-auto" /></td>
      </tr>
    ))}
  </>
);

// ---------- Stat Card ----------
const StatCard = ({ icon: Icon, label, value, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm ${className}`}>
    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
      <Icon size={18} />
    </div>
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  </div>
);

// ============================================================
// MAIN COMPONENT
// ============================================================
export const Product = () => {
  // ---------- List state ----------
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const limit = 10;

  // ---------- Detail state ----------
  const [selectedProduct, setSelectedProduct] = useState(null); // product object, not just id

  // ---------- Modal state ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [form, setForm] = useState({ name: '', category: '', sizes: [emptySize()] });

  // Initialize arrow key navigation when modal opens
  useArrowKeyNavigation(modalOpen);

  // ---------- Confirm & Toast ----------
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

  // ---------- Build query for list ----------
  const buildQuery = useCallback(() => {
    const params = new URLSearchParams({ page, limit, sort });
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    return params.toString();
  }, [page, limit, sort, search, category]);

  // ---------- SWR for list ----------
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate: mutateList,
  } = useSWR(
    `${PRODUCTS_URL}?${buildQuery()}`,
    (url) => api.get(url).then((res) => res.data),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const products = data?.data?.products || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };
  const totalPages = Math.max(meta.totalPages || 1, 1);

  // ---------- List handlers ----------
  const handleCategoryChange = (e) => {
    setCategory(e.target.value);
    setPage(1);
  };
  const handleSortChange = (e) => {
    setSort(e.target.value);
    setPage(1);
  };
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
    setSort('newest');
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

  // Close modal on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && modalOpen && !saving) setModalOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [modalOpen, saving]);

  // ---------- Modal helpers ----------
  const openCreateModal = () => {
    setEditingProduct(null);
    setForm({ name: '', category: '', sizes: [emptySize()] });
    setFormErrors({});
    setModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      category: product.category,
      sizes: product.sizes.map((s) => ({
        _id: s._id,
        size: s.size,
        price: s.price,
        boxes: s.boxes,
        box_kg: s.box_kg,
      })),
    });
    setFormErrors({});
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const handleFormChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setFormErrors((prev) => ({ ...prev, [e.target.name]: undefined }));
  };

  const handleSizeChange = (index, field, value) => {
    const newSizes = [...form.sizes];
    newSizes[index][field] = value;

    setForm({
      ...form,
      sizes: newSizes,
    });

    setFormErrors((prev) => ({
      ...prev,
      [`size-${index}-${field}`]: undefined,
    }));
  };

  const addSizeRow = () => {
    setForm({
      ...form,
      sizes: [...form.sizes, emptySize()],
    });
  };

  const removeSizeRow = (index) => {
    if (form.sizes.length <= 1) return;

    setForm({
      ...form,
      sizes: form.sizes.filter((_, i) => i !== index),
    });
  };

  const validateForm = () => {
    const errors = {};

    if (!form.name.trim()) {
      errors.name = 'Mahsulot nomi majburiy.';
    }

    if (!form.category.trim()) {
      errors.category = 'Kategoriya tanlanishi shart.';
    }

    form.sizes.forEach((s, i) => {
      ['size', 'price', 'boxes', 'box_kg'].forEach((field) => {
        const value = Number(s[field]);

        if (s[field] === '' || s[field] === null || s[field] === undefined) {
          errors[`size-${i}-${field}`] = 'Majburiy';
        } else if (Number.isNaN(value)) {
          errors[`size-${i}-${field}`] = 'Faqat son kiriting';
        } else if (value < 0) {
          errors[`size-${i}-${field}`] = '0 yoki undan katta bo‘lishi kerak';
        }
      });
    });

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
    const payload = {
      name: form.name.trim(),
      category: form.category,
      sizes: form.sizes.map((s) => ({
        size: Number(s.size),
        price: Number(s.price),
        boxes: Number(s.boxes),
        box_kg: Number(s.box_kg),
      })),
    };
    setSaving(true);
    try {
      if (editingProduct) {
        await api.put(`${PRODUCTS_URL}/${editingProduct._id}`, payload);
        showToast('Mahsulot yangilandi.', 'success');
        // Update selected product if it is the one being edited
        if (selectedProduct && selectedProduct._id === editingProduct._id) {
          const updated = { ...selectedProduct, ...payload };
          setSelectedProduct(updated);
        }
      } else {
        await api.post(PRODUCTS_URL, payload);
        showToast('Mahsulot yaratildi.', 'success');
      }
      await mutateList();
      setModalOpen(false);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteProduct = (product) =>
    setConfirmState({ type: 'delete-product', payload: product });
  const requestRestoreProduct = (product) =>
    setConfirmState({ type: 'restore', payload: product });

  const handleConfirm = async () => {
    if (!confirmState) return;
    const { type, payload } = confirmState;
    try {
      if (type === 'delete-product') {
        await api.delete(`${PRODUCTS_URL}/${payload._id}`);
        showToast('Mahsulot o‘chirildi.', 'success');
        if (selectedProduct && selectedProduct._id === payload._id) {
          setSelectedProduct(null); // close detail if deleted
        }
      } else if (type === 'restore') {
        await api.patch(`${PRODUCTS_URL}/${payload._id}/restore`);
        showToast('Mahsulot tiklandi.', 'success');
        if (selectedProduct && selectedProduct._id === payload._id) {
          setSelectedProduct({ ...selectedProduct, isDeleted: false });
        }
      }
      await mutateList();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Amalni bajarib bo‘lmadi.', 'error');
    } finally {
      setConfirmState(null);
    }
  };

  const confirmCopy = {
    'delete-product': {
      title: 'Mahsulotni o‘chirish',
      message: (p) => `“${p.name}” mahsulotini o‘chirishni tasdiqlaysizmi?`,
      confirmLabel: 'O‘chirish',
      danger: true,
    },
    restore: {
      title: 'Mahsulotni tiklash',
      message: (p) => `“${p.name}” mahsulotini tiklashni tasdiqlaysizmi?`,
      confirmLabel: 'Tiklash',
      danger: false,
    },
  };

  // ---------- Navigate to detail ----------
  const goToDetail = (product) => {
    setSelectedProduct(product);
  };

  const goToList = () => {
    setSelectedProduct(null);
  };

  // ============================================================
  // RENDER: DETAIL VIEW (uses selectedProduct from list)
  // ============================================================
  if (selectedProduct) {
    const product = selectedProduct;
    const totalKg = product.sizes.reduce((acc, s) => acc + (s.total || 0), 0);
    const totalPrice = product.sizes.reduce((acc, s) => acc + (s.total || 0) * s.price, 0);
    const totalBoxes = product.sizes.reduce((acc, s) => acc + (Number(s.boxes) || 0), 0);
    const isDeleted = product.isDeleted;

    return (
      <div className="min-h-screen py-6 px-4 sm:px-6">
        <div className="mx-auto animate-in slide-in-from-left-4 duration-300">
          <button
            onClick={goToList}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition"
          >
            <ArrowLeft size={18} /> Mahsulotlar ro‘yxati
          </button>

          <div className="bg-white rounded-2xl shadow-md border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 border-b border-gray-200 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  <Package className="text-blue-600" size={28} />
                  {product.name}
                </h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                    <Tag size={14} />
                    {product.category}
                  </span>
                  {isDeleted && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600">
                      <Trash2 size={14} />
                      O‘chirilgan
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    Qo‘shilgan: {new Date(product.createdAt).toLocaleDateString('uz-UZ')}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                {isDeleted ? (
                  <button
                    onClick={() => requestRestoreProduct(product)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                  >
                    <RotateCw size={16} /> Tiklash
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setSelectedProduct(null); openEditModal(product); }}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                    >
                      <Pencil size={16} /> Tahrirlash
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-6 border-b border-gray-200">
              <StatCard icon={Box} label="Jami vazn (kg)" value={`${totalKg.toLocaleString()} kg`} />
              <StatCard icon={Layers} label="Jami qutilar" value={`${totalBoxes.toLocaleString()} ta`} />
              <StatCard icon={DollarSign} label="Umumiy narx" value={`${totalPrice.toLocaleString()} $`} />
              <StatCard icon={Ruler} label="O‘lchamlar soni" value={product.sizes.length} />
            </div>

            {/* Sizes table with "Umumiy narx" (total price per size) */}
            <div className="p-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                O‘lchamlar ({product.sizes.length})
              </h3>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">O‘lcham</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Qutilar soni</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Quti kg</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Jami (kg)</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Narx (kg / $)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Umumiy narx ($)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {product.sizes.map((size) => {
                      const subtotal = (size.total || 0) * size.price;
                      return (
                        <tr key={size._id} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-medium text-gray-800">{size.size}</td>
                          <td className="px-4 py-3 text-gray-600">{size.boxes}</td>
                          <td className="px-4 py-3 text-gray-600">{size.box_kg}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-800">
                            {size.total?.toLocaleString() || 0}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{size.price}</td>
                          <td className="px-4 py-3 text-right font-medium text-emerald-700">
                            {subtotal.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold border-t-2 border-gray-200 bg-gray-50">
                      <td colSpan="4" className="px-4 py-3 text-right text-gray-700">Jami:</td>
                      <td className="px-4 py-3 text-right text-gray-900">{totalKg.toLocaleString()} kg</td>
                      <td className="px-4 py-3 text-right text-emerald-700">{totalPrice.toLocaleString()} $</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 text-xs text-gray-400 flex flex-wrap justify-between gap-2">
              <span>ID: {product._id}</span>
              <span>Version: {product.version || 0}</span>
              <span>Yangilangan: {new Date(product.updatedAt).toLocaleString('uz-UZ')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER: LIST VIEW
  // ============================================================
  return (
    <div className="min-h-screen font-sans">
      <div className="mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Mahsulotlar</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {meta.total ? `Jami ${meta.total} ta mahsulot` : 'Mahsulotlarni boshqarish'}
            </p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto"
          >
            <Plus size={18} /> Yangi mahsulot
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Mahsulot nomi bo‘yicha qidirish..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <select
            value={category}
            onChange={handleCategoryChange}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            <option value="">Barcha kategoriyalar</option>
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={sort}
            onChange={handleSortChange}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {(search || category || sort !== 'newest') && (
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
              <p className="text-gray-700 font-medium mb-1">Mahsulotlarni yuklab bo‘lmadi</p>
              <p className="text-sm text-gray-500 mb-4">
                {error.response?.data?.message || 'Server bilan bog‘lanishda xatolik yuz berdi.'}
              </p>
              <button
                onClick={() => mutateList()}
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
                    <th className="px-4 py-3 font-medium">Nomi</th>
                    <th className="px-4 py-3 font-medium">Kategoriya</th>
                    <th className="px-4 py-3 font-medium">O‘lchamlar</th>
                    <th className="px-4 py-3 font-medium text-right">Amallar</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && !data ? (
                    <SkeletonRows rows={limit} />
                  ) : products.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-16 text-center">
                        <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-600 font-medium mb-1">Mahsulot topilmadi</p>
                        <p className="text-sm text-gray-400 mb-4">
                          {search || category ? 'Qidiruv shartlariga mos mahsulot yo‘q.' : 'Hali birorta mahsulot qo‘shilmagan.'}
                        </p>
                        {!search && !category && (
                          <button
                            onClick={openCreateModal}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          >
                            <Plus size={16} /> Birinchi mahsulotni qo‘shish
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr
                        key={product._id}
                        className={`border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition align-top ${product.isDeleted ? 'opacity-50' : ''}`}
                      >
                        <td
                          className="px-4 py-4 cursor-pointer"
                          onClick={() => goToDetail(product)}
                        >
                          <div className="font-medium text-gray-900 hover:text-blue-600 transition">
                            {product.name}
                          </div>
                          {product.isDeleted && (
                            <span className="inline-flex items-center gap-1 mt-1 text-xs text-red-500">
                              <Trash2 size={12} /> O‘chirilgan
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {product.category}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5 max-w-xs">
                            {product.sizes.map((s) => (
                              <span
                                key={s._id}
                                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs bg-gray-100 text-gray-700"
                                title={`Narx: $${s.price} · Quti: ${s.boxes} × ${s.box_kg}kg`}
                              >
                                {s.size}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end gap-1">
                            {product.isDeleted ? (
                              <button
                                onClick={() => requestRestoreProduct(product)}
                                className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title="Tiklash"
                              >
                                <RotateCw size={18} />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => openEditModal(product)}
                                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                  title="Tahrirlash"
                                >
                                  <Pencil size={18} />
                                </button>
                                <button
                                  onClick={() => goToDetail(product)}
                                  className="p-2 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition"
                                  title="Ko'rish"
                                >
                                  <Eye size={18} />
                                </button>
                                <button
                                  onClick={() => requestDeleteProduct(product)}
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
          {!error && products.length > 0 && (
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

        {/* ====== Create / Edit Modal ====== */}
        {modalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
            onClick={closeModal}
          >
            <div
              className="bg-white w-full max-w-2xl rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6 relative"
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
                {editingProduct ? 'Mahsulotni tahrirlash' : 'Yangi mahsulot qo‘shish'}
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                {editingProduct ? 'Ma’lumotlarni o‘zgartiring va saqlang.' : 'Barcha maydonlarni to‘ldiring.'}
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mahsulot nomi *
                  </label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Kategoriya *
                  </label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleFormChange}
                    className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white ${formErrors.category ? 'border-red-400' : 'border-gray-300 focus:border-blue-500'
                      }`}
                  >
                    <option value="">Kategoriya tanlang</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {formErrors.category && <p className="text-xs text-red-500 mt-1">{formErrors.category}</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">O‘lchamlar *</label>
                    <button
                      type="button"
                      onClick={addSizeRow}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <Plus size={16} /> Qo‘shish
                    </button>
                  </div>
                  <div className="space-y-3">
                    {form.sizes.map((size, idx) => (
                      <div
                        key={size._id || idx}
                        className="flex flex-wrap items-start gap-3 p-3 rounded-lg border border-gray-200"
                      >
                        <div className="flex-1 min-w-[70px]">
                          <label className="block text-xs text-gray-500 mb-0.5">Razmer</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={size.size}
                            onChange={(e) => handleSizeChange(idx, 'size', e.target.value)}
                            className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none ${formErrors[`size-${idx}-size`] ? 'border-red-400' : 'border-gray-300'
                              }`}
                          />
                        </div>
                        <div className="flex-1 min-w-[70px]">
                          <label className="block text-xs text-gray-500 mb-0.5">Narx ($)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={size.price}
                            onChange={(e) => handleSizeChange(idx, 'price', e.target.value)}
                            className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none ${formErrors[`size-${idx}-price`] ? 'border-red-400' : 'border-gray-300'
                              }`}
                          />
                        </div>
                        <div className="flex-1 min-w-[70px]">
                          <label className="block text-xs text-gray-500 mb-0.5">Qutilar soni</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={size.boxes}
                            onChange={(e) => handleSizeChange(idx, 'boxes', e.target.value)}
                            className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none ${formErrors[`size-${idx}-boxes`] ? 'border-red-400' : 'border-gray-300'
                              }`}
                          />
                        </div>
                        <div className="flex-1 min-w-[70px]">
                          <label className="block text-xs text-gray-500 mb-0.5">Quti kg</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={size.box_kg}
                            onChange={(e) => handleSizeChange(idx, 'box_kg', e.target.value)}
                            className={`w-full px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none ${formErrors[`size-${idx}-box_kg`] ? 'border-red-400' : 'border-gray-300'
                              }`}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSizeRow(idx)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition self-center mt-4 disabled:opacity-30 disabled:cursor-not-allowed"
                          disabled={form.sizes.length <= 1}
                          title={form.sizes.length <= 1 ? 'Kamida bitta o‘lcham qolishi kerak' : 'O‘lchamni olib tashlash'}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={saving}
                    className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingProduct ? 'Yangilash' : 'Yaratish'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ====== Confirm dialog ====== */}
        <ConfirmDialog
          open={!!confirmState}
          title={confirmState ? confirmCopy[confirmState.type].title : ''}
          message={confirmState ? confirmCopy[confirmState.type].message(confirmState.payload) : ''}
          confirmLabel={confirmState ? confirmCopy[confirmState.type].confirmLabel : ''}
          danger={confirmState ? confirmCopy[confirmState.type].danger : true}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmState(null)}
        />

        {/* ====== Toast ====== */}
        <Toast toast={toast} onClose={() => setToast(null)} />
      </div>
    </div>
  );
};