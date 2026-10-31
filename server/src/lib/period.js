import { ApiError } from './helpers.js';
import {
    UZ_MONTH_NAMES,
    currentMonthKey,
    formatDayKey,
    getTimezoneLabel,
    getTimezoneOffsetMinutes,
    localDateToUtcInstant,
    localParts,
    monthKeyRange,
    normalizeMonthKey,
    parseRangeBoundary,
    resolveMonthQuery,
    shiftMonthKey,
} from './datetime.js';

/**
 * Davr (time range) yordamchisi — Dashboard va Buyurtmalar uchun yagona manba.
 *
 * Mantiq (oddiy foydalanuvchi uchun):
 *   - Hech qanday parametr berilmasa  -> JORIY OY (oyning 1-kunidan bugungi kungacha).
 *   - range=current-month             -> Joriy oy (1-kunidan bugungacha)
 *   - range=previous-month            -> O'tgan oy (to'liq)
 *   - range=all                       -> Barcha vaqt
 *   - range=custom + startDate/endDate -> Aniq davr (YYYY-MM-DD).
 *   - Faqat startDate/endDate         -> Aniq davr (eski `from`/`to` ham qabul qilinadi).
 *   - month=YYYY-MM                   -> Eski klientlar uchun moslik.
 *
 * Ustuvorlik: preset (`range=...`) → `month` → sanalar → standart joriy oy.
 * Klient preset bilan birga `startDate`/`endDate` yuborishi mumkin (so'rov
 * o'z-o'zini izohlaydi), lekin preset chegaralari SERVERDA qayta hisoblanadi.
 *
 * Barcha chegaralar biznes vaqt mintaqasi (standart UTC+5, Toshkent) bo'yicha
 * hisoblanadi — shuning uchun kechqurun kiritilgan buyurtma ham to'g'ri oyga tushadi.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_MODES = {
    CURRENT_MONTH: 'current-month',
    PREVIOUS_MONTH: 'previous-month',
    MONTH: 'month',
    CUSTOM: 'custom',
    ALL: 'all',
    PREVIOUS: 'previous',
};

const PERIOD_MODE_LABELS = {
    'current-month': 'Joriy oy',
    'previous-month': "O'tgan oy",
    month: 'Tanlangan oy',
    custom: 'Tanlangan davr',
    all: 'Barcha vaqt',
    previous: 'Taqqoslash davri',
};

const ALL_TIME_ALIASES = new Set(['all', 'all-time', 'alltime', 'all_time', 'hammasi', 'barchasi']);
const PREVIOUS_MONTH_ALIASES = new Set(['previous-month', 'prev-month', 'last-month', 'previousmonth', 'otgan-oy']);
const CURRENT_MONTH_ALIASES = new Set(['current-month', 'this-month', 'currentmonth', 'shu-oy']);
const CUSTOM_ALIASES = new Set(['custom', 'range', 'tanlangan']);

function trimParam(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthName(month) {
    return (UZ_MONTH_NAMES[month - 1] || '').toLowerCase();
}

/** Mahalliy kun chegaralari: bugunning boshlanishi va ertaganing boshlanishi (eksklyuziv). */
function localDayBounds(now, offsetMinutes) {
    const parts = localParts(now, offsetMinutes);
    return {
        start: localDateToUtcInstant(parts.year, parts.month, parts.day, offsetMinutes),
        nextStart: localDateToUtcInstant(parts.year, parts.month, parts.day + 1, offsetMinutes),
    };
}

/**
 * Davr obyektini quradi: label, startDate, endDate, days va h.k.
 */
