import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import api from '../middlewares/fetcher';
import {
    Package,
    Users,
    ShoppingCart,
    DollarSign,
    TrendingUp,
    Clock,
    AlertCircle,
    Loader2,
    Wallet,
    Box,
    Calendar,
    ArrowUp,
    ArrowDown,
    FileText,
    Download,
    X,
    Printer,
    FileSpreadsheet,
    RefreshCw,
    Info,
    ChevronRight,
    CheckCircle2,
    CalendarRange,
    Coins,
    Weight,
    ChartColumn as ChartColumnIcon,
    ChartLine as ChartLineIcon,
    ChartPie as ChartPieIcon,
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import {
    UZ_MONTHS,
    formatDateRangeLabel,
    rangeForPreset,
    startOfMonthKey,
    todayKey,
} from '../lib/period';

const DASHBOARD_URL = '/dashboard/stats';
// Backend report endpointlari (server.js dagi routes ga mos)
const REPORTS_BASE_URL = '/reports';

const COLORS = ['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

const STATUS_META = {
    pending: { label: 'Kutilmoqda', className: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'Bajarilgan', className: 'bg-green-100 text-green-700' },
    cancelled: { label: 'Bekor qilingan', className: 'bg-red-100 text-red-700' },
};

const money = (value) => `${Number(value || 0).toLocaleString()} $`;
const number = (value) => Number(value || 0).toLocaleString();

// ============================================================
// Kichik UI bo'laklari
// ============================================================

/** "?" belgisi — hover/focus da oddiy tilda tushuntirish beradi. */
const InfoHint = ({ text }) => {
    if (!text) return null;
    return (
        <span className="group relative inline-flex items-center align-middle">
            <span
                tabIndex={0}
                role="button"
                aria-label={text}
                className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-300 text-[10px] font-bold text-gray-400 transition group-hover:border-blue-400 group-hover:text-blue-500"
            >
                ?
            </span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-normal leading-snug text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                {text}
            </span>
        </span>
    );
};

const GrowthBadge = ({ percent, hint }) => {
    if (percent === null || percent === undefined) return null;
    const positive = percent >= 0;
    return (
        <span
            title={hint || undefined}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} `}
        >
            {positive ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
            {Math.abs(percent).toLocaleString()}%
        </span>
    );
};

const TONES = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-rose-50 text-rose-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    yellow: 'bg-amber-50 text-amber-600',
};

/** Asosiy metrika kartochkasi — har doim "qaysi davr uchun" ekani yozilgan. */
const StatCard = ({ icon: Icon, label, value, periodText, hint, tone = 'blue', growth, growthHint }) => (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
            <div className={`rounded-xl p-2.5 ${TONES[tone] || TONES.blue}`}>
                <Icon size={20} />
            </div>
            <GrowthBadge percent={growth} hint={growthHint} />
        </div>
        <div className="mt-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-500">
                {label}
                <InfoHint text={hint} />
            </p>
            <p className="mt-0.5 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
            {periodText && (
                <p className="mt-1 text-[11px] font-medium text-gray-400">{periodText}</p>
            )}
        </div>
    </div>
);

const SectionHeader = ({ title, description, icon: Icon, tone = 'gray' }) => (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
            {Icon && (
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone === 'gray' ? 'bg-gray-100 text-gray-500' : TONES[tone]}`}>
                    <Icon size={15} />
                </span>
            )}
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{title}</h2>
        </div>
        {description && <p className="text-xs text-gray-400 sm:text-right">{description}</p>}
    </div>
);

