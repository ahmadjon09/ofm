/**
 * Klient tomonidagi davr (period) yordamchilari — Dashboard va Buyurtmalar
 * sahifalari bir xil tilda gapiradi: "Shu oy" / "O'tgan oy" / "Barcha vaqt".
 *
 * MUHIM: sana kalitlari (`YYYY-MM-DD`) brauzerning MAHALLIY vaqti bo'yicha
 * hisoblanadi, server esa ularni biznes mintaqasi (UTC+5) bo'yicha talqin
 * qiladi. Shu tariqa "shu oy" chegaralari foydalanuvchi ko'radigan kalendar
 * bilan mos tushadi.
 */

export const UZ_MONTHS = [
    'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
    'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

export const PERIOD_PRESETS = [
    { id: 'current-month', label: 'Shu oy', hint: 'Oyning 1-kunidan bugungacha' },
    { id: 'previous-month', label: "O'tgan oy", hint: "O'tgan oyning to'liq davri" },
    { id: 'all', label: 'Barcha vaqt', hint: 'Barcha buyurtmalar tarixi' },
];

const pad = (value) => String(value).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' (mahalliy vaqt) */
export function toDateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Oyning birinchi kuni kaliti. `monthOffset` = 0 joriy oy, -1 o'tgan oy. */
export function startOfMonthKey(now = new Date(), monthOffset = 0) {
    return toDateKey(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1));
}

/** Oyning oxirgi kuni kaliti. */
export function endOfMonthKey(now = new Date(), monthOffset = 0) {
    return toDateKey(new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0));
}

export function todayKey(now = new Date()) {
    return toDateKey(now);
}

/** Preset uchun aniq sana oralig'i. */
export function rangeForPreset(preset, now = new Date()) {
    if (preset === 'current-month') {
        return { startDate: startOfMonthKey(now, 0), endDate: todayKey(now) };
    }
    if (preset === 'previous-month') {
        return { startDate: startOfMonthKey(now, -1), endDate: endOfMonthKey(now, -1) };
    }
    return { startDate: '', endDate: '' };
}

function parseDateKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * 'YYYY-MM-DD' oralig'ini odam o'qiydigan ko'rinishga keltiradi:
 *   "1–31 oktabr 2026", "25 sentabr – 5 oktabr 2026", "1–15 oktabr"
 */
export function formatDateRangeLabel(startKey, endKey, { withYear = true } = {}) {
    const start = parseDateKey(startKey);
    const end = parseDateKey(endKey) || start;
    if (!start) return '';
    const month = (value) => UZ_MONTHS[value - 1] || '';
    const year = withYear ? ` ${end.year}` : '';

    if (start.year === end.year && start.month === end.month) {
        if (start.day === end.day) return `${start.day} ${month(start.month)}${year}`;
        return `${start.day}–${end.day} ${month(end.month)}${year}`;
    }
    if (start.year === end.year) {
        return `${start.day} ${month(start.month)} – ${end.day} ${month(end.month)}${year}`;
    }
    return `${start.day} ${month(start.month)} ${start.year} – ${end.day} ${month(end.month)} ${end.year}`;
}

/** Tanlangan preset uchun izoh matni (filtr tugmalari ostida). */
export function presetCaption(preset, now = new Date()) {
    if (preset === 'current-month') {
        return `1-${UZ_MONTHS[now.getMonth()]}dan bugungacha`;
    }
    if (preset === 'previous-month') {
        return `O'tgan oyning to'liq davri`;
    }
    return 'Barcha buyurtmalar tarixi';
}