function buildRange({ mode, start = null, endExclusive = null, monthKey = null }, { now = new Date(), offsetMinutes = getTimezoneOffsetMinutes() } = {}) {
    const timezoneLabel = getTimezoneLabel(offsetMinutes);

    if (!start || !endExclusive) {
        return {
            mode,
            modeLabel: PERIOD_MODE_LABELS[mode] || PERIOD_MODE_LABELS.custom,
            monthKey: null,
            label: 'Barcha vaqt',
            shortLabel: 'Barcha vaqt',
            start: null,
            endExclusive: null,
            startDate: null,
            endDate: null,
            days: null,
            isCurrentMonth: false,
            includesToday: true,
            timezoneLabel,
        };
    }

    const startParts = localParts(start, offsetMinutes);
    const endParts = localParts(new Date(endExclusive.getTime() - 1), offsetMinutes);
    const sameMonth = startParts.year === endParts.year && startParts.month === endParts.month;
    const sameYear = startParts.year === endParts.year;

    let label;
    if (sameMonth) {
        const isWholeMonth = startParts.day === 1 && endParts.day === daysInMonth(endParts.year, endParts.month);
        if (isWholeMonth) {
            label = `1–${endParts.day} ${monthName(endParts.month)} ${endParts.year}`;
        } else if (startParts.day === endParts.day) {
            label = `${startParts.day} ${monthName(endParts.month)} ${endParts.year}`;
        } else {
            label = `${startParts.day}–${endParts.day} ${monthName(endParts.month)} ${endParts.year}`;
        }
    } else if (sameYear) {
        label = `${startParts.day} ${monthName(startParts.month)} – ${endParts.day} ${monthName(endParts.month)} ${endParts.year}`;
    } else {
        label = `${startParts.day} ${monthName(startParts.month)} ${startParts.year} – ${endParts.day} ${monthName(endParts.month)} ${endParts.year}`;
    }

    const shortLabel = sameMonth
        ? (startParts.day === endParts.day
            ? `${startParts.day} ${monthName(endParts.month)}`
            : `${startParts.day}–${endParts.day} ${monthName(endParts.month)}`)
        : label;

    const key = monthKey || (sameMonth ? `${endParts.year}-${String(endParts.month).padStart(2, '0')}` : null);

    return {
        mode,
        modeLabel: PERIOD_MODE_LABELS[mode] || PERIOD_MODE_LABELS.custom,
        monthKey: key,
        monthLabel: sameMonth ? `${UZ_MONTH_NAMES[endParts.month - 1]} ${endParts.year}` : null,
        label,
        shortLabel,
        start,
        endExclusive,
        startDate: formatDayKey(start, offsetMinutes),
        endDate: formatDayKey(new Date(endExclusive.getTime() - 1), offsetMinutes),
        days: Math.max(Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS), 1),
        isCurrentMonth: key === currentMonthKey(now, offsetMinutes),
        includesToday: start.getTime() <= now.getTime() && now.getTime() < endExclusive.getTime(),
        timezoneLabel,
    };
}

/**
 * So'rov parametrlaridan davrni aniqlaydi. Noto'g'ri qiymatlar uchun 400 xatolik beradi.
 * @returns {{mode:string,label:string,start:Date|null,endExclusive:Date|null,...}}
 */
