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
    PieChart,
    Printer,
} from 'lucide-react';

const KASSA_URL = '/kassa';
const HISTORY_URL = '/kassa/history';
const EXPENSE_URL = '/kassa/expense';
const INCOME_URL = '/kassa/income';

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
// PRINT: umumiy yordamchi funksiyalar
// (Orders.jsx'dagi bilan bir xil, ishonchli iframe-asosidagi usul)
// ============================================================

// HTML-ga chiqarilayotgan matnni xavfsizlashtirish
const escapeHtml = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Pul miqdorini chop etish uchun formatlash (belgisiz, faqat son)
const formatMoneyPrint = (val) => {
    if (val === undefined || val === null || Number.isNaN(Number(val))) return '0';
    return Number(val).toLocaleString('uz-UZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Berilgan to'liq HTML hujjatni ko'rinmas iframe orqali chop etadi.
// Asosiy sahifa DOM/CSS'iga umuman bog'liq emas — shu sababli natija
// har doim ishonchli va toza chiqadi (window.print() o'rniga).
const printHtmlDocument = (html, onError) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(iframe);

    const cleanup = () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    };

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    const triggerPrint = () => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (err) {
            if (onError) onError(err);
            cleanup();
        }
    };

    iframe.onload = () => setTimeout(triggerPrint, 80);
    if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = cleanup;
    }
    // Zaxira: onafterprint ishlamasa ham, iframe baribir tozalanadi
    setTimeout(cleanup, 60000);
};

// Chop etish hujjatlari uchun umumiy CSS (A4, chiroyli jadval)
const PRINT_BASE_STYLE = `
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      color: #111827;
      font-size: 12px;
      padding: 10mm;
    }
    .head {
      text-align: center;
      border-bottom: 2px solid #111827;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .head h1 {
      margin: 0 0 6px 0;
      font-size: 18px;
      letter-spacing: 0.4px;
    }
    .head .sub {
      font-size: 11px;
      color: #4b5563;
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      justify-content: center;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 14px;
      margin-bottom: 12px;
      font-size: 11.5px;
    }
    .summary b { color: #111827; }
    .summary .pos { color: #15803d; font-weight: 700; }
    .summary .neg { color: #b91c1c; font-weight: 700; }

    table.report {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      table-layout: fixed;
    }
    table.report th,
    table.report td {
      border: 1px solid #94a3b8;
      padding: 5px 6px;
      text-align: left;
      word-break: break-word;
    }
    table.report thead th {
      background: #f1f5f9;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 9.5px;
      letter-spacing: 0.3px;
      text-align: center;
    }
    table.report tbody tr:nth-child(even) { background: #f8fafc; }
    table.report td.c { text-align: center; }
    table.report td.r { text-align: right; }
    table.report td.b { font-weight: 700; }
    table.report td.pos { color: #15803d; }
    table.report td.neg { color: #b91c1c; }
    table.report td.empty { padding: 16px; color: #9ca3af; text-align: center; }
    table.report tfoot td {
      border-top: 2px solid #111827;
      background: #f1f5f9;
      font-weight: 700;
    }
    .badge {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }
    .badge.in { background: #dcfce7; color: #15803d; }
    .badge.out { background: #fee2e2; color: #b91c1c; }

    .footer-note {
      margin-top: 14px;
      font-size: 9.5px;
      color: #9ca3af;
      text-align: right;
    }

    @media print {
      table.report { page-break-inside: auto; }
      table.report tr { page-break-inside: avoid; page-break-after: auto; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }
    }
`;