const ChartCard = ({ title, subtitle, children, className = '' }) => (
    <div className={`rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}>
        <div className="mb-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>}
        </div>
        {children}
    </div>
);

const ChartEmpty = ({ icon: Icon, text }) => (
    <div className="flex h-64 flex-col items-center justify-center gap-2 rounded-lg text-gray-400">
        <Icon size={44} className="opacity-20" />
        <p className="text-sm">{text}</p>
    </div>
);

const moneyTooltip = {
    formatter: (value) => [money(value), 'Tushum'],
    contentStyle: { borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
};

// ============================================================
// DAVR TANLAGICHI — "Shu oy / O'tgan oy / Barcha vaqt / Sana"
// ============================================================
const PeriodSelector = ({
    activeMode,
    onSelectPreset,
    customOpen,
    onToggleCustom,
    draftStart,
    setDraftStart,
    draftEnd,
    setDraftEnd,
    onApplyCustom,
    onCancelCustom,
    error,
    rangeLabel,
    isRefreshing,
    onRefresh,
}) => (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                    <CalendarRange size={16} className="text-blue-600" />
                    <p className="text-sm font-semibold text-gray-800">Qaysi davr uchun ko‘rsataylik?</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { id: 'current-month', label: 'Shu oy', hint: 'Oyning 1-kunidan bugungacha' },
                        { id: 'previous-month', label: "O'tgan oy", hint: "O'tgan oyning to'liq davri" },
                        { id: 'all', label: 'Barcha vaqt', hint: 'Butun tarix' },
                    ].map((preset) => {
                        const isActive = activeMode === preset.id;
                        return (
                            <button
                                key={preset.id}
                                type="button"
                                title={preset.hint}
                                onClick={() => onSelectPreset(preset.id)}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                                    isActive
                                        ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                                        : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                                }`}
                            >
                                {isActive && <CheckCircle2 size={14} />}
                                {preset.label}
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        onClick={onToggleCustom}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition ${
                            activeMode === 'custom' || customOpen
                                ? 'border-blue-300 bg-blue-50 text-blue-700'
                                : 'border-dashed border-gray-300 bg-white text-gray-500 hover:border-blue-300 hover:text-blue-700'
                        }`}
                    >
                        <Calendar size={14} />
                        Sana bo‘yicha
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400">Ko‘rsatilayotgan davr</p>
                    <p className="text-sm font-semibold text-gray-800">{rangeLabel}</p>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={isRefreshing}
                    title="Ma'lumotlarni yangilash"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:opacity-60"
                >
                    <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                    Yangilash
                </button>
            </div>
        </div>

        {customOpen && (
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1 text-xs font-medium text-gray-600">
                        Boshlanish sanasi
                        <input
                            type="date"
                            value={draftStart}
                            max={draftEnd || undefined}
                            onChange={(event) => setDraftStart(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                    </label>
                    <label className="flex-1 text-xs font-medium text-gray-600">
                        Tugash sanasi
                        <input
                            type="date"
                            value={draftEnd}
                            min={draftStart || undefined}
                            onChange={(event) => setDraftEnd(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={onApplyCustom}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                        >
                            Qo‘llash
                        </button>
                        <button
                            type="button"
                            onClick={onCancelCustom}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
                        >
                            Bekor qilish
                        </button>
                    </div>
                </div>
                {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
            </div>
        )}
    </div>
);

// ============================================================
// HISOBOT YUKLAB OLISH (Excel / PDF)
// ============================================================
const ExportModal = ({ isOpen, onClose }) => {
    const now = new Date();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        type: 'summary',
        format: 'excel',
        month: now.getMonth() + 1,
        year: now.getFullYear(),
    });

    if (!isOpen) return null;

    const handleDownload = async () => {
        setLoading(true);
        try {
            let endpoint = `${REPORTS_BASE_URL}/summary`;
            if (formData.type === 'orders') endpoint = `${REPORTS_BASE_URL}/orders`;
            else if (formData.type === 'stock') endpoint = `${REPORTS_BASE_URL}/stock`;
            else if (formData.type === 'debts') endpoint = `${REPORTS_BASE_URL}/debts`;

            const params = new URLSearchParams({
                format: formData.format,
                month: formData.month,
                year: formData.year,
            });

            const response = await api.get(`${endpoint}?${params.toString()}`, {
                responseType: 'blob',
            });

            const dateStr = `${formData.year}-${String(formData.month).padStart(2, '0')}`;
            const extension = formData.format === 'pdf' ? 'pdf' : 'xlsx';
            const filename = `hisobot_${formData.type}_${dateStr}.${extension}`;

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            onClose();
        } catch (error) {
            console.error('Export error:', error);
            alert('Hisobotni yuklab olishda xatolik yuz berdi.');
        } finally {
            setLoading(false);
        }
    };

    const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="flex items-center gap-2">
                        <Download className="h-5 w-5 text-blue-600" />
                        <h2 className="text-lg font-bold text-gray-900">Hisobot yuklab olish</h2>
                    </div>
                    <button onClick={onClose} className="rounded-full p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-5 p-6">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Hisobot turi</label>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'summary', label: 'Umumiy', icon: FileText },
                                { id: 'orders', label: 'Buyurtmalar', icon: ShoppingCart },
                                { id: 'stock', label: 'Ombor', icon: Box },
                                { id: 'debts', label: 'Qarzlar', icon: Wallet },
                            ].map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setFormData({ ...formData, type: item.id })}
                                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition ${
                                        formData.type === item.id
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                    }`}
                                >
                                    <item.icon size={16} />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Oy</label>
                            <select
                                value={formData.month}
                                onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {UZ_MONTHS.map((name, index) => (
                                    <option key={name} value={index + 1}>
                                        {name.charAt(0).toUpperCase() + name.slice(1)}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-700">Yil</label>
                            <select
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                {years.map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Fayl formati</label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setFormData({ ...formData, format: 'excel' })}
                                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 transition ${
                                    formData.format === 'excel'
                                        ? 'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-500'
                                        : 'border-gray-200 text-gray-600'
                                }`}
                            >
                                <FileSpreadsheet size={18} />
                                Excel (.xlsx)
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, format: 'pdf' })}
                                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border p-3 transition ${
                                    formData.format === 'pdf'
                                        ? 'border-red-500 bg-red-50 text-red-700 ring-1 ring-red-500'
                                        : 'border-gray-200 text-gray-600'
                                }`}
                            >
                                <Printer size={18} />
                                PDF
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        Bekor qilish
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-70"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Yuklanmoqda...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4" />
                                Yuklab olish
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================
// DASHBOARD
// ============================================================
export const Dashboard = () => {
    const navigate = useNavigate();
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Davr holati: standart — JORIY OY.
    const [preset, setPreset] = useState('current-month');
    const [appliedCustom, setAppliedCustom] = useState(null);
    const [customOpen, setCustomOpen] = useState(false);
    const [draftStart, setDraftStart] = useState(() => startOfMonthKey());
    const [draftEnd, setDraftEnd] = useState(() => todayKey());
    const [customError, setCustomError] = useState('');

    const activeMode = appliedCustom ? 'custom' : preset;

    // Kassa balansi — balans ko'rsatkichi (davrga bog'liq emas),
    // shu sababli alohida endpointdan olinadi.
    const { data: kassaData } = useSWR(
        '/kassa',
        (url) => api.get(url).then((res) => res.data),
        { revalidateOnFocus: false, refreshInterval: 120000 }
    );
    const kassaBalance = kassaData?.data?.balance ?? null;

    const dashboardUrl = useMemo(() => {
        const params = new URLSearchParams();

        if (activeMode === 'all') {
            params.set('range', 'all');
        } else if (activeMode === 'custom' && appliedCustom) {
            params.set('range', 'custom');
            params.set('startDate', appliedCustom.startDate);
            params.set('endDate', appliedCustom.endDate);
        } else {
            // Preset: startDate/endDate ni ham yuboramiz (so'rov o'z-o'zini izohlaydi),
            // lekin chegaralarni server biznes vaqt mintaqasi bo'yicha o'zi hisoblaydi.
            const presetRange = rangeForPreset(activeMode);
            params.set('range', activeMode);
            params.set('startDate', presetRange.startDate);
            params.set('endDate', presetRange.endDate);
        }

        return `${DASHBOARD_URL}?${params.toString()}`;
    }, [activeMode, appliedCustom]);

    const { data, error, isLoading, isValidating, mutate } = useSWR(
        dashboardUrl,
        (url) => api.get(url).then((res) => res.data),
        { keepPreviousData: true, revalidateOnFocus: false, refreshInterval: 120000 }
    );

    const stats = data?.data || {};
    const range = stats.range || null;
    const period = stats.period || {};
    const stock = stats.stock || {};
    const debts = stats.debts || {};
    const today = stats.today || {};
    const growth = stats.growth || {};
    const charts = stats.charts || {};

    const {
        monthlyRevenueTrend = [],
        dailyRevenueTrend = [],
        orderStatusChart = [],
        topClientsByDebt = [],
        daily: dailyChart = {},
    } = charts;
    const topProducts = stats.topProducts || [];
    const latestOrders = stats.latestOrders || [];

    const handleSelectPreset = (id) => {
        setPreset(id);
        setAppliedCustom(null);
        setCustomOpen(false);
        setCustomError('');
    };

    const handleApplyCustom = () => {
        if (!draftStart || !draftEnd) {
            setCustomError('Ikkala sanani ham tanlang.');
            return;
        }
        if (draftStart > draftEnd) {
            setCustomError('Boshlanish sanasi tugash sanasidan keyin bo‘lishi mumkin emas.');
            return;
        }
        setCustomError('');
        setAppliedCustom({ startDate: draftStart, endDate: draftEnd });
        setCustomOpen(false);
    };

    const handleCancelCustom = () => {
        setCustomOpen(false);
        setCustomError('');
        // Agar avval tanlangan davr bo'lsa — uni saqlab qolamiz, aks holda «Shu oy»ga qaytamiz.
        if (!appliedCustom) setPreset('current-month');
    };

    const handleOpenCustom = () => {
        if (activeMode !== 'custom') {
            setDraftStart(startOfMonthKey());
            setDraftEnd(todayKey());
        } else if (appliedCustom) {
            setDraftStart(appliedCustom.startDate);
            setDraftEnd(appliedCustom.endDate);
        }
        setCustomOpen((prev) => !prev);
        setCustomError('');
    };

    const rangeLabel = range?.label
        || (activeMode === 'custom' && appliedCustom
            ? formatDateRangeLabel(appliedCustom.startDate, appliedCustom.endDate)
            : activeMode === 'all'
                ? 'Barcha vaqt'
                : activeMode === 'previous-month'
                    ? "O'tgan oy"
                    : 'Shu oy');

    const modeCaption = range?.modeLabel
        || (activeMode === 'all' ? 'Barcha vaqt' : activeMode === 'previous-month' ? "O'tgan oy" : activeMode === 'custom' ? 'Tanlangan davr' : 'Joriy oy');

    // Har bir kartochkada "qaysi davr uchun" ekanini aniq yozib qo'yamiz.
    const periodText = range
        ? (range.mode === 'all'
            ? 'Barcha vaqt uchun'
            : range.mode === 'current-month'
                ? `Joriy oy: ${range.label}`
                : range.mode === 'previous-month'
                    ? `O'tgan oy: ${range.label}`
                    : `Tanlangan davr: ${range.label}`)
        : `${modeCaption}: ${rangeLabel}`;

    const emptyOrderText = (() => {
        if (activeMode === 'previous-month') return "O'tgan oyda hali buyurtmalar mavjud emas";
        if (activeMode === 'all') return "Hali birorta buyurtma qo'shilmagan";
        if (activeMode === 'custom') return "Tanlangan davrda hali buyurtmalar mavjud emas";
        return 'Joriy oyda hali buyurtmalar mavjud emas';
    })();

    // ---------- Loading ----------
    if (isLoading && !data) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                    <p className="font-medium text-gray-500">Statistika yuklanmoqda...</p>
                </div>
            </div>
        );
    }

    // ---------- Error ----------
    if (error) {
        return (
            <div className="flex min-h-screen items-center justify-center px-4">
                <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-lg">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                    <h3 className="mb-2 text-lg font-semibold text-gray-900">Statistika yuklanmadi</h3>
                    <p className="mb-6 text-sm text-gray-500">
                        {error.response?.data?.message || 'Server bilan bog‘lanishda xatolik yuz berdi.'}
                    </p>
                    <button
                        onClick={() => mutate()}
                        className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                        Qayta urinish
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen px-4 py-6 sm:px-6">
            <div className="mx-auto">
                {/* Header */}
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Boshqaruv paneli</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Shu davr qanchalik foyda keltirganini bir qarashda ko‘ring.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-sm">
                            <Clock size={14} className="text-gray-400" />
                            <span>Bugun: {new Date().toLocaleDateString('uz-UZ')}</span>
                        </div>
                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
                        >
                            <Download size={16} />
                            Hisobot olish
                        </button>
                    </div>
                </div>

                {/* Davr tanlagichi */}
                <PeriodSelector
                    activeMode={activeMode}
                    onSelectPreset={handleSelectPreset}
                    customOpen={customOpen}
                    onToggleCustom={handleOpenCustom}
                    draftStart={draftStart}
                    setDraftStart={setDraftStart}
                    draftEnd={draftEnd}
                    setDraftEnd={setDraftEnd}
                    onApplyCustom={handleApplyCustom}
                    onCancelCustom={handleCancelCustom}
                    error={customError}
                    rangeLabel={rangeLabel}
                    isRefreshing={isValidating}
                    onRefresh={() => mutate()}
                />

                {/* Kassa balansi — davrga bog'liq bo'lmagan balans */}
                <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 text-white shadow-md sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">
                            <Wallet size={22} />
                        </span>
                        <div>
                            <p className="text-xs uppercase tracking-wider text-white/80">Kassa balansi</p>
                            <p className="text-2xl font-bold">
                                {kassaBalance === null ? '...' : money(kassaBalance)}
                            </p>
                            <p className="text-[11px] text-white/70">Bugungi holat — tanlangan davrga bog‘liq emas</p>
                        </div>
                    </div>
                    <div className="rounded-xl bg-white/15 px-4 py-3 backdrop-blur-sm">
                        <p className="text-[11px] uppercase tracking-wider text-white/80">
                            {today.inRange === false ? `Bugun (${modeCaption} davriga kirmaydi)` : 'Bugun'}
                        </p>
                        <p className="text-lg font-semibold">
                            {number(today.orders)} ta buyurtma · {money(today.revenue)}
                        </p>
                    </div>
                </div>

                {/* ---------- 1. DAVR KO'RSATKICHLARI ---------- */}
                <section className="mb-8">
                    <SectionHeader
                        icon={TrendingUp}
                        tone="blue"
                        title="Shu davr uchun ko'rsatkichlar"
                        description={periodText}
                    />

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            icon={ShoppingCart}
                            tone="orange"
                            label="Buyurtmalar soni"
                            value={number(period.orders)}
                            periodText={periodText}
                            hint="Tanlangan davrda yaratilgan barcha buyurtmalar soni (bekor qilinganlar ham kiradi)."
                            growth={growth.ordersPercent}
                            growthHint={growth.comparisonLabel || undefined}
                        />
                        <StatCard
                            icon={DollarSign}
                            tone="purple"
                            label="Tushum"
                            value={money(period.revenue)}
                            periodText={`${periodText} · bekor qilinganlarsiz`}
                            hint="Tanlangan davrdagi buyurtmalar summasi. Bekor qilingan buyurtmalar hisobga olinmaydi."
                            growth={growth.revenuePercent}
                            growthHint={growth.comparisonLabel || undefined}
                        />
                        <StatCard
                            icon={Users}
                            tone="green"
                            label="Aktiv mijozlar"
                            value={number(period.activeClients)}
                            periodText={
                                activeMode !== 'all' && period.newClients > 0
                                    ? `${periodText} · ${number(period.newClients)} tasi yangi`
                                    : `${periodText}`
                            }
                            hint="Shu davrda kamida bitta buyurtma bergan mijozlar soni. Yangi mijozlar — shu davrda birinchi marta qo‘shilganlar."
                        />
                        <StatCard
                            icon={TrendingUp}
                            tone="indigo"
                            label="O'rtacha buyurtma summasi"
                            value={money(period.avgOrderValue)}
                            periodText={`${periodText} · ${number(period.totalKg)} kg sotilgan`}
                            hint="Tushum ÷ bekor qilinmagan buyurtmalar soni. Ya'ni bitta buyurtma o‘rtacha qancha summaga tushganini ko‘rsatadi."
                        />
                    </div>
                </section>

                {/* Bo'sh holat — davrda buyurtma bo'lmasa */}
                {period.hasOrders === false && (
                    <div className="mb-8 flex flex-col items-start gap-4 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/50 p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                                <ShoppingCart size={22} />
                            </span>
                            <div>
                                <p className="font-semibold text-gray-900">{emptyOrderText}</p>
                                <p className="mt-0.5 text-sm text-gray-500">
                                    Yangi buyurtma qo‘shsangiz, bu davr statistikasi shu yerda paydo bo‘ladi.
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {activeMode !== 'all' && (
                                <button
                                    onClick={() => handleSelectPreset('all')}
                                    className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-50"
                                >
                                    Barcha vaqtni ko‘rish
                                </button>
                            )}
                            <button
                                onClick={() => navigate('/orders')}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                            >
                                Buyurtmalarga o‘tish
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {/* ---------- 2. BUGUNGI HOLAT (davrga bog'liq emas) ---------- */}
                <section className="mb-8">
                    <SectionHeader
                        icon={Package}
                        tone="purple"
                        title="Bugungi holat"
                        description="Bu ko'rsatkichlar hozirgi zahira va qarzlarni ko‘rsatadi — tanlangan sanaga bog‘liq emas"
                    />
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            icon={Package}
                            tone="blue"
                            label="Ombordagi mahsulot turlari"
                            value={number(stock.products)}
                            periodText="Bugungi holat"
                            hint="Omborda mavjud mahsulot turlari soni (donalab emas, nom bo‘yicha)."
                        />
                        <StatCard
                            icon={Coins}
                            tone="green"
                            label="Ombor qiymati"
                            value={money(stock.value)}
                            periodText="Bugungi holat · sotuv narxida"
                            hint="Ombordagi barcha mahsulotlarning sotuv narxidagi umumiy qiymati."
                        />
                        <StatCard
                            icon={Weight}
                            tone="indigo"
                            label="Ombordagi vazn"
                            value={`${number(stock.kg)} kg`}
                            periodText={`${number(stock.boxes)} ta quti`}
                            hint="Omborda qolgan mahsulotlarning umumiy vazni (kg) va qutilar soni."
                        />
                        <StatCard
                            icon={Wallet}
                            tone="red"
                            label="Mijozlar qarzi"
                            value={money(debts.total)}
                            periodText={
                                debts.debtors > 0
                                    ? `${number(debts.debtors)} ta qarzdor mijoz`
                                    : 'Qarzdor mijoz yo‘q'
                            }
                            hint="Mijozlarning hozirgi umumiy qarzi. Bu balans ko‘rsatkichi — tanlangan davrga bog‘lanmaydi."
                        />
                    </div>
                </section>

                {/* ---------- 3. GRAFIKLAR ---------- */}
                <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <ChartCard
                        title="Oylik daromad — so‘nggi 6 oy"
                        subtitle="Tanlangan davr qaysi oyda tugasa, shu oygacha"
                    >
                        {monthlyRevenueTrend.length === 0 ? (
                            <ChartEmpty icon={ChartColumnIcon} text="Hozircha ma’lumot yo‘q" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={monthlyRevenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <Tooltip cursor={{ fill: '#f9fafb' }} {...moneyTooltip} />
                                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Daromad ($)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    <ChartCard
                        title={`Kunlik daromad — ${dailyChart.label || range?.label || rangeLabel}`}
                        subtitle={
                            dailyChart.mode === 'last-30-days'
                                ? "Davr juda uzun bo‘lgani uchun so‘nggi 30 kun ko‘rsatilgan"
                                : 'Har bir kunning tushumi'
                        }
                    >
                        {dailyRevenueTrend.length === 0 ? (
                            <ChartEmpty icon={ChartLineIcon} text="Hozircha ma’lumot yo‘q" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={dailyRevenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <Tooltip {...moneyTooltip} />
                                    <Line
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="#3b82f6"
                                        strokeWidth={3}
                                        dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
                                        activeDot={{ r: 5 }}
                                        name="Daromad ($)"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <ChartCard
                        title="Buyurtma holatlari"
                        subtitle={`${modeCaption} · ${range?.label || rangeLabel}`}
                    >
                        {orderStatusChart.length === 0 ? (
                            <ChartEmpty icon={ChartPieIcon} text="Bu davrda buyurtma yo‘q" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={orderStatusChart}
                                        dataKey="count"
                                        nameKey="label"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={90}
                                        paddingAngle={2}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {orderStatusChart.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => [value, 'Soni']} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    <ChartCard
                        title="Eng ko‘p sotilgan 5 mahsulot"
                        subtitle={`${modeCaption} · ${range?.label || rangeLabel}`}
                    >
                        {topProducts.length === 0 ? (
                            <ChartEmpty icon={ChartColumnIcon} text="Bu davrda sotuv bo‘lmagan" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topProducts} layout="vertical" margin={{ left: 20, right: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f0f0f0" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: '#f9fafb' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value, name) => {
                                            if (name === 'quantityKg') return [`${value} kg`, 'Miqdor'];
                                            if (name === 'revenue') return [money(value), 'Summa'];
                                            return [value, name];
                                        }}
                                    />
                                    <Bar dataKey="quantityKg" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} name="Miqdor (kg)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <ChartCard
                        title="Eng ko‘p qarzdor mijozlar"
                        subtitle="Bugungi holat — davrga bog‘liq emas"
                        className="lg:col-span-1"
                    >
                        {topClientsByDebt.length === 0 ? (
                            <ChartEmpty icon={Users} text="Qarzdor mijoz yo‘q" />
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topClientsByDebt} layout="vertical" margin={{ left: 20, right: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#f0f0f0" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        formatter={(value) => [money(value), 'Qarz']}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="debt" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} name="Qarz ($)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-700">So‘nggi buyurtmalar</h3>
                                <p className="mt-0.5 text-xs text-gray-400">{range?.label || rangeLabel}</p>
                            </div>
                            <button
                                onClick={() => navigate('/orders')}
                                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                            >
                                Barchasini ko‘rish
                                <ChevronRight size={14} />
                            </button>
                        </div>

                        {latestOrders.length === 0 ? (
                            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg text-gray-400">
                                <ShoppingCart size={44} className="opacity-20" />
                                <p className="text-sm">{emptyOrderText}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-gray-100 text-left text-xs uppercase tracking-wider text-gray-500">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">Mijoz</th>
                                            <th className="px-4 py-3 font-medium">Summa</th>
                                            <th className="px-4 py-3 font-medium">Holat</th>
                                            <th className="px-4 py-3 text-right font-medium">Sana</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {latestOrders.map((order) => {
                                            const status = STATUS_META[order.status] || { label: order.status, className: 'bg-gray-100 text-gray-600' };
                                            return (
                                                <tr key={order._id} className="transition-colors hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-800">
                                                        {order.client?.name || 'Noma’lum'}
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-gray-600">
                                                        {money(order.orderTotal)}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                                                            {status.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-xs text-gray-400">
                                                        {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Foydalanuvchi uchun qisqa izoh */}
                <div className="mb-6 flex items-start gap-2 rounded-xl border border-gray-200 bg-white/70 px-4 py-3 text-xs text-gray-500">
                    <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
                    <p>
                        <span className="font-medium text-gray-700">Qanday hisoblanadi?</span>{' '}
                        Buyurtmalar soni, tushum, aktiv mijozlar va grafiklar tanlangan davr bo‘yicha hisoblanadi.
                        Tushumda bekor qilingan buyurtmalar hisobga olinmaydi. Ombor qoldig‘i va mijoz qarzi — bugungi
                        holat ko‘rsatkichlari, ular tanlangan davrga bog‘liq emas.
                    </p>
                </div>
            </div>

            <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />
        </div>
    );
};