function resolvePeriodRange(query = {}, { now = new Date(), offsetMinutes = getTimezoneOffsetMinutes() } = {}) {
    const rawRange = trimParam(query.range ?? query.period).toLowerCase();
    const rawStart = trimParam(query.startDate ?? query.start ?? query.from);
    const rawEnd = trimParam(query.endDate ?? query.end ?? query.to);
    const rawMonth = trimParam(query.month);
    const currentKey = currentMonthKey(now, offsetMinutes);
    const { nextStart: todayEndExclusive } = localDayBounds(now, offsetMinutes);

    /**
     * Aniq sanalar bilan ishlaydigan yordamchi.
     * Klient `startDate`/`endDate` yuboradi; faqat bittasi bo'lsa to'ldiramiz.
     */
    const buildCustomRange = () => {
        const startInstant = rawStart ? parseRangeBoundary(rawStart, { isEnd: false, offsetMinutes }) : null;
        if (rawStart && !startInstant) {
            throw new ApiError(400, `Boshlanish sanasi noto'g'ri: "${rawStart}". YYYY-MM-DD ko'rinishida yuboring (masalan 2026-10-01).`);
        }

        const endInstant = rawEnd ? parseRangeBoundary(rawEnd, { isEnd: true, offsetMinutes }) : null;
        if (rawEnd && !endInstant) {
            throw new ApiError(400, `Tugash sanasi noto'g'ri: "${rawEnd}". YYYY-MM-DD ko'rinishida yuboring (masalan 2026-10-31).`);
        }

        let start = startInstant;
        let endExclusive = endInstant;

        if (start && !endExclusive) {
            endExclusive = start.getTime() < now.getTime() ? todayEndExclusive : new Date(start.getTime() + DAY_MS);
        }
        if (!start && endExclusive) {
            const endParts = localParts(new Date(endExclusive.getTime() - 1), offsetMinutes);
            start = localDateToUtcInstant(endParts.year, endParts.month, 1, offsetMinutes);
        }
        if (!start || !endExclusive) {
            throw new ApiError(400, "Sana oralig'i ko'rsatilmagan. startDate va endDate yuboring.");
        }

        if (start.getTime() >= endExclusive.getTime()) {
            throw new ApiError(400, "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas.");
        }

        return buildRange({ mode: PERIOD_MODES.CUSTOM, start, endExclusive }, { now, offsetMinutes });
    };

    const currentMonthRange = () => {
        const fullMonth = monthKeyRange(currentKey, offsetMinutes);
        const endExclusive = new Date(Math.min(fullMonth.endExclusive.getTime(), todayEndExclusive.getTime()));
        return buildRange(
            { mode: PERIOD_MODES.CURRENT_MONTH, start: fullMonth.start, endExclusive, monthKey: currentKey },
            { now, offsetMinutes }
        );
    };

    const previousMonthRange = () => {
        const prevKey = shiftMonthKey(currentKey, -1);
        const prevRange = monthKeyRange(prevKey, offsetMinutes);
        return buildRange(
            { mode: PERIOD_MODES.PREVIOUS_MONTH, start: prevRange.start, endExclusive: prevRange.endExclusive, monthKey: prevKey },
            { now, offsetMinutes }
        );
    };

    // 1) Aniq "barcha vaqt" so'rovi
    if (ALL_TIME_ALIASES.has(rawRange)) {
        return buildRange({ mode: PERIOD_MODES.ALL }, { now, offsetMinutes });
    }

    // 2) Ataylab tanlangan aniq davr (range=custom + startDate/endDate)
    if (CUSTOM_ALIASES.has(rawRange)) {
        if (!rawStart && !rawEnd) {
            throw new ApiError(400, "Aniq davr uchun startDate va endDate ko'rsatilishi shart (YYYY-MM-DD).");
        }
        return buildCustomRange();
    }

    // 3) Preset'lar — chegaralar SERVERDA hisoblanadi (vaqt mintaqasi xavfsiz).
    // Klient startDate/endDate ni ham yuborishi mumkin, lekin preset ustuvor.
    if (PREVIOUS_MONTH_ALIASES.has(rawRange)) return previousMonthRange();
    if (CURRENT_MONTH_ALIASES.has(rawRange)) return currentMonthRange();

    // 4) Eski `month=YYYY-MM` (yoki month=9&year=2026) parametri
    if (rawMonth && !normalizeMonthKey(rawMonth) && !/^\d{1,2}$/.test(rawMonth)) {
        throw new ApiError(400, `Oy formati noto'g'ri: "${rawMonth}". YYYY-MM ko'rinishida yuboring (masalan: 2026-09).`);
    }
    const monthKey = rawMonth ? resolveMonthQuery(query, { now, offsetMinutes }) : null;
    if (rawMonth && !monthKey) {
        throw new ApiError(400, `Oy formati noto'g'ri: "${rawMonth}". YYYY-MM ko'rinishida yuboring (masalan: 2026-09).`);
    }
    if (monthKey) {
        const fullMonth = monthKeyRange(monthKey, offsetMinutes);
        if (monthKey === currentKey) return currentMonthRange();
        if (monthKey === shiftMonthKey(currentKey, -1)) return previousMonthRange();
        return buildRange(
            { mode: PERIOD_MODES.MONTH, start: fullMonth.start, endExclusive: fullMonth.endExclusive, monthKey },
            { now, offsetMinutes }
        );
    }

    // 5) Hech qanday preset yo'q, lekin sanalar berilgan (masalan eski from/to)
    if (rawStart || rawEnd) {
        return buildCustomRange();
    }

    // 6) STANDART: JORIY OY (1-kunidan bugungacha)
    return currentMonthRange();
}