// Kassa tarixi (operatsiyalar ro'yxati) hisobotini quradi — joriy filtrlarga mos
const buildKassaHistoryPrintHtml = ({ transactions, typeFilter, fromDate, toDate, balance }) => {
    const list = transactions || [];
    const totalIncome = list.filter((t) => t.type === 'KIRIM').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalExpense = list.filter((t) => t.type === 'CHIQIM').reduce((s, t) => s + Number(t.amount || 0), 0);

    const periodLabel = (() => {
        if (!fromDate && !toDate) return 'Barcha davr';
        const f = fromDate ? new Date(fromDate).toLocaleDateString('uz-UZ') : '...';
        const t = toDate ? new Date(toDate).toLocaleDateString('uz-UZ') : 'hozirgacha';
        return `${f} — ${t}`;
    })();

    const typeLabel = typeFilter === 'KIRIM' ? 'Faqat kirimlar' : typeFilter === 'CHIQIM' ? 'Faqat chiqimlar' : 'Barcha turlar';

    const rowsHtml = list
        .map((tx, idx) => {
            const isIncome = tx.type === 'KIRIM';
            const dateStr = tx.createdAt
                ? new Date(tx.createdAt).toLocaleDateString('uz-UZ', {
                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })
                : '-';
            return `
        <tr>
          <td class="c">${idx + 1}</td>
          <td>${escapeHtml(dateStr)}</td>
          <td class="c"><span class="badge ${isIncome ? 'in' : 'out'}">${isIncome ? 'KIRIM' : 'CHIQIM'}</span></td>
          <td>${escapeHtml(tx.reason || tx.source || '-')}</td>
          <td class="r b ${isIncome ? 'pos' : 'neg'}">${isIncome ? '+' : '-'}${formatMoneyPrint(tx.amount)}</td>
          <td>${escapeHtml(tx.user?.name || 'Noma’lum')}</td>
        </tr>`;
        })
        .join('');

    const emptyRowHtml = list.length === 0
        ? `<tr><td colspan="6" class="empty">Operatsiyalar topilmadi</td></tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8" />
<title>Kassa tarixi hisoboti</title>
<style>
  ${PRINT_BASE_STYLE}
  @page { size: A4 portrait; margin: 10mm; }
</style>
</head>
<body>
  <div class="head">
    <h1>KASSA TARIXI HISOBOTI</h1>
    <div class="sub">Davr: ${escapeHtml(periodLabel)} &nbsp;|&nbsp; Filtr: ${escapeHtml(typeLabel)} &nbsp;|&nbsp; Yaratilgan sana: ${escapeHtml(new Date().toLocaleString('uz-UZ'))}</div>
  </div>

  <div class="summary">
    <span>Operatsiyalar soni: <b>${list.length}</b></span>
    <span>Jami kirim: <span class="pos">+${formatMoneyPrint(totalIncome)} $</span></span>
    <span>Jami chiqim: <span class="neg">-${formatMoneyPrint(totalExpense)} $</span></span>
    <span>Joriy balans: <b>${formatMoneyPrint(balance)} $</b></span>
  </div>

  <table class="report">
    <thead>
      <tr>
        <th style="width:6%">№</th>
        <th style="width:18%">Sana</th>
        <th style="width:12%">Turi</th>
        <th style="width:32%">Izoh</th>
        <th style="width:15%">Summa ($)</th>
        <th style="width:17%">Kim tomonidan</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}${emptyRowHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="r">Jami:</td>
        <td class="r">
          <span class="pos">+${formatMoneyPrint(totalIncome)}</span> /
          <span class="neg">-${formatMoneyPrint(totalExpense)}</span>
        </td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-note">Ombor va Savdo Boshqaruv Tizimi — avtomatik yaratilgan hisobot</div>
</body>
</html>`;
};

// Chiqimlar guruhlari (oylik) hisobotini quradi
const buildKassaGroupPrintHtml = ({ selectedMonth, groupData }) => {
    const list = groupData || [];
    const [year, monthNum] = (selectedMonth || '').split('-').map(Number);
    const monthLabel = year && monthNum
        ? new Date(year, monthNum - 1, 1).toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' })
        : '-';

    const totalSum = list.reduce((s, i) => s + Number(i.total || 0), 0);
    const totalCount = list.reduce((s, i) => s + Number(i.count || 0), 0);

    const rowsHtml = list
        .map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(item.note)}</td>
        <td class="r b neg">${formatMoneyPrint(item.total)}</td>
      </tr>`)
        .join('');

    const emptyRowHtml = list.length === 0
        ? `<tr><td colspan="5" class="empty">Tanlangan oyda chiqimlar mavjud emas</td></tr>`
        : '';

    return `<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8" />
<title>Chiqimlar guruhlari hisoboti</title>
<style>
  ${PRINT_BASE_STYLE}
  @page { size: A4 portrait; margin: 10mm; }
