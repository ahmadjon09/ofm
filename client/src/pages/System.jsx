import React, { useState, useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
    Server,
    Database,
    HardDrive,
    Cpu,
    Clock,
    RefreshCw,
    Trash2,
    X,
    AlertCircle,
    AlertTriangle,
    ShieldOff,
    Loader2,
    Layers,
    Wallet,
    Activity,
} from 'lucide-react';

const SYSTEM_URL = '/system/info';

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

// ---------- Danger Confirm Dialog (type-to-confirm) ----------
const DangerDialog = ({ open, module: mod, loading, onConfirm, onCancel }) => {
    const [text, setText] = useState('');

    useEffect(() => {
        if (open) setText('');
    }, [open]);

    if (!open || !mod) return null;
    const matches = text === mod.key;

    return (
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center px-4 bg-black/40 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-red-50 text-red-600 shrink-0">
                        <AlertTriangle size={22} />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">"{mod.label}" modulini tozalash</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{mod.description}</p>
                    </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                    <p className="text-sm text-red-700 font-medium">
                        Bu amalni ortga qaytarib bo'lmaydi! {mod.count} ta yozuv butunlay o'chiriladi.
                    </p>
                </div>

                <label className="block text-sm text-gray-600 mb-2">
                    Tasdiqlash uchun <span className="font-mono font-semibold text-gray-900">{mod.key}</span> deb yozing:
                </label>
                <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={mod.key}
                    autoFocus
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none mb-6"
                />

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        Bekor qilish
                    </button>
                    <button
                        onClick={() => matches && onConfirm(mod)}
                        disabled={!matches || loading}
                        className="px-4 py-2 text-sm font-medium text-white rounded-lg shadow-sm bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading && <Loader2 size={15} className="animate-spin" />}
                        Tozalash
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---------- Info Card ----------
const InfoCard = ({ icon: Icon, label, value, sub, color = 'blue' }) => {
    const colorClasses = {
        blue: 'bg-blue-50 text-blue-600',
        emerald: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        purple: 'bg-purple-50 text-purple-600',
        red: 'bg-red-50 text-red-600',
    };
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition">
            <div className="flex items-center gap-3">
                <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
                    <Icon size={20} />
                </div>
                <div className="min-w-0">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-lg font-bold text-gray-900 truncate">{value}</p>
                    {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
                </div>
            </div>
        </div>
    );
};

// ---------- Helpers ----------
const formatUptime = (seconds = 0) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d} kun ${h} soat`;
    if (h > 0) return `${h} soat ${m} daqiqa`;
    return `${m} daqiqa`;
};

const usageColor = (percent) => {
    if (percent >= 85) return { bar: 'bg-red-500', text: 'text-red-600' };
    if (percent >= 60) return { bar: 'bg-amber-500', text: 'text-amber-600' };
    return { bar: 'bg-emerald-500', text: 'text-emerald-600' };
};

// ---------- Skeleton ----------
const Skeleton = () => (
    <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24" />
            ))}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 h-40" />
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-200 h-40" />
            ))}
        </div>
    </div>
);

// ---------- Main Component ----------
export const System = () => {
    const [confirmModule, setConfirmModule] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }, []);

    useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

    const { data, error, isLoading, isValidating, mutate } = useSWR(
        SYSTEM_URL,
        (url) => api.get(url).then((res) => res.data),
        { revalidateOnFocus: false, refreshInterval: 60000 }
    );

    const info = data?.data || {};
    const db = info.database || {};
    const server = info.server || {};
    const modules = info.modules || [];

    const percent = db.usedPercent || 0;
    const colors = usageColor(percent);

    const handleClearModule = async (mod) => {
        setDeleting(true);
        try {
            const res = await api.delete(`/system/modules/${mod.key}`, {
                data: { confirm: mod.key },
            });
            showToast(res.data?.message || `"${mod.label}" moduli tozalandi.`, 'success');
            setConfirmModule(null);
            await mutate();
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Amalni bajarib bo‘lmadi.', 'error');
        } finally {
            setDeleting(false);
        }
    };

    // ---------- Render ----------
    if (error) {
        return (
            <div className="min-h-screen font-sans">
                <div className="mx-auto px-4 sm:px-6 py-6">
                    <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-16 px-4 text-center">
                        <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                        <p className="text-gray-700 font-medium mb-1">Tizim ma'lumotlarini yuklab bo'lmadi</p>
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
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans">
            <div className="mx-auto px-4 sm:px-6 py-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <Server className="text-blue-600" size={28} />
                            Tizim boshqaruvi
                        </h1>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Ma'lumotlar bazasi holati va modullarni boshqarish
                        </p>
                    </div>
                    <button
                        onClick={() => mutate()}
                        disabled={isValidating}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition self-start sm:self-auto disabled:opacity-60"
                    >
                        <RefreshCw size={16} className={isValidating ? 'animate-spin' : ''} />
                        Yangilash
                    </button>
                </div>

                {isLoading ? (
                    <Skeleton />
                ) : (
                    <>
                        {/* Info cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                            <InfoCard
                                icon={Activity}
                                label="Server holati"
                                value={db.connected ? 'Ishlamoqda' : 'Ulanmagan'}
                                sub={`Muhit: ${server.env || '—'}`}
                                color={db.connected ? 'emerald' : 'red'}
                            />
                            <InfoCard
                                icon={Clock}
                                label="Ish vaqti (uptime)"
                                value={formatUptime(server.uptimeSeconds)}
                                sub={`Node ${server.nodeVersion || ''}`}
                                color="blue"
                            />
                            <InfoCard
                                icon={Cpu}
                                label="Xotira (RAM)"
                                value={server.memoryRss || '—'}
                                sub={`Heap: ${server.heapUsed || '—'}`}
                                color="purple"
                            />
                            <InfoCard
                                icon={Wallet}
                                label="Kassa balansi"
                                value={`${(info.kassaBalance || 0).toLocaleString()} so'm`}
                                sub={`${server.platform || ''}`}
                                color="amber"
                            />
                        </div>

                        {/* DB usage */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm mb-6">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                                    <Database className="text-blue-600" size={20} />
                                    Ma'lumotlar bazasi
                                    <span className="text-xs font-normal text-gray-400">({db.name || '—'})</span>
                                </h2>
                                <span className={`text-2xl font-bold ${colors.text}`}>{percent}%</span>
                            </div>

                            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                                    style={{ width: `${Math.max(percent, 1)}%` }}
                                />
                            </div>
                            <p className="text-sm text-gray-500 mb-5">
                                {db.dataSize || '0 B'} / {db.quota || '—'} ishlatilgan
                                {percent >= 85 && (
                                    <span className="ml-2 text-red-600 font-medium">— Baza to'lishga yaqin!</span>
                                )}
                            </p>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                                        <HardDrive size={13} /> Diskdagi hajm
                                    </p>
                                    <p className="font-semibold text-gray-900">{db.storageSize || '—'}</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                                        <Layers size={13} /> Kolleksiyalar
                                    </p>
                                    <p className="font-semibold text-gray-900">{db.collections || 0} ta</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                                        <Database size={13} /> Hujjatlar soni
                                    </p>
                                    <p className="font-semibold text-gray-900">{(db.objects || 0).toLocaleString()} ta</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5">
                                        <HardDrive size={13} /> Indekslar hajmi
                                    </p>
                                    <p className="font-semibold text-gray-900">{db.indexSize || '—'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Modules */}
                        <div className="mb-3 flex items-center gap-2">
                            <h2 className="text-lg font-semibold text-gray-900">Baza modullari</h2>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-medium">
                                Xavfli hudud
                            </span>
                        </div>
                        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {modules.map((mod) => (
                                <div
                                    key={mod.key}
                                    className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition flex flex-col"
                                >
                                    <div className="flex items-start justify-between mb-3">
                                        <div>
                                            <h3 className="font-semibold text-gray-900">{mod.label}</h3>
                                            <p className="text-xs text-gray-400 font-mono">{mod.key}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-gray-900">{(mod.count || 0).toLocaleString()}</p>
                                            <p className="text-xs text-gray-400">{mod.size}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-500 flex-1 mb-4">{mod.description}</p>
                                    {mod.deletable ? (
                                        <button
                                            onClick={() => setConfirmModule(mod)}
                                            disabled={!mod.count}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <Trash2 size={15} />
                                            Modulni tozalash
                                        </button>
                                    ) : (
                                        <div className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-400 border border-gray-200 rounded-lg bg-gray-50 cursor-not-allowed">
                                            <ShieldOff size={15} />
                                            O'chirish taqiqlangan
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <DangerDialog
                open={!!confirmModule}
                module={confirmModule}
                loading={deleting}
                onConfirm={handleClearModule}
                onCancel={() => !deleting && setConfirmModule(null)}
            />
            <Toast toast={toast} onClose={() => setToast(null)} />
        </div>
    );
};
