import React, { useState } from 'react';
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

const DASHBOARD_URL = '/dashboard/stats';
// Backend report endpointlari (server.js dagi routes ga mos)
const REPORTS_BASE_URL = '/reports';

// ---------- Stat Card ----------
const StatCard = ({ icon: Icon, label, value, color = 'blue', growth = null }) => {
    const colorClasses = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        red: 'bg-red-50 text-red-600',
        purple: 'bg-purple-50 text-purple-600',
        orange: 'bg-orange-50 text-orange-600',
        yellow: 'bg-yellow-50 text-yellow-600',
        indigo: 'bg-indigo-50 text-indigo-600',
    };
    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition">
            <div className="flex items-center justify-between">
                <div className={`p-3 rounded-xl ${colorClasses[color]}`}>
                    <Icon size={24} />
                </div>
                {growth !== null && growth !== undefined && (
                    <div className={`text-xs font-medium flex items-center gap-1 ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {growth >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        {Math.abs(growth)}%
                    </div>
                )}
            </div>
            <div className="mt-3">
                <p className="text-sm font-medium text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
        </div>
    );
};

// ---------- Chart Card ----------
const ChartCard = ({ title, children, className = '' }) => (
    <div className={`bg-white rounded-2xl border border-gray-200 p-6 shadow-sm ${className}`}>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">{title}</h3>
        {children}
    </div>
);

// ---------- Colors for Pie ----------
const COLORS = ['#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];

// ============================================================
// EXPORT MODAL COMPONENT
// ============================================================
const ExportModal = ({ isOpen, onClose }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        type: 'summary', // summary, orders, stock, debts
        format: 'excel', // excel, pdf
        month: new Date().getMonth() + 1, // Current month (1-12)
        year: new Date().getFullYear(),
    });

    if (!isOpen) return null;

    const handleDownload = async () => {
        setLoading(true);
        try {
            // Endpointni tanlash
            let endpoint = '';
            switch (formData.type) {
                case 'orders': endpoint = `${REPORTS_BASE_URL}/orders`; break;
                case 'stock': endpoint = `${REPORTS_BASE_URL}/stock`; break;
                case 'debts': endpoint = `${REPORTS_BASE_URL}/debts`; break;
                default: endpoint = `${REPORTS_BASE_URL}/summary`;
            }

            // Parametrlarni tayyorlash
            const params = new URLSearchParams({
                format: formData.format,
                month: formData.month,
                year: formData.year,
            });

            // So'rov yuborish (Blob sifatida)
            const response = await api.get(`${endpoint}?${params.toString()}`, {
                responseType: 'blob',
            });

            // Fayl nomini yaratish
            const dateStr = `${formData.year}-${String(formData.month).padStart(2, '0')}`;
            const extension = formData.format === 'pdf' ? 'pdf' : 'xlsx';
            const filename = `hisobot_${formData.type}_${dateStr}.${extension}`;

            // Yuklab olish jarayoni
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
            console.error("Export error:", error);
            alert("Hisobotni yuklab olishda xatolik yuz berdi.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden transform transition-all scale-100">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-2">
                        <Download className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-bold text-gray-900">Hisobot yuklab olish</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Report Type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Hisobot turi</label>
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
                                    className={`flex items-center justify-center gap-2 p-3 rounded-lg border text-sm font-medium transition ${formData.type === item.id
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500'
                                            : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                >
                                    <item.icon size={16} />
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Date Selection */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Oy</label>
                            <select
                                value={formData.month}
                                onChange={(e) => setFormData({ ...formData, month: Number(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                {Array.from({ length: 12 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(0, i).toLocaleString('uz-UZ', { month: 'long' })}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Yil</label>
                            <select
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: Number(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            >
                                {[2024, 2025, 2026].map((y) => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Format Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Fayl formati</label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setFormData({ ...formData, format: 'excel' })}
                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition ${formData.format === 'excel'
                                        ? 'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-500'
                                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <FileSpreadsheet size={18} />
                                Excel (.xlsx)
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, format: 'pdf' })}
                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition ${formData.format === 'pdf'
                                        ? 'border-red-500 bg-red-50 text-red-700 ring-1 ring-red-500'
                                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                            >
                                <Printer size={18} />
                                PDF
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                        Bekor qilish
                    </button>
                    <button
                        onClick={handleDownload}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm disabled:opacity-70 flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Yuklanmoqda...
                            </>
                        ) : (
                            <>
                                <Download className="w-4 h-4" />
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
// MAIN COMPONENT
// ============================================================
export const Dashboard = () => {
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // ---------- SWR ----------
    const { data, error, isLoading, mutate } = useSWR(
        DASHBOARD_URL,
        (url) => api.get(url).then((res) => res.data),
        { revalidateOnFocus: true, refreshInterval: 60000 } // refresh every minute
    );

    const stats = data?.data || {};
    const {
        totalProducts = 0,
        totalClients = 0,
        totalOrders = 0,
        todaysOrders = 0,
        monthlyOrders = 0,
        revenue = 0,
        totalDebt = 0,
        totalKg = 0,
        growth = {},
        topProducts = [],
        latestOrders = [],
        charts = {},
    } = stats;

    const {
        monthlyRevenueTrend = [],
        dailyRevenueTrend = [],
        orderStatusChart = [],
        topClientsByDebt = [],
    } = charts;

    // ---------- Loading ----------
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                    <p className="text-gray-500 font-medium">Statistika yuklanmoqda...</p>
                </div>
            </div>
        );
    }

    // ---------- Error ----------
    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center border border-red-100">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Statistika yuklanmadi</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        {error.response?.data?.message || 'Server bilan bog‘lanishda xatolik yuz berdi.'}
                    </p>
                    <button
                        onClick={() => mutate()}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition"
                    >
                        Qayta urinish
                    </button>
                </div>
            </div>
        );
    }

    // ---------- Render ----------
    return (
        <div className="min-h-screen bg-gray-50/50 py-6 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Boshqaruv Paneli</h1>
                        <p className="text-sm text-gray-500 mt-1">Biznesingizning joriy holati va tahlillari</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                            <Clock size={16} />
                            <span>{new Date().toLocaleDateString('uz-UZ')}</span>
                        </div>
                        <button
                            onClick={() => setIsExportModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                        >
                            <Download size={18} />
                            Hisobot olish
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        icon={Package}
                        label="Jami mahsulotlar"
                        value={totalProducts.toLocaleString()}
                        color="blue"
                    />
                    <StatCard
                        icon={Users}
                        label="Jami mijozlar"
                        value={totalClients.toLocaleString()}
                        color="green"
                    />
                    <StatCard
                        icon={ShoppingCart}
                        label="Jami buyurtmalar"
                        value={totalOrders.toLocaleString()}
                        color="orange"
                    />
                    <StatCard
                        icon={DollarSign}
                        label="Umumiy daromad"
                        value={`${revenue.toLocaleString()} $`}
                        color="purple"
                        growth={growth?.revenuePercent}
                    />
                    <StatCard
                        icon={Wallet}
                        label="Jami qarz"
                        value={`${totalDebt.toLocaleString()} $`}
                        color="red"
                    />
                    <StatCard
                        icon={Box}
                        label="Ombordagi kg"
                        value={`${totalKg.toLocaleString()} kg`}
                        color="indigo"
                    />
                    <StatCard
                        icon={Calendar}
                        label="Bugungi savdo"
                        value={todaysOrders}
                        color="yellow"
                    />
                    <StatCard
                        icon={TrendingUp}
                        label="Oylik savdo"
                        value={monthlyOrders}
                        color="green"
                        growth={growth?.ordersPercent}
                    />
                </div>

                {/* Charts Row 1: Monthly & Daily Trends */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Monthly Revenue Trend */}
                    <ChartCard title="Oylik daromad dinamikasi (so‘nggi 6 oy)">
                        {monthlyRevenueTrend.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-lg">
                                <BarChart size={48} className="mb-2 opacity-20" />
                                <p>Hozircha maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={monthlyRevenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        cursor={{ fill: '#f9fafb' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value) => [`${value.toLocaleString()} $`, 'Daromad']}
                                    />
                                    <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Daromad ($)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Daily Revenue Trend */}
                    <ChartCard title="Kunlik daromad (oxirgi 30 kun)">
                        {dailyRevenueTrend.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-lg">
                                <LineChart size={48} className="mb-2 opacity-20" />
                                <p>Hozircha maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={dailyRevenueTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value) => [`${value.toLocaleString()} $`, 'Daromad']}
                                    />
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

                {/* Charts Row 2: Status Pie & Top Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Order Status Pie */}
                    <ChartCard title="Buyurtma holatlari taqsimoti">
                        {orderStatusChart.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-lg">
                                <PieChart size={48} className="mb-2 opacity-20" />
                                <p>Hozircha maʼlumot yo‘q</p>
                            </div>
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

                    {/* Top Products by Quantity */}
                    <ChartCard title="TOP-5 Eng ko‘p sotilgan mahsulotlar">
                        {topProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-lg">
                                <BarChart size={48} className="mb-2 opacity-20" />
                                <p>Hozircha maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topProducts} layout="vertical" margin={{ left: 20, right: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        cursor={{ fill: '#f9fafb' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value, name) => {
                                            if (name === 'quantityKg') return [`${value} kg`, 'Miqdor'];
                                            if (name === 'revenue') return [`${value} $`, 'Daromad'];
                                            return [value, name];
                                        }}
                                    />
                                    <Bar dataKey="quantityKg" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} name="Miqdor (kg)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                {/* Charts Row 3: Top Clients by Debt & Latest Orders */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    {/* Top Clients Debt */}
                    <div className="lg:col-span-1">
                        <ChartCard title="Eng ko‘p qarzdor mijozlar">
                            {topClientsByDebt.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-gray-50 rounded-lg">
                                    <Users size={48} className="mb-2 opacity-20" />
                                    <p>Qarzdorlar yo‘q</p>
                                </div>
                            ) : (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart data={topClientsByDebt} layout="vertical" margin={{ left: 20, right: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip
                                            formatter={(value) => [`${value.toLocaleString()} $`, 'Qarz']}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        />
                                        <Bar dataKey="debt" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} name="Qarz ($)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    {/* Latest Orders Table */}
                    <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                                So‘nggi buyurtmalar
                            </h3>
                            <button className="text-xs text-blue-600 font-medium hover:underline">Barchasini ko'rish</button>
                        </div>

                        {latestOrders.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-gray-400 bg-gray-50 rounded-lg">
                                <ShoppingCart size={48} className="mb-2 opacity-20" />
                                <p>Hali buyurtma yo‘q</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-gray-100 text-left text-xs text-gray-500 uppercase tracking-wider bg-gray-50/50">
                                        <tr>
                                            <th className="px-4 py-3 font-medium">Mijoz</th>
                                            <th className="px-4 py-3 font-medium">Summa</th>
                                            <th className="px-4 py-3 font-medium">Holat</th>
                                            <th className="px-4 py-3 font-medium text-right">Sana</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {latestOrders.map((order) => (
                                            <tr key={order._id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-4 py-3 font-medium text-gray-800">
                                                    {order.client?.name || 'Noma’lum'}
                                                </td>
                                                <td className="px-4 py-3 text-gray-600 font-medium">
                                                    {order.orderTotal?.toLocaleString()} $
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${order.status === 'completed'
                                                            ? 'bg-green-100 text-green-700'
                                                            : order.status === 'cancelled'
                                                                ? 'bg-red-100 text-red-700'
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                        {order.status === 'pending' ? 'Kutilmoqda' : order.status === 'completed' ? 'Bajarilgan' : 'Bekor'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-400 text-xs">
                                                    {new Date(order.createdAt).toLocaleDateString('uz-UZ')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Export Modal */}
            <ExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
            />
        </div>
    );
};