/**
 * Taqqoslash (o'sish foizi) uchun oldingi davr.
 * - Joriy oy -> o'tgan oyning xuddi shu kunlarigacha (oy boshidan bugungacha).
 * - O'tgan oy / tanlangan oy -> oldingi to'liq oy.
 * - Aniq davr -> oldingi xuddi shu uzunlikdagi davr.
 * - Barcha vaqt -> taqqoslash yo'q (null).
 */
function previousPeriodRange(range, { now = new Date(), offsetMinutes = getTimezoneOffsetMinutes() } = {}) {
    if (!range || !range.start || !range.endExclusive || range.mode === PERIOD_MODES.ALL) return null;

    const lengthMs = Math.max(range.endExclusive.getTime() - range.start.getTime(), DAY_MS);

    if (range.mode === PERIOD_MODES.CURRENT_MONTH || range.mode === PERIOD_MODES.PREVIOUS_MONTH || range.mode === PERIOD_MODES.MONTH) {
        const anchorKey = range.monthKey || currentMonthKey(range.start, offsetMinutes);
        const prevKey = shiftMonthKey(anchorKey, -1);
        const prevMonth = monthKeyRange(prevKey, offsetMinutes);
        const prevParts = localParts(prevMonth.start, offsetMinutes);
        const maxDays = daysInMonth(prevParts.year, prevParts.month);

        // Joriy oy uchun — bugungacha bo'lgan kunlar soni bilan bir xil kesim.
        // To'liq (tugagan) oy uchun — o'sha oyning barcha kunlari.
        const isOngoing = range.mode === PERIOD_MODES.CURRENT_MONTH && range.isCurrentMonth;
        const days = isOngoing ? Math.min(range.days, maxDays) : maxDays;
        const endExclusive = localDateToUtcInstant(prevParts.year, prevParts.month, days + 1, offsetMinutes);

        return buildRange({ mode: PERIOD_MODES.PREVIOUS, start: prevMonth.start, endExclusive, monthKey: prevKey }, { now, offsetMinutes });
    }

    const endExclusive = range.start;
    const start = new Date(range.start.getTime() - lengthMs);
    return buildRange({ mode: PERIOD_MODES.PREVIOUS, start, endExclusive }, { now, offsetMinutes });
}

/** Taqqoslash izohi — foydalanuvchi kartochkada ko'radigan matn. */
function comparisonLabel(range) {
    if (!range) return null;
    if (range.mode === PERIOD_MODES.CURRENT_MONTH) return "O'tgan oyning shu kunlariga nisbatan";
    if (range.mode === PERIOD_MODES.PREVIOUS_MONTH || range.mode === PERIOD_MODES.MONTH) return "O'tgan oyga nisbatan";
    if (range.mode === PERIOD_MODES.CUSTOM) return "Oldingi shu uzunlikdagi davrga nisbatan";
    return null;
}

/** API javobiga qo'yish uchun xavfsiz (serializable) ko'rinish. */
function serializeRange(range) {
    if (!range) return null;
    return {
        mode: range.mode,
        modeLabel: range.modeLabel,
        label: range.label,
        shortLabel: range.shortLabel,
        monthKey: range.monthKey,
        monthLabel: range.monthLabel || null,
        startDate: range.startDate,
        endDate: range.endDate,
        start: range.start ? range.start.toISOString() : null,
        end: range.endExclusive ? new Date(range.endExclusive.getTime() - 1).toISOString() : null,
        endExclusive: range.endExclusive ? range.endExclusive.toISOString() : null,
        days: range.days,
        isCurrentMonth: !!range.isCurrentMonth,
        includesToday: !!range.includesToday,
        timezoneLabel: range.timezoneLabel,
    };
}

export {
    PERIOD_MODES,
    PERIOD_MODE_LABELS,
    resolvePeriodRange,
    previousPeriodRange,
    comparisonLabel,
    serializeRange,
};