</style>
</head>
<body>
  <div class="head">
    <h1>CHIQIMLAR GURUHLARI HISOBOTI</h1>
    <div class="sub">Oy: ${escapeHtml(monthLabel)} &nbsp;|&nbsp; Yaratilgan sana: ${escapeHtml(new Date().toLocaleString('uz-UZ'))}</div>
  </div>

  <div class="summary">
    <span>Guruhlar soni: <b>${list.length}</b></span>
    <span>Jami chiqimlar soni: <b>${totalCount}</b></span>
    <span>Jami summa: <span class="neg">${formatMoneyPrint(totalSum)} $</span></span>
  </div>

  <table class="report">
    <thead>
      <tr>
        <th style="width:6%">№</th>
        <th style="width:40%">Sabab / Izoh</th>
        <th style="width:18%">Jami summa ($)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}${emptyRowHtml}
    </tbody>
    <tfoot>
      <tr>
        <td class="r">Jami:</td>
        <td></td>
        <td class="r neg">${formatMoneyPrint(totalSum)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-note">Ombor va Savdo Boshqaruv Tizimi — avtomatik yaratilgan hisobot</div>
</body>
</html>`;
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export const Kassa = () => {
    // ---------- State ----------
    const [page, setPage] = useState(1);
    const limit = 300;
    const [typeFilter, setTypeFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    // ---------- Income modal ----------
    const [incomeModalOpen, setIncomeModalOpen] = useState(false);
    const [incomeForm, setIncomeForm] = useState({ amount: '', source: '' });
    const [incomeErrors, setIncomeErrors] = useState({});
    const [incomeSaving, setIncomeSaving] = useState(false);

    // ---------- Expense modal ----------
    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm, setExpenseForm] = useState({ amount: '', reason: '' });
    const [expenseErrors, setExpenseErrors] = useState({});
    const [expenseSaving, setExpenseSaving] = useState(false);

    // ---------- Group modal ----------
    const [groupModalOpen, setGroupModalOpen] = useState(false);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [groupData, setGroupData] = useState([]);
    const [groupLoading, setGroupLoading] = useState(false);
    const [groupError, setGroupError] = useState(null);

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

    // ---------- Statistikani hisoblash (oylik) ----------
    const monthlyStats = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        let income = 0;
        let expense = 0;

        if (historyData?.data?.history) {
            historyData.data.history.forEach(tx => {
                const txDate = new Date(tx.createdAt);
                if (txDate.getMonth() === currentMonth && txDate.getFullYear() === currentYear) {
                    if (tx.type === 'KIRIM') income += Number(tx.amount);
                    else if (tx.type === 'CHIQIM') expense += Number(tx.amount);
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

    // ---------- Print: kassa tarixi hisoboti ----------
    const handlePrintHistory = () => {
        if (!transactions.length) {
            showToast('Chop etish uchun operatsiyalar topilmadi.', 'error');
            return;
        }
        const html = buildKassaHistoryPrintHtml({ transactions, typeFilter, fromDate, toDate, balance });
        printHtmlDocument(html, () => showToast('Chop etishda xatolik yuz berdi.', 'error'));
    };

    // ---------- Print: chiqimlar guruhlari hisoboti ----------
    const handlePrintGroup = () => {
        if (!groupData.length) {
            showToast('Chop etish uchun ma’lumot yo‘q.', 'error');
            return;
        }
        const html = buildKassaGroupPrintHtml({ selectedMonth, groupData });
        printHtmlDocument(html, () => showToast('Chop etishda xatolik yuz berdi.', 'error'));
    };

    // ---------- Income modal ----------
    const openIncomeModal = () => {
        setIncomeForm({ amount: '', source: '' });
        setIncomeErrors({});
        setIncomeModalOpen(true);
    };

    const closeIncomeModal = () => {
        if (incomeSaving) return;
        setIncomeModalOpen(false);
    };

    const handleIncomeChange = (e) => {
        const { name, value } = e.target;
        setIncomeForm({ ...incomeForm, [name]: value });
        setIncomeErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    const validateIncome = () => {
        const errors = {};
        if (!incomeForm.amount || Number(incomeForm.amount) <= 0) {
            errors.amount = 'Summa 0 dan katta bo‘lishi kerak.';
        }
        if (!incomeForm.source || !incomeForm.source.trim()) {
            errors.source = 'Manba (kimdan yoki nima uchun) kiritilishi shart.';
        }
        setIncomeErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleIncomeSubmit = async (e) => {
        e.preventDefault();
        if (!validateIncome()) {
            showToast('Iltimos, xatoliklarni tuzating.', 'error');
            return;
        }

        setIncomeSaving(true);
        try {
            await api.post(INCOME_URL, {
                amount: Number(incomeForm.amount),
                source: incomeForm.source.trim(),
            });
            showToast('Kirim muvaffaqiyatli yozildi.', 'success');
            await mutateBalance();
            await mutateHistory();
            setIncomeModalOpen(false);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setIncomeSaving(false);
        }
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

    // ---------- Group modal ----------
    const fetchGroupData = useCallback(async (month) => {
        if (!month) return;
        const [year, monthNum] = month.split('-').map(Number);
        const from = new Date(year, monthNum - 1, 1);
        const to = new Date(year, monthNum, 0);
        const fromISO = from.toISOString();
        const toISO = to.toISOString();

        setGroupLoading(true);
        setGroupError(null);
        try {
            const params = new URLSearchParams({
                type: 'CHIQIM',
                from: fromISO,
                to: toISO,
                limit: 1000,
            });
            const resp = await api.get(`${HISTORY_URL}?${params.toString()}`);
            const items = resp.data?.data?.history || [];

            const groups = items.reduce((acc, tx) => {
                const reason = tx.reason || 'Izohsiz';
                if (!acc[reason]) {
                    acc[reason] = { total: 0, count: 0 };
                }
                acc[reason].total += Number(tx.amount);
                acc[reason].count += 1;
                return acc;
            }, {});

            const groupedArray = Object.entries(groups).map(([note, data]) => ({
                note,
                total: data.total,
                count: data.count,
            }));
            groupedArray.sort((a, b) => b.total - a.total);
            setGroupData(groupedArray);
        } catch (err) {
            setGroupError(err.message || 'Maʼlumotlarni yuklashda xatolik');
            showToast('Chiqimlarni yuklab bo‘lmadi.', 'error');
        } finally {
            setGroupLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        if (groupModalOpen) {
            fetchGroupData(selectedMonth);
        }
    }, [groupModalOpen, selectedMonth, fetchGroupData]);

    const openGroupModal = () => {
        setGroupModalOpen(true);
    };

    const closeGroupModal = () => {
        setGroupModalOpen(false);
        setGroupData([]);
        setGroupError(null);
    };

    const handleMonthChange = (e) => {
        setSelectedMonth(e.target.value);
    };

    // ---------- Loading state ----------
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
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={openIncomeModal}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                        >
                            <ArrowUpCircle size={18} /> Kirim qo‘shish
                        </button>
                        <button
                            onClick={openExpenseModal}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                        >
                            <ArrowDownCircle size={18} /> Chiqim qo‘shish
                        </button>
                        <button
                            onClick={openGroupModal}
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
                        >
                            <PieChart size={18} /> Chiqimlar guruhlari
                        </button>
                        <button
                            onClick={handlePrintHistory}
                            disabled={!transactions.length}
                            title="Joriy filtrlar bo‘yicha kassa tarixini chop etish"
                            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Printer size={18} /> Hisobotni chop etish
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                    <StatCard
                        icon={ArrowUpCircle}
                        label="Shu oygi Kirim"
                        value={monthlyStats.income}
                        color="green"
                        subValue="Jami tushumlar"
                    />
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
                                        <th className="px-6 py-4 font-semibold">Izoh</th>
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
                                                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={tx.reason || tx.source}>
                                                        {tx.reason || tx.source || '-'}
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

                {/* ====== Income Modal ====== */}
                {incomeModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
                        onClick={closeIncomeModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeIncomeModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40 p-1 rounded-full hover:bg-gray-100"
                                disabled={incomeSaving}
                            >
                                <X size={20} />
                            </button>

                            <div className="mb-6">
                                <h2 className="text-xl font-bold text-gray-900">Kassaga kirim</h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Mavjud balans: <span className="font-semibold text-gray-900">{balance.toLocaleString()} $</span>
                                </p>
                            </div>

                            <form onSubmit={handleIncomeSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Summa ($) <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                        <input
                                            type="number"
                                            name="amount"
                                            step="0.01"
                                            min="0.01"
                                            value={incomeForm.amount}
                                            onChange={handleIncomeChange}
                                            className={`w-full pl-8 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition ${incomeErrors.amount ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-green-500'}`}
                                            placeholder="0.00"
                                            autoFocus
                                        />
                                    </div>
                                    {incomeErrors.amount && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> {incomeErrors.amount}</p>}
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Manba (kimdan yoki nima uchun) <span className="text-red-500">*</span></label>
                                    <textarea
                                        name="source"
                                        rows="3"
                                        value={incomeForm.source}
                                        onChange={handleIncomeChange}
                                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition resize-none ${incomeErrors.source ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-green-500'}`}
                                        placeholder="Masalan: Mijozdan naqd to‘lov..."
                                    />
                                    {incomeErrors.source && <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1"><AlertCircle size={12} /> {incomeErrors.source}</p>}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={closeIncomeModal}
                                        disabled={incomeSaving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={incomeSaving}
                                        className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium shadow-md shadow-green-200 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {incomeSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        Tasdiqlash
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ====== Expense Modal ====== */}
                {expenseModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
                        onClick={closeExpenseModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
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
                                            className={`w-full pl-8 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition ${expenseErrors.amount ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-red-500'}`}
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
                                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition resize-none ${expenseErrors.reason ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-red-500'}`}
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

                {/* ====== Group Modal ====== */}
                {groupModalOpen && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
                        onClick={closeGroupModal}
                    >
                        <div
                            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeGroupModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
                            >
                                <X size={20} />
                            </button>

                            <div className="mb-5">
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <PieChart size={22} className="text-purple-600" />
                                    Chiqimlar guruhlari
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    Tanlangan oy bo‘yicha chiqimlar sabab (izoh) bo‘yicha guruhlangan
                                </p>
                            </div>

                            <div className="flex items-center gap-3 mb-4 flex-wrap">
                                <label htmlFor="monthSelect" className="text-sm font-medium text-gray-700">Oy:</label>
                                <input
                                    id="monthSelect"
                                    type="month"
                                    value={selectedMonth}
                                    onChange={handleMonthChange}
                                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                                />
                                <button
                                    onClick={() => fetchGroupData(selectedMonth)}
                                    disabled={groupLoading}
                                    className="px-4 py-1.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 inline-flex items-center gap-1"
                                >
                                    {groupLoading ? <Loader2 size={16} className="animate-spin" /> : 'Yangilash'}
                                </button>
                                <button
                                    onClick={handlePrintGroup}
                                    disabled={groupLoading || !groupData.length}
                                    className="px-4 py-1.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                                >
                                    <Printer size={15} /> Chop etish
                                </button>
                            </div>

                            {groupLoading ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 size={28} className="animate-spin text-purple-600" />
                                </div>
                            ) : groupError ? (
                                <div className="text-center py-8 text-red-500">
                                    <AlertCircle className="w-10 h-10 mx-auto mb-2" />
                                    <p>{groupError}</p>
                                </div>
                            ) : groupData.length === 0 ? (
                                <div className="text-center py-10 text-gray-400">
                                    <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                    <p className="text-gray-500">Tanlangan oyda chiqimlar mavjud emas.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 text-left font-semibold text-gray-600">Sabab / Izoh</th>
                                                <th className="px-4 py-3 text-right font-semibold text-gray-600">Jami summa ($)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {groupData.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50 transition">
                                                    <td className="px-4 py-3 text-gray-800 font-medium">{item.note}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-red-600">
                                                        {item.total.toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                                            <tr>
                                                <td className="px-4 py-3 font-bold text-gray-800">Jami</td>
                                                <td className="px-4 py-3 text-right font-bold text-red-700">
                                                    {groupData.reduce((sum, item) => sum + item.total, 0).toLocaleString()}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            <div className="mt-5 flex justify-end">
                                <button
                                    onClick={closeGroupModal}
                                    className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-sm font-medium transition"
                                >
                                    Yopish
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ====== Toast ====== */}
                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </div>
    );
};