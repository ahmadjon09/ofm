import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
    Eye,
    Info,
    Search,
    Pencil,
    Save,
    Trash2,
} from 'lucide-react';

const KASSA_URL = '/kassa';
const HISTORY_URL = '/kassa/history';
const SUMMARY_URL = '/kassa/summary';
const GROUPS_URL = '/kassa/groups';
const EXPENSE_URL = '/kassa/expense';
const INCOME_URL = '/kassa/income';
const SUGGESTIONS_URL = '/kassa/suggestions';

const MONTH_NAMES_UZ = [
    'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
    'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

// Oy kalitini ('2026-09') o'qiladigan nomga aylantiradi. Ko'rsatish uchun
// ishlatiladi — barcha hisob-kitoblar serverda.
const monthKeyToLabel = (monthKey) => {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!match) return '-';
    return `${MONTH_NAMES_UZ[Number(match[2]) - 1]} ${match[1]}`;
};

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

const escapeHtml = (value) => {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const formatMoneyPrint = (val) => {
    if (val === undefined || val === null || Number.isNaN(Number(val))) return '0';
    return Number(val).toLocaleString('uz-UZ', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

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
    setTimeout(cleanup, 60000);
};

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

const buildKassaHistoryPrintHtml = ({ transactions, typeFilter, fromDate, toDate, balance, totals }) => {
    const list = transactions || [];
    // Yig'indilar serverdan keladi (sahifalashdan qat'i nazar to'liq).
    // Server javobi bo'lmasa — zaxira sifatida ko'rinib turgan qatorlardan hisoblaymiz.
    const totalIncome = totals ? Number(totals.income || 0)
        : list.filter((t) => t.type === 'KIRIM').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalExpense = totals ? Number(totals.expense || 0)
        : list.filter((t) => t.type === 'CHIQIM').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCount = totals ? Number(totals.count || 0) : list.length;

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
    <span>Operatsiyalar soni: <b>${totalCount}</b></span>
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

const buildKassaGroupPrintHtml = ({ selectedMonth, groupData, totals }) => {
    const list = groupData || [];
    // Oy nomi va yig'indilar serverdan (server javobi bo'lmasa — zaxira hisob).
    const monthLabel = totals?.monthLabel || monthKeyToLabel(selectedMonth);

    const totalSum = totals ? Number(totals.total || 0) : list.reduce((s, i) => s + Number(i.total || 0), 0);
    const totalCount = totals ? Number(totals.count || 0) : list.reduce((s, i) => s + Number(i.count || 0), 0);
    const groupCount = totals ? Number(totals.groupCount ?? list.length) : list.length;

    const rowsHtml = list
        .map((item, idx) => `
      <tr>
        <td class="c">${idx + 1}</td>
        <td>${escapeHtml(item.label || item.note)}</td>
        <td class="c">${Number(item.count || 0)}</td>
        <td class="r b neg">${formatMoneyPrint(item.total)}</td>
        <td class="c">${formatMoneyPrint(item.percent || 0)}%</td>
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
    <span>Guruhlar soni: <b>${groupCount}</b></span>
    <span>Jami chiqimlar soni: <b>${totalCount}</b></span>
    <span>Jami summa: <span class="neg">${formatMoneyPrint(totalSum)} $</span></span>
  </div>

  <table class="report">
    <thead>
      <tr>
        <th style="width:6%">№</th>
        <th style="width:38%">Sabab / Izoh</th>
        <th style="width:10%">Soni</th>
        <th style="width:20%">Jami summa ($)</th>
        <th style="width:12%">Ulush</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}${emptyRowHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" class="r">Jami:</td>
        <td class="c">${totalCount}</td>
        <td class="r neg">${formatMoneyPrint(totalSum)}</td>
        <td class="c">100%</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer-note">Ombor va Savdo Boshqaruv Tizimi — avtomatik yaratilgan hisobot</div>
</body>
</html>`;
};

export const Kassa = () => {
    const navigate = useNavigate();
    const params = useParams();
    const transactionId = params.id;

    const [page, setPage] = useState(1);
    // Server bir sahifada ko'pi bilan 100 ta yozuv qaytaradi (parsePagination).
    const limit = 100;
    const [typeFilter, setTypeFilter] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchTerm), 350);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const [incomeModalOpen, setIncomeModalOpen] = useState(false);
    const [incomeForm, setIncomeForm] = useState({ amount: '', source: '' });
    const [incomeErrors, setIncomeErrors] = useState({});
    const [incomeSaving, setIncomeSaving] = useState(false);

    const [expenseModalOpen, setExpenseModalOpen] = useState(false);
    const [expenseForm, setExpenseForm] = useState({ amount: '', reason: '' });
    const [expenseErrors, setExpenseErrors] = useState({});
    const [expenseSaving, setExpenseSaving] = useState(false);
    const [expenseSuggestions, setExpenseSuggestions] = useState([]);
    const [suggestionOpen, setSuggestionOpen] = useState(false);

    const [groupModalOpen, setGroupModalOpen] = useState(false);
    // Oy kaliti serverdan olinadi (server javobigacha — mahalliy vaqt bo'yicha zaxira).
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [groupData, setGroupData] = useState([]);
    const [groupMeta, setGroupMeta] = useState(null);
    const [groupLoading, setGroupLoading] = useState(false);
    const [groupError, setGroupError] = useState(null);

    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editTransaction, setEditTransaction] = useState(null);
    const [editReason, setEditReason] = useState('');
    const [editSaving, setEditSaving] = useState(false);
    const [editErrors, setEditErrors] = useState({});

    const [confirmState, setConfirmState] = useState(null);

    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);

    const showToast = useCallback((message, type = 'info') => {
        setToast({ message, type });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3500);
    }, []);

    useEffect(() => () => toastTimer.current && clearTimeout(toastTimer.current), []);

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
    const serverCurrentMonth = balanceData?.data?.currentMonth || null;

    // Oylik tushum/chiqim — to'liq serverdan (bugungi ko'rinib turgan sahifadan emas).
    const {
        data: summaryData,
        error: summaryError,
        isLoading: summaryLoading,
        mutate: mutateSummary,
    } = useSWR(
        SUMMARY_URL,
        (url) => api.get(url).then((res) => res.data),
        { revalidateOnFocus: true }
    );
    const summary = summaryData?.data || null;

    const buildQuery = useCallback(() => {
        const params = new URLSearchParams({ page, limit });
        if (typeFilter) params.append('type', typeFilter);
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
        if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
        return params.toString();
    }, [page, limit, typeFilter, fromDate, toDate, debouncedSearch]);

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

    // Qidiruv endi serverda bajariladi (butun tarix bo'yicha, faqat joriy sahifa emas),
    // shuning uchun ro'yxatni qayta filtrlamaymiz.
    const filteredTransactions = transactions;
    const historySummary = historyData?.data?.summary || null;

    const selectedTransaction = useMemo(() => {
        if (!transactionId) return null;
        return transactions.find(tx => tx._id === transactionId) || null;
    }, [transactionId, transactions]);


    const clearFilters = () => {
        setTypeFilter('');
        setFromDate('');
        setToDate('');
        setSearchTerm('');
        setPage(1);
    };

    const goToPage = (p) => {
        if (p < 1 || p > totalPages) return;
        setPage(p);
    };

    const handlePrintHistory = () => {
        if (!transactions.length) {
            showToast('Chop etish uchun operatsiyalar topilmadi.', 'error');
            return;
        }
        const html = buildKassaHistoryPrintHtml({
            transactions,
            typeFilter,
            fromDate,
            toDate,
            balance,
            totals: historySummary,
        });
        printHtmlDocument(html, () => showToast('Chop etishda xatolik yuz berdi.', 'error'));
    };

    const handlePrintGroup = () => {
        if (!groupData.length) {
            showToast('Chop etish uchun ma’lumot yo‘q.', 'error');
            return;
        }
        const html = buildKassaGroupPrintHtml({
            selectedMonth: groupMeta?.month || selectedMonth,
            groupData,
            totals: groupMeta,
        });
        printHtmlDocument(html, () => showToast('Chop etishda xatolik yuz berdi.', 'error'));
    };

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
            await mutateSummary();
            setIncomeModalOpen(false);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setIncomeSaving(false);
        }
    };

    const fetchExpenseSuggestions = useCallback(async () => {
        try {
            const resp = await api.get(`${SUGGESTIONS_URL}?limit=15`);
            const items = resp.data?.data?.suggestions || [];
            setExpenseSuggestions(items);
        } catch {
            setExpenseSuggestions([]);
        }
    }, []);

    const openExpenseModal = () => {
        setExpenseForm({ amount: '', reason: '' });
        setExpenseErrors({});
        setSuggestionOpen(true);
        setExpenseModalOpen(true);
        fetchExpenseSuggestions();
    };

    const closeExpenseModal = () => {
        if (expenseSaving) return;
        setExpenseModalOpen(false);
        setSuggestionOpen(false);
    };

    const handleExpenseChange = (e) => {
        const { name, value } = e.target;
        setExpenseForm({ ...expenseForm, [name]: value });
        setExpenseErrors((prev) => ({ ...prev, [name]: undefined }));
        if (name === 'reason') setSuggestionOpen(true);
    };

    const pickExpenseSuggestion = (reason) => {
        setExpenseForm((prev) => ({ ...prev, reason }));
        setExpenseErrors((prev) => ({ ...prev, reason: undefined }));
        setSuggestionOpen(false);
    };

    const filteredExpenseSuggestions = useMemo(() => {
        const term = (expenseForm.reason || '').trim().toLowerCase();
        if (!expenseSuggestions.length) return [];
        return expenseSuggestions
            .filter((s) => !term || String(s.reason || '').toLowerCase().includes(term))
            .slice(0, 8);
    }, [expenseSuggestions, expenseForm.reason]);

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
        setSuggestionOpen(false);
        try {
            await api.post(EXPENSE_URL, {
                amount: Number(expenseForm.amount),
                reason: expenseForm.reason.trim(),
            });
            showToast('Chiqim muvaffaqiyatli yozildi.', 'success');
            await mutateBalance();
            await mutateHistory();
            await mutateSummary();
            fetchExpenseSuggestions();
            setExpenseModalOpen(false);
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setExpenseSaving(false);
        }
    };

    // Chiqimlar guruhlari to'liq serverda hisoblanadi (oy bo'yicha, sahifalashsiz).
    // Ilgari faqat tarixning birinchi 100 tasi olinib guruhlardi — yig'indi kam chiqardi.
    const fetchGroupData = useCallback(async (month) => {
        if (!month) return;
        setGroupLoading(true);
        setGroupError(null);
        try {
            const params = new URLSearchParams({ month });
            const resp = await api.get(`${GROUPS_URL}?${params.toString()}`);
            const data = resp.data?.data || {};
            setGroupData(data.groups || []);
            setGroupMeta({
                total: Number(data.total || 0),
                count: Number(data.count || 0),
                groupCount: Number(data.groupCount || 0),
                averagePerGroup: Number(data.averagePerGroup || 0),
                month: data.month || month,
                monthLabel: data.monthLabel || monthKeyToLabel(month),
                generatedAt: data.generatedAt || null,
            });
        } catch (err) {
            setGroupError(err.response?.data?.message || err.message || 'Maʼlumotlarni yuklashda xatolik');
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
        // Server qaysi oyni "joriy" deb hisoblasa — o'shani tanlaymiz.
        if (serverCurrentMonth && serverCurrentMonth !== selectedMonth) {
            setSelectedMonth(serverCurrentMonth);
        }
        setGroupModalOpen(true);
    };

    const closeGroupModal = () => {
        setGroupModalOpen(false);
        setGroupData([]);
        setGroupMeta(null);
        setGroupError(null);
    };

    const handleMonthChange = (e) => {
        setSelectedMonth(e.target.value);
    };

    const goToDetail = (id) => {
        navigate(`/kassa/${id}`);
    };

    const closeDetail = () => {
        navigate('/kassa');
    };

    const openEditModal = (tx) => {
        setEditTransaction(tx);
        setEditReason(tx?.reason || tx?.source || '');
        setEditErrors({});
        setEditModalOpen(true);
    };

    const closeEditModal = () => {
        if (editSaving) return;
        setEditModalOpen(false);
        setEditTransaction(null);
        setEditReason('');
        setEditErrors({});
    };

    const handleEditChange = (e) => {
        setEditReason(e.target.value);
        setEditErrors((prev) => ({ ...prev, reason: undefined }));
    };

    const validateEdit = () => {
        const errors = {};
        if (!editReason.trim()) {
            errors.reason = 'Izoh maydoni bo‘sh bo‘lishi mumkin emas.';
        }
        setEditErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleEditSubmit = async (e) => {
        e.preventDefault();
        if (!validateEdit()) {
            showToast('Iltimos, xatoliklarni tuzating.', 'error');
            return;
        }
        if (!editTransaction) return;

        setEditSaving(true);
        try {
            await api.patch(`${HISTORY_URL}/${editTransaction._id}`, {
                reason: editReason.trim(),
            });
            showToast('Izoh muvaffaqiyatli yangilandi.', 'success');
            await mutateHistory();
            await mutateBalance();
            await mutateSummary();
            closeEditModal();
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'Xatolik yuz berdi.', 'error');
        } finally {
            setEditSaving(false);
        }
    };

    const handleEditFromDetail = () => {
        if (selectedTransaction) {
            openEditModal(selectedTransaction);
        }
    };

    const requestDeleteTransaction = (tx) => {
        setConfirmState({
            type: 'delete-transaction',
            payload: tx,
        });
    };

    const handleConfirmDelete = async () => {
        if (!confirmState || confirmState.type !== 'delete-transaction') return;
        const { payload } = confirmState;
        try {
            await api.delete(`/kassa/del/${payload._id}`);
            showToast('Operatsiya o‘chirildi.', 'success');
            if (transactionId && payload._id === transactionId) {
                navigate('/kassa');
            }
            await mutateBalance();
            await mutateHistory();
            await mutateSummary();
        } catch (err) {
            showToast(err.response?.data?.message || err.message || 'O‘chirishda xatolik.', 'error');
        } finally {
            setConfirmState(null);
        }
    };

    const isLoading = balanceLoading || historyLoading;

    if (transactionId) {
        if (historyLoading) {
            return (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                        <p className="text-gray-500">Yuklanmoqda...</p>
                    </div>
                </div>
            );
        }

        if (!selectedTransaction) {
            return (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white max-w-md w-full rounded-2xl shadow-2xl p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Operatsiya topilmadi</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Joriy ro‘yxatda bunday ID ga ega operatsiya mavjud emas.
                        </p>
                        <button
                            onClick={closeDetail}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                        >
                            Kassa ro‘yxatiga qaytish
                        </button>
                    </div>
                </div>
            );
        }

        const transaction = selectedTransaction;
        const isIncome = transaction.type === 'KIRIM';
        const dateStr = transaction.createdAt
            ? new Date(transaction.createdAt).toLocaleString('uz-UZ', {
                day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
            })
            : '-';

        return (
            <div
                className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
                onClick={closeDetail}
            >
                <div
                    className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={closeDetail}
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1 rounded-full hover:bg-gray-100"
                    >
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-3 mb-5">
                        <div className={`p-3 rounded-xl ${isIncome ? 'bg-green-100' : 'bg-red-100'}`}>
                            {isIncome ? (
                                <ArrowUpCircle className="w-6 h-6 text-green-600" />
                            ) : (
                                <ArrowDownCircle className="w-6 h-6 text-red-600" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">
                                {isIncome ? 'Kirim' : 'Chiqim'} #{transaction._id.slice(-6)}
                            </h2>
                            <p className="text-sm text-gray-500">{dateStr}</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-xl">
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Turi</p>
                                <p className="text-sm font-semibold text-gray-900">{transaction.type}</p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Summa</p>
                                <p className={`text-lg font-bold ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                    {isIncome ? '+' : '-'}{Number(transaction.amount).toLocaleString()} $
                                </p>
                            </div>
                            {transaction.balanceAfter !== undefined && (
                                <div>
                                    <p className="text-xs text-gray-500 font-medium">Balans (keyin)</p>
                                    <p className="text-sm font-semibold text-gray-900">
                                        {Number(transaction.balanceAfter).toLocaleString()} $
                                    </p>
                                </div>
                            )}
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Kim tomonidan</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {transaction.user?.name || 'Noma\'lum'}
                                </p>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-gray-500 font-medium">Izoh / Manba</p>
                                <button
                                    onClick={handleEditFromDetail}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                                >
                                    <Pencil size={14} /> Tahrirlash
                                </button>
                            </div>
                            <div className="mt-1 p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 whitespace-pre-wrap">
                                {transaction.reason || transaction.source || '-'}
                            </div>
                        </div>

                        {transaction.client && (
                            <div>
                                <div className="flex items-center justify-between gap-5">
                                    <p className="text-xs text-gray-500 font-medium">Mijoz</p>
                                    <button onClick={() => navigate(`/clients/${transaction.client._id}`)} className='cursor-pointer'><Info size={20} color='blue' /></button>
                                </div>
                                <p className="text-sm font-semibold text-gray-900">
                                    {transaction.client.name} ({transaction.client.phone || '-'})
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                        <button
                            onClick={closeDetail}
                            className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                        >
                            Yopish
                        </button>
                        <button
                            onClick={handleEditFromDetail}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition flex items-center gap-2"
                        >
                            <Pencil size={16} /> Tahrirlash
                        </button>
                        <button
                            onClick={() => {
                                const html = buildKassaHistoryPrintHtml({
                                    transactions: [transaction],
                                    typeFilter: '',
                                    fromDate: '',
                                    toDate: '',
                                    balance: balance,
                                });
                                printHtmlDocument(html, () => showToast('Chop etishda xatolik.', 'error'));
                            }}
                            className="px-5 py-2.5 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium shadow-sm transition flex items-center gap-2"
                        >
                            <Printer size={16} /> Chop etish
                        </button>
                        <button
                            onClick={() => requestDeleteTransaction(transaction)}
                            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium shadow-sm transition flex items-center gap-2"
                        >
                            <Trash2 size={16} /> O‘chirish
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen font-sans">
            <div className="mx-auto px-4 sm:px-6 py-6">
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
                        label={summary ? `${summary.monthLabel} kirimi` : 'Shu oygi Kirim'}
                        value={summaryLoading && !summary ? undefined : summary?.income ?? 0}
                        color="green"
                        subValue={
                            summary?.change
                                ? `Jami tushumlar · o‘tgan oyga nisbatan ${summary.change.incomePercent > 0 ? '+' : ''}${summary.change.incomePercent}%`
                                : 'Jami tushumlar (server hisobida)'
                        }
                    />
                    <StatCard
                        icon={ArrowDownCircle}
                        label={summary ? `${summary.monthLabel} chiqimi` : 'Shu oygi Chiqim'}
                        value={summaryLoading && !summary ? undefined : summary?.expense ?? 0}
                        color="red"
                        subValue={
                            summary?.change
                                ? `Jami xarajatlar · o‘tgan oyga nisbatan ${summary.change.expensePercent > 0 ? '+' : ''}${summary.change.expensePercent}%`
                                : 'Jami xarajatlar (server hisobida)'
                        }
                    />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-col md:flex-row gap-3 md:items-center shadow-sm">
                    <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); }}
                            placeholder="Izoh yoki manba bo‘yicha qidirish..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        />
                    </div>
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
                    {(typeFilter || fromDate || toDate || searchTerm) && (
                        <button
                            onClick={clearFilters}
                            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition whitespace-nowrap"
                        >
                            Filtrni tozalash
                        </button>
                    )}
                </div>

                {historySummary && (
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 bg-white rounded-xl border border-gray-200 px-5 py-3 mb-4 shadow-sm text-sm">
                        <span className="text-gray-500">
                            Joriy filtr bo‘yicha: <span className="font-semibold text-gray-900">{historySummary.count}</span> ta operatsiya
                        </span>
                        <span className="text-gray-500">
                            Kirim: <span className="font-semibold text-green-600">+{Number(historySummary.income || 0).toLocaleString()} $</span>
                        </span>
                        <span className="text-gray-500">
                            Chiqim: <span className="font-semibold text-red-600">-{Number(historySummary.expense || 0).toLocaleString()} $</span>
                        </span>
                        <span className="text-gray-500">
                            Sof: <span className={`font-semibold ${historySummary.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {historySummary.net >= 0 ? '+' : ''}{Number(historySummary.net || 0).toLocaleString()} $
                            </span>
                        </span>
                        <span className="ml-auto text-xs text-gray-400">Hisob-kitob serverda (sahifadagi qatorlar emas)</span>
                    </div>
                )}

                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                    {(historyError || balanceError || (!summaryLoading && summaryError)) ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
                            <p className="text-gray-700 font-medium mb-1">Maʼlumotlarni yuklab bo‘lmadi</p>
                            <p className="text-sm text-gray-500 mb-4">
                                {historyError?.response?.data?.message || balanceError?.response?.data?.message || summaryError?.response?.data?.message || 'Server bilan bog‘lanishda xatolik.'}
                            </p>
                            <button
                                onClick={() => { mutateBalance(); mutateHistory(); mutateSummary(); }}
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
                                        <th className="px-6 py-4 font-semibold text-right">Amallar</th>
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
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-8 ml-auto" /></td>
                                            </tr>
                                        ))
                                    ) : filteredTransactions.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-16 text-center">
                                                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                                <p className="text-gray-600 font-medium mb-1">Operatsiyalar topilmadi</p>
                                                <p className="text-sm text-gray-400">
                                                    {typeFilter || fromDate || toDate || searchTerm ? 'Filtrlash shartlariga mos operatsiya yo‘q.' : 'Hali hech qanday operatsiya qayd etilmagan.'}
                                                </p>
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTransactions.map((tx) => {
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
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => goToDetail(tx._id)}
                                                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                                                                title="Batafsil"
                                                            >
                                                                <Eye size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => openEditModal(tx)}
                                                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                                                                title="Tahrirlash"
                                                            >
                                                                <Pencil size={18} />
                                                            </button>
                                                            <button
                                                                onClick={() => requestDeleteTransaction(tx)}
                                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                                                title="O‘chirish"
                                                            >
                                                                <Trash2 size={18} />
                                                            </button>
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

                    {!historyError && transactions.length > 0 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50/50">
                            <span className="text-sm text-gray-500">
                                Sahifa <span className="font-medium text-gray-900">{page}</span> / {totalPages}
                                <span className="text-gray-400"> · jami {Number(meta.total || 0).toLocaleString()} ta yozuv</span>
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
                                    <div className="relative">
                                        <textarea
                                            name="reason"
                                            rows="3"
                                            value={expenseForm.reason}
                                            onChange={handleExpenseChange}
                                            onFocus={() => setSuggestionOpen(true)}
                                            onBlur={() => setTimeout(() => setSuggestionOpen(false), 120)}
                                            className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition resize-none ${expenseErrors.reason ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-red-500'}`}
                                            placeholder="Masalan: Ofis anjomlari uchun..."
                                        />
                                        {suggestionOpen && filteredExpenseSuggestions.length > 0 && (
                                            <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl">
                                                {filteredExpenseSuggestions.map((s, idx) => (
                                                    <button
                                                        key={`${s.reason}-${idx}`}
                                                        type="button"
                                                        onMouseDown={() => pickExpenseSuggestion(s.reason)}
                                                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-gray-50"
                                                    >
                                                        <span className="text-gray-800 truncate">{s.reason}</span>
                                                        <span className="shrink-0 text-xs font-medium text-gray-400">{Number(s.count || 0)}x</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
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
                                    {groupMeta?.monthLabel || monthKeyToLabel(selectedMonth)} — chiqimlar sabab (izoh) bo‘yicha,
                                    to‘liq server hisobida (sahifalashga bog‘liq emas)
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

                            {!groupLoading && groupMeta && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                        <p className="text-xs text-gray-500">Jami chiqim</p>
                                        <p className="text-base font-bold text-red-600">{Number(groupMeta.total).toLocaleString()} $</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                        <p className="text-xs text-gray-500">Operatsiyalar</p>
                                        <p className="text-base font-bold text-gray-900">{Number(groupMeta.count).toLocaleString()} ta</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                        <p className="text-xs text-gray-500">Guruhlar</p>
                                        <p className="text-base font-bold text-gray-900">{Number(groupMeta.groupCount).toLocaleString()} ta</p>
                                    </div>
                                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                        <p className="text-xs text-gray-500">O‘rtacha guruh</p>
                                        <p className="text-base font-bold text-gray-900">{Number(groupMeta.averagePerGroup).toLocaleString()} $</p>
                                    </div>
                                </div>
                            )}

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
                                                <th className="px-4 py-3 text-right font-semibold text-gray-600">Soni</th>
                                                <th className="px-4 py-3 text-right font-semibold text-gray-600">Jami summa ($)</th>
                                                <th className="px-4 py-3 text-right font-semibold text-gray-600">Ulush</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {groupData.map((item) => (
                                                <tr key={item.key ?? item.label} className="hover:bg-gray-50 transition">
                                                    <td className="px-4 py-3 text-gray-800 font-medium">{item.label || item.note}</td>
                                                    <td className="px-4 py-3 text-right text-gray-600">{Number(item.count || 0).toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right font-bold text-red-600">
                                                        {Number(item.total || 0).toLocaleString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-gray-500">{Number(item.percent || 0)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                                            <tr>
                                                <td className="px-4 py-3 font-bold text-gray-800">Jami</td>
                                                <td className="px-4 py-3 text-right font-bold text-gray-700">
                                                    {Number(groupMeta?.count ?? groupData.reduce((sum, item) => sum + Number(item.count || 0), 0)).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-red-700">
                                                    {Number(groupMeta?.total ?? groupData.reduce((sum, item) => sum + Number(item.total || 0), 0)).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-gray-700">100%</td>
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

                {editModalOpen && editTransaction && (
                    <div
                        className="fixed inset-0 z-[300] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm"
                        onClick={closeEditModal}
                    >
                        <div
                            className="bg-white w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto p-6 relative pointer-events-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={closeEditModal}
                                className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 disabled:opacity-40 p-1 rounded-full hover:bg-gray-100"
                                disabled={editSaving}
                            >
                                <X size={20} />
                            </button>

                            <div className="mb-5">
                                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <Pencil size={22} className="text-blue-600" />
                                    Izohni tahrirlash
                                </h2>
                                <p className="text-sm text-gray-500 mt-1">
                                    #{editTransaction._id.slice(-6)} - {editTransaction.type} ({Number(editTransaction.amount).toLocaleString()} $)
                                </p>
                            </div>

                            <form onSubmit={handleEditSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                        Izoh / Manba <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        name="reason"
                                        rows="4"
                                        value={editReason}
                                        onChange={handleEditChange}
                                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition resize-none ${editErrors.reason ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-blue-500'}`}
                                        placeholder="Yangi izoh matnini kiriting..."
                                        autoFocus
                                    />
                                    {editErrors.reason && (
                                        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                                            <AlertCircle size={12} /> {editErrors.reason}
                                        </p>
                                    )}
                                </div>

                                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={closeEditModal}
                                        disabled={editSaving}
                                        className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition text-sm font-medium disabled:opacity-50"
                                    >
                                        Bekor qilish
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={editSaving}
                                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-md shadow-blue-200 transition disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-2"
                                    >
                                        {editSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                        <Save size={16} /> Saqlash
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <ConfirmDialog
                    open={!!confirmState}
                    title="Operatsiyani o‘chirish"
                    message={
                        confirmState?.payload
                            ? `“${confirmState.payload.reason || confirmState.payload.source || 'Izohsiz'}” operatsiyasini o‘chirishni tasdiqlaysizmi?`
                            : ''
                    }
                    confirmLabel="O‘chirish"
                    danger={true}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setConfirmState(null)}
                />

                <Toast toast={toast} onClose={() => setToast(null)} />
            </div>
        </div>
    );
};