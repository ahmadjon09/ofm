import React from 'react';
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
    User,
    Calendar,
    ArrowUp,
    ArrowDown,
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
                    <div className={`text-xs font-medium ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {growth >= 0 ? <ArrowUp size={14} className="inline" /> : <ArrowDown size={14} className="inline" />}
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
const COLORS = ['red', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

// ============================================================
// MAIN COMPONENT
// ============================================================
export const Dashboard = () => {
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
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    // ---------- Error ----------
    if (error) {
        return (
            <div className="min-h-screen  flex items-center justify-center px-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Statistika yuklanmadi</h3>
                    <p className="text-sm text-gray-500 mb-6">
                        {error.response?.data?.message || 'Server bilan bog‘lanishda xatolik yuz berdi.'}
                    </p>
                    <button
                        onClick={() => mutate()}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                    >
                        Qayta urinish
                    </button>
                </div>
            </div>
        );
    }

    // ---------- Render ----------
    return (
        <div className="min-h-screen  py-6 px-4 sm:px-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                        <p className="text-sm text-gray-500">Umumiy statistika va tahlillar</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <Clock size={16} />
                        <span>Yangilangan: {new Date().toLocaleString('uz-UZ')}</span>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
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
                        label="Jami kg"
                        value={`${totalKg.toLocaleString()} kg`}
                        color="indigo"
                    />
                    <StatCard
                        icon={Calendar}
                        label="Bugungi buyurtmalar"
                        value={todaysOrders}
                        color="yellow"
                    />
                    <StatCard
                        icon={TrendingUp}
                        label="Oylik buyurtmalar"
                        value={monthlyOrders}
                        color="green"
                        growth={growth?.ordersPercent}
                    />
                </div>

                {/* Charts Row 1: Monthly & Daily Trends */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Monthly Revenue Trend */}
                    <ChartCard title="Oylik daromad (so‘nggi 6 oy)">
                        {monthlyRevenueTrend.length === 0 ? (
                            <div className="flex items-center justify-center h-64 text-gray-400">
                                <p>Maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={monthlyRevenueTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis />
                                    <Tooltip
                                        formatter={(value) => [`${value.toLocaleString()} $`, 'Daromad']}
                                    />
                                    <Legend />
                                    <Bar dataKey="revenue" fill="#3b82f6" name="Daromad ($)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Daily Revenue Trend */}
                    <ChartCard title="Kunlik daromad (oxirgi 30 kun)">
                        {dailyRevenueTrend.length === 0 ? (
                            <div className="flex items-center justify-center h-64 text-gray-400">
                                <p>Maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={dailyRevenueTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" />
                                    <YAxis />
                                    <Tooltip
                                        formatter={(value) => [`${value.toLocaleString()} $`, 'Daromad']}
                                    />
                                    <Legend />
                                    <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="Daromad ($)" />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                {/* Charts Row 2: Status Pie & Top Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Order Status Pie */}
                    <ChartCard title="Buyurtma holatlari">
                        {orderStatusChart.length === 0 ? (
                            <div className="flex items-center justify-center h-64 text-gray-400">
                                <p>Maʼlumot yo‘q</p>
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
                                        outerRadius={100}
                                        label
                                    >
                                        {orderStatusChart.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => [value, 'Soni']} />
                                    <Legend />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Top Products by Quantity */}
                    <ChartCard title="Eng ko‘p sotilgan mahsulotlar">
                        {topProducts.length === 0 ? (
                            <div className="flex items-center justify-center h-64 text-gray-400">
                                <p>Maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topProducts} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        formatter={(value, name) => {
                                            if (name === 'quantityKg') return [`${value} kg`, 'Miqdor'];
                                            if (name === 'revenue') return [`${value} $`, 'Daromad'];
                                            return [value, name];
                                        }}
                                    />
                                    <Legend />
                                    <Bar dataKey="quantityKg" fill="#3b82f6" name="Miqdor (kg)" />
                                    <Bar dataKey="revenue" fill="#8b5cf6" name="Daromad ($)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>
                </div>

                {/* Charts Row 3: Top Clients by Debt */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <ChartCard title="Eng ko‘p qarzdor mijozlar">
                        {topClientsByDebt.length === 0 ? (
                            <div className="flex items-center justify-center h-64 text-gray-400">
                                <p>Maʼlumot yo‘q</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={topClientsByDebt} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis type="number" />
                                    <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                                    <Tooltip
                                        formatter={(value) => [`${value.toLocaleString()} $`, 'Qarz']}
                                    />
                                    <Legend />
                                    <Bar dataKey="debt" fill="#ef4444" name="Qarz ($)" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    {/* Latest Orders */}
                    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
                            So‘nggi buyurtmalar
                        </h3>
                        {latestOrders.length === 0 ? (
                            <div className="flex items-center justify-center h-64 text-gray-400">
                                <p>Hali buyurtma yo‘q</p>
                            </div>
                        ) : (
                            <div className="overflow-y-auto max-h-72">
                                <table className="w-full text-sm">
                                    <thead className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wider">
                                        <tr>
                                            <th className="pb-2 font-medium">Mijoz</th>
                                            <th className="pb-2 font-medium">Summa</th>
                                            <th className="pb-2 font-medium">Holat</th>
                                            <th className="pb-2 font-medium text-right">Sana</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {latestOrders.map((order) => (
                                            <tr key={order._id} className="hover: transition">
                                                <td className="py-3 font-medium text-gray-800">
                                                    {order.client?.name || 'Noma’lum'}
                                                </td>
                                                <td className="py-3 text-gray-600">
                                                    {order.orderTotal?.toLocaleString()} $
                                                </td>
                                                <td className="py-3">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${order.status === 'completed'
                                                        ? 'bg-green-100 text-green-700'
                                                        : order.status === 'cancelled'
                                                            ? 'bg-red-100 text-red-700'
                                                            : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                        {order.status === 'pending' ? 'Kutilmoqda' : order.status === 'completed' ? 'Bajarilgan' : 'Bekor'}
                                                    </span>
                                                </td>
                                                <td className="py-3 text-right text-gray-400 text-xs">
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
        </div>
    );
};