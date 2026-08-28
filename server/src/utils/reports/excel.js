import ExcelJS from 'exceljs';
import { REPORT_COLORS, STATUS_LABELS_UZ, formatMoney } from './shared.js';
function styleExcelTitle(sheet, title, subtitle, colSpan) {
    sheet.mergeCells(1, 1, 1, colSpan);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.headerBg}` } };
    sheet.getRow(1).height = 26;

    if (subtitle) {
        sheet.mergeCells(2, 1, 2, colSpan);
        const subCell = sheet.getCell(2, 1);
        subCell.value = subtitle;
        subCell.font = { italic: true, size: 10, color: { argb: 'FF555555' } };
        sheet.getRow(2).height = 18;
    }
}

function styleExcelHeaderRow(row) {
    row.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.tableHeaderBg}` } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
    });
}

function stripeExcelRow(row, index) {
    if (index % 2 === 0) {
        row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.stripeBg}` } };
        });
    }
}
async function buildOrdersExcel({ month, year, monthName, orders, totalOrders, totalRevenue, completed, pending, cancelled, totalKg, totalBoxes }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`${monthName}_${year}`.slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 4 }],
    });

    styleExcelTitle(
        sheet,
        `BUYURTMALAR HISOBOTI — ${monthName.toUpperCase()} ${year}`,
        `Jami buyurtmalar: ${totalOrders}  |  Jami summa: ${formatMoney(totalRevenue)} $  |  Jami: ${totalBoxes} quti / ${totalKg} kg  |  Bajarilgan: ${completed}  |  Kutilmoqda: ${pending}  |  Bekor qilingan: ${cancelled}`,
        11
    );
    sheet.addRow([]);

    const headerRow = sheet.addRow(['№', 'Sana', 'Mijoz', 'Telefon', 'Mahsulot', "Razmer", 'Quti (dona)', "1 quti (kg)", 'Miqdor (kg)', 'Narx/kg', 'Summa', 'Status']);
    styleExcelHeaderRow(headerRow);

    const firstDataRow = sheet.rowCount + 1;
    let orderIndex = 0;
    orders.forEach((order) => {
        orderIndex += 1;
        order.items.forEach((item, i) => {
            const r = sheet.rowCount + 1;
            const hasBoxData = item.quantityBoxes != null && item.boxKg != null;
            const row = sheet.addRow([
                i === 0 ? orderIndex : '',
                i === 0 ? new Date(order.createdAt) : '',
                i === 0 ? (order.client?.name || '—') : '',
                i === 0 ? (order.client?.phone || '—') : '',
                item.productName,
                item.size,
                hasBoxData ? Number(item.quantityBoxes) : '',
                hasBoxData ? Number(item.boxKg) : '',
                hasBoxData ? { formula: `G${r}*H${r}` } : Number(item.quantityKg || 0),
                Number(item.pricePerKg || 0),
                { formula: `I${r}*J${r}` },
                i === 0 ? (STATUS_LABELS_UZ[order.status] || order.status) : '',
            ]);
            row.getCell(2).numFmt = 'dd.mm.yyyy';
            row.getCell(7).numFmt = '#,##0';
            row.getCell(8).numFmt = '#,##0.00';
            row.getCell(9).numFmt = '#,##0.00';
            row.getCell(10).numFmt = '#,##0.00';
            row.getCell(11).numFmt = '#,##0.00';
            stripeExcelRow(row, orderIndex);
        });
    });
    const lastDataRow = sheet.rowCount;

    if (lastDataRow >= firstDataRow) {
        sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: lastDataRow, column: 12 } };
    }

    sheet.addRow([]);
    const totalRowNum = sheet.rowCount + 1;
    const totalRow = sheet.addRow([
        '', '', '', '', '', 'JAMI:', { formula: `SUM(G${firstDataRow}:G${lastDataRow})` }, '',
        { formula: `SUM(I${firstDataRow}:I${lastDataRow})` }, '',
        { formula: `SUM(K${firstDataRow}:K${lastDataRow})` }, '',
    ]);
    totalRow.font = { bold: true };
    sheet.getCell(`F${totalRowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`G${totalRowNum}`).numFmt = '#,##0';
    sheet.getCell(`I${totalRowNum}`).numFmt = '#,##0.00';
    sheet.getCell(`K${totalRowNum}`).numFmt = '#,##0.00';

    sheet.columns = [
        { width: 5 }, { width: 12 }, { width: 22 }, { width: 15 },
        { width: 22 }, { width: 9 }, { width: 11 }, { width: 11 },
        { width: 12 }, { width: 11 }, { width: 15 }, { width: 14 },
    ];

    return workbook;
}

async function buildStockExcel({ rows, totalKg, totalValue, totalBoxes }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Ombordagi qoldiq');
    styleExcelTitle(
        sheet,
        "OMBORDAGI MAHSULOTLAR QOLDIG'I",
        `Jami: ${totalBoxes} quti / ${totalKg} kg  |  Jami qiymat: ${formatMoney(totalValue)} $  |  Sana: ${new Date().toLocaleDateString('uz-UZ')}`,
        8
    );
    sheet.addRow([]);

    const headerRow = sheet.addRow(['№', 'Mahsulot', 'Kategoriya', "Razmer", 'Quti (dona)', "1 quti (kg)", 'Jami (kg)', 'Qiymat ($)']);
    styleExcelHeaderRow(headerRow);

    const firstDataRow = sheet.rowCount + 1;
    rows.forEach((r, idx) => {
        const rn = sheet.rowCount + 1;
        const row = sheet.addRow([
            idx + 1,
            r.product,
            r.category,
            r.size,
            Number(r.boxes || 0),
            Number(r.boxKg || 0),
            { formula: `E${rn}*F${rn}` },
            { formula: `G${rn}*${Number(r.price || 0)}` },
        ]);
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0.00';
        row.getCell(7).numFmt = '#,##0.00';
        row.getCell(8).numFmt = '#,##0.00';
        stripeExcelRow(row, idx + 1);
    });
    const lastDataRow = sheet.rowCount;

    if (lastDataRow >= firstDataRow) {
        sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: lastDataRow, column: 8 } };
    }

    sheet.addRow([]);
    const totalRowNum = sheet.rowCount + 1;
    const totalRow = sheet.addRow([
        '', '', '', 'JAMI:', { formula: `SUM(E${firstDataRow}:E${lastDataRow})` }, '',
        { formula: `SUM(G${firstDataRow}:G${lastDataRow})` },
        { formula: `SUM(H${firstDataRow}:H${lastDataRow})` },
    ]);
    totalRow.font = { bold: true };
    sheet.getCell(`F${totalRowNum}`).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getCell(`E${totalRowNum}`).numFmt = '#,##0';
    sheet.getCell(`G${totalRowNum}`).numFmt = '#,##0.00';
    sheet.getCell(`H${totalRowNum}`).numFmt = '#,##0.00';

    sheet.columns = [
        { width: 5 }, { width: 24 }, { width: 16 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 13 }, { width: 16 },
    ];

    return workbook;
}

async function buildDebtsExcel({ debtors, totalDebt }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Mijozlar qarzi');
    styleExcelTitle(
        sheet,
        'MIJOZLARNING QARZDORLIGI',
        `Qarzdor mijozlar soni: ${debtors.length}  |  Jami qarz: ${formatMoney(totalDebt)} $  |  Sana: ${new Date().toLocaleDateString('uz-UZ')}`,
        6
    );
    sheet.addRow([]);

    const headerRow = sheet.addRow(['№', 'Mijoz', 'Telefon', 'Jami buyurtma', "Jami to'langan", 'Qarz ($)']);
    styleExcelHeaderRow(headerRow);

    const firstDataRow = sheet.rowCount + 1;
    debtors.forEach((c, idx) => {
        const totalPaid = (c.paymentHistory || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const row = sheet.addRow([
            idx + 1,
            c.name,
            c.phone,
            (c.orders || []).length,
            Number(totalPaid || 0),
            Number(c.debt || 0),
        ]);
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0.00';
        row.getCell(6).numFmt = '#,##0.00';
        stripeExcelRow(row, idx + 1);
    });
    const lastDataRow = sheet.rowCount;

    if (lastDataRow >= firstDataRow) {
        sheet.autoFilter = { from: { row: headerRow.number, column: 1 }, to: { row: lastDataRow, column: 6 } };
    }

    sheet.addRow([]);
    const totalRowNum = sheet.rowCount + 1;
    const totalRow = sheet.addRow(['', '', '', '', 'JAMI QARZ:', Number(totalDebt || 0)]);
    totalRow.font = { bold: true, color: { argb: `FF${REPORT_COLORS.danger}` } };
    sheet.getCell(`F${totalRowNum}`).numFmt = '#,##0.00';

    sheet.columns = [
        { width: 5 }, { width: 24 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 16 },
    ];

    return workbook;
}

function addSummarySection(sheet, title, colSpan) {
    sheet.addRow([]);
    const r = sheet.rowCount + 1;
    sheet.mergeCells(r, 1, r, colSpan);
    const cell = sheet.getCell(r, 1);
    cell.value = title;
    cell.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${REPORT_COLORS.headerBg}` } };
    sheet.getRow(r).height = 20;
    sheet.addRow([]);
}

async function buildSummaryExcel({ month, year, monthName, ordersData, stockData, debtsData, kassaBalance }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(`Hisobot_${monthName}_${year}`.slice(0, 31));
    const COL_SPAN = 11;

    styleExcelTitle(sheet, `OYLIK UMUMIY HISOBOT — ${monthName.toUpperCase()} ${year}`, `Yaratilgan sana: ${new Date().toLocaleDateString('uz-UZ')}`, COL_SPAN);

    addSummarySection(sheet, "1. UMUMIY KO'RSATKICHLAR", COL_SPAN);
    const kv = [
        ['Jami buyurtmalar soni', ordersData.totalOrders, 'number'],
        ['Jami savdo summasi', Number(ordersData.totalRevenue || 0), 'money'],
        ['Sotilgan', `${ordersData.totalBoxes} quti / ${ordersData.totalKg} kg`, 'text'],
        ['Bajarilgan buyurtmalar', ordersData.completed, 'number'],
        ['Kutilayotgan buyurtmalar', ordersData.pending, 'number'],
        ['Bekor qilingan buyurtmalar', ordersData.cancelled, 'number'],
        ['Ombordagi jami qoldiq', `${stockData.totalBoxes} quti / ${stockData.totalKg} kg`, 'text'],
        ['Ombordagi jami qiymat', Number(stockData.totalValue || 0), 'money'],
        ["Mijozlarning jami qarzi", Number(debtsData.totalDebt || 0), 'money'],
        ['Qarzdor mijozlar soni', debtsData.debtors.length, 'number'],
        ['Kassadagi joriy balans', Number(kassaBalance || 0), 'money'],
    ];
    kv.forEach(([label, value, kind], idx) => {
        const row = sheet.addRow([label, value]);
        row.getCell(1).font = { bold: true };
        if (kind === 'money') row.getCell(2).numFmt = '#,##0.00';
        if (kind === 'number') row.getCell(2).numFmt = '#,##0';
        stripeExcelRow(row, idx);
    });

    addSummarySection(sheet, `2. BUYURTMALAR — ${monthName.toUpperCase()} ${year}`, COL_SPAN);
    const ordersHeader = sheet.addRow(['№', 'Sana', 'Mijoz', 'Telefon', 'Mahsulot', "Razmer", 'Quti', 'Miqdor (kg)', 'Narx/kg', 'Summa', 'Status']);
    styleExcelHeaderRow(ordersHeader);
    const ordersFirst = sheet.rowCount + 1;
    let oi = 0;
    ordersData.orders.forEach((order) => {
        oi += 1;
        order.items.forEach((item, i) => {
            const row = sheet.addRow([
                i === 0 ? oi : '',
                i === 0 ? new Date(order.createdAt) : '',
                i === 0 ? (order.client?.name || '—') : '',
                i === 0 ? (order.client?.phone || '—') : '',
                item.productName,
                item.size,
                item.quantityBoxes != null ? Number(item.quantityBoxes) : '',
                Number(item.quantityKg || 0),
                Number(item.pricePerKg || 0),
                Number(item.subtotal || 0),
                i === 0 ? (STATUS_LABELS_UZ[order.status] || order.status) : '',
            ]);
            row.getCell(2).numFmt = 'dd.mm.yyyy';
            row.getCell(7).numFmt = '#,##0';
            row.getCell(8).numFmt = '#,##0.00';
            row.getCell(9).numFmt = '#,##0.00';
            row.getCell(10).numFmt = '#,##0.00';
            stripeExcelRow(row, oi);
        });
    });
    const ordersLast = sheet.rowCount;
    if (ordersLast >= ordersFirst) {
        sheet.autoFilter = { from: { row: ordersHeader.number, column: 1 }, to: { row: ordersLast, column: 11 } };
    }

    if (ordersLast >= ordersFirst) {
        const oTotalRow = sheet.addRow(['', '', '', '', '', 'JAMI:', ordersData.totalBoxes, ordersData.totalKg, '', Number(ordersData.totalRevenue || 0), '']);
        oTotalRow.font = { bold: true };
        oTotalRow.getCell(7).numFmt = '#,##0';
        oTotalRow.getCell(8).numFmt = '#,##0.00';
        oTotalRow.getCell(10).numFmt = '#,##0.00';
    }

    addSummarySection(sheet, "3. OMBORDAGI MAHSULOTLAR QOLDIG'I", COL_SPAN);
    const stockHeader = sheet.addRow(['№', 'Mahsulot', 'Kategoriya', "Razmer", 'Quti (dona)', "1 quti (kg)", 'Jami (kg)', 'Qiymat']);
    styleExcelHeaderRow(stockHeader);
    stockData.rows.forEach((r, idx) => {
        const row = sheet.addRow([idx + 1, r.product, r.category, r.size, Number(r.boxes || 0), Number(r.boxKg || 0), Number(r.totalKg || 0), Number(r.value || 0)]);
        row.getCell(5).numFmt = '#,##0';
        row.getCell(6).numFmt = '#,##0.00';
        row.getCell(7).numFmt = '#,##0.00';
        row.getCell(8).numFmt = '#,##0.00';
        stripeExcelRow(row, idx + 1);
    });

    addSummarySection(sheet, "4. MIJOZLARNING QARZDORLIGI", COL_SPAN);
    const debtsHeader = sheet.addRow(['№', 'Mijoz', 'Telefon', 'Jami buyurtma', 'Qarz ($)']);
    styleExcelHeaderRow(debtsHeader);
    debtsData.debtors.forEach((c, idx) => {
        const row = sheet.addRow([idx + 1, c.name, c.phone, (c.orders || []).length, Number(c.debt || 0)]);
        row.getCell(5).numFmt = '#,##0.00';
        stripeExcelRow(row, idx + 1);
    });

    sheet.columns = [
        { width: 5 }, { width: 22 }, { width: 22 }, { width: 15 },
        { width: 22 }, { width: 9 }, { width: 9 }, { width: 12 }, { width: 12 }, { width: 15 }, { width: 14 },
    ];

    return workbook;
}

const COLORS = {
    frameOlive: 'FF9E9662',
    monthHeaderBg: 'FF000000',
    monthHeaderFg: 'FFFFFFFF',
    yearBg: 'FF00B050',
    yearFg: 'FFFFFFFF',
    kimgaHeaderBg: 'FF4472C4',
    kimgaHeaderFg: 'FFFFFFFF',
    dateBadgeBlue: 'FFBDD7EE',
    dateBadgeYellow: 'FFFFFF00',
    yangiBg: 'FFFFFF00',
    ostFg: 'FFFF0000',
    jamiBg: 'FF00B0F0',
    qarzFg: 'FF0070C0',
    qarzAmountFg: 'FFFF0000',
    white: 'FFFFFFFF',
    black: 'FF000000',
};

function argb(hex) {
    return { argb: hex };
}

const THIN_BORDER = {
    top: { style: 'thin', color: argb('FFB2B2B2') },
    left: { style: 'thin', color: argb('FFB2B2B2') },
    bottom: { style: 'thin', color: argb('FFB2B2B2') },
    right: { style: 'thin', color: argb('FFB2B2B2') },
};
const THICK_BORDER = {
    top: { style: 'medium', color: argb(COLORS.black) },
    left: { style: 'medium', color: argb(COLORS.black) },
    bottom: { style: 'medium', color: argb(COLORS.black) },
    right: { style: 'medium', color: argb(COLORS.black) },
};

function colIdx(letters) {
    return letters.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
}
function colLetter(n) {
    let s = '';
    while (n > 0) {
        const m = (n - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        n = Math.floor((n - m) / 26);
    }
    return s;
}
function applyBorder(sheet, range, border) {
    const [start, end] = range.split(':');
    const startCol = start.match(/[A-Z]+/)[0];
    const startRow = parseInt(start.match(/\d+/)[0], 10);
    const endCol = end.match(/[A-Z]+/)[0];
    const endRow = parseInt(end.match(/\d+/)[0], 10);
    for (let r = startRow; r <= endRow; r += 1) {
        for (let ci = colIdx(startCol); ci <= colIdx(endCol); ci += 1) {
            sheet.getCell(`${colLetter(ci)}${r}`).border = border;
        }
    }
}

function buildClientLedgerExcel({ client, months }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ombor va Savdo Boshqaruv Tizimi';
    workbook.created = new Date();

    const sheetName = `${client.name}`.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Mijoz';
    const sheet = workbook.addWorksheet(sheetName, {
        views: [{ showGridLines: false }],
    });

    sheet.columns = [
        { width: 12 },
        { width: 18 },
        { width: 10 },
        { width: 8 },
        { width: 9 },
        { width: 10 },
        { width: 10 },
        { width: 12 },
        { width: 3 },
        { width: 12 },
        { width: 18 },
        { width: 12 },
    ];

    const RIGHT_COLS = ['J', 'K', 'L'];

    const titleRow = 1;
    sheet.mergeCells(`A${titleRow}:H${titleRow}`);
    const titleCell = sheet.getCell(`A${titleRow}`);
    titleCell.value = `Mijoz: ${client.name}  |  Telefon: ${client.phone}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    titleCell.font.color = { argb: 'FFFFFFFF' };

    sheet.mergeCells(`J${titleRow}:L${titleRow}`);
    const debtCell = sheet.getCell(`J${titleRow}`);
    debtCell.value = `Joriy qarz: ${formatMoney(client.debt || 0)} $`;
    debtCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    debtCell.alignment = { horizontal: 'right', vertical: 'middle' };
    debtCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0392B' } };

    sheet.getRow(titleRow).height = 30;

    sheet.addRow([]);

    let prevDebtCell = null;

    months.forEach((bucket) => {
        const blockStartRow = sheet.rowCount + 1;

        const monthRow = sheet.rowCount + 1;
        sheet.mergeCells(`B${monthRow}:C${monthRow}`);
        const monthCell = sheet.getCell(`B${monthRow}`);
        monthCell.value = `${bucket.monthName.toUpperCase()} ${bucket.year}`;
        monthCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
        monthCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };

        RIGHT_COLS.forEach((col) => {
            const c = sheet.getCell(`${col}${monthRow}`);
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
        });
        applyBorder(sheet, `B${monthRow}:C${monthRow}`, THIN_BORDER);
        applyBorder(sheet, `J${monthRow}:L${monthRow}`, THIN_BORDER);

        const headerRow = sheet.rowCount + 1;
        const headers = [
            { col: 'A', text: 'Sana' },
            { col: 'B', text: 'Mahsulot' },
            { col: 'C', text: 'Razmer' },
            { col: 'D', text: 'SHT (dona)' },
            { col: 'E', text: 'KG/1 quti' },
            { col: 'F', text: 'KG (jami)' },
            { col: 'G', text: 'Narh/kg' },
            { col: 'H', text: 'Summa' },
        ];
        headers.forEach(({ col, text }) => {
            const cell = sheet.getCell(`${col}${headerRow}`);
            cell.value = text;
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        });
        ['J', 'K', 'L'].forEach((col) => {
            const cell = sheet.getCell(`${col}${headerRow}`);
            cell.font = { bold: true };
            cell.alignment = { horizontal: 'center' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
        });
        sheet.getCell('J' + headerRow).value = "To'lov";
        sheet.getCell('K' + headerRow).value = 'Izoh';
        sheet.getCell('L' + headerRow).value = 'Sana';

        applyBorder(sheet, `A${headerRow}:H${headerRow}`, THIN_BORDER);
        applyBorder(sheet, `J${headerRow}:L${headerRow}`, THIN_BORDER);

        const dataStartRow = sheet.rowCount + 1;

        const groups = [];
        (bucket.items || []).forEach((item) => {
            const key = item.date || 'SANASIZ';
            const last = groups[groups.length - 1];
            if (last && last.key === key) {
                last.items.push(item);
            } else {
                groups.push({ key, items: [item] });
            }
        });
        if (groups.length === 0) groups.push({ key: null, items: [] });

        const payments = bucket.payments || [];
        let paymentIdx = 0;

        let badgeToggle = 0;

        groups.forEach((group) => {
            const groupStartRow = sheet.rowCount + 1;

            group.items.forEach((item) => {
                const r = sheet.rowCount + 1;
                const hasBoxData = item.quantityBoxes != null && item.boxKg != null;

                sheet.getCell(`B${r}`).value = item.productName;
                sheet.getCell(`C${r}`).value = item.size;
                if (hasBoxData) {
                    sheet.getCell(`D${r}`).value = item.quantityBoxes;
                    sheet.getCell(`E${r}`).value = item.boxKg;
                    sheet.getCell(`F${r}`).value = { formula: `E${r}*D${r}` };
                } else {
                    sheet.getCell(`F${r}`).value = item.quantityKg;
                }
                sheet.getCell(`G${r}`).value = item.pricePerKg;
                sheet.getCell(`H${r}`).value = { formula: `F${r}*G${r}` };
                sheet.getCell(`F${r}`).numFmt = '#,##0.00';
                sheet.getCell(`H${r}`).numFmt = '#,##0.00';
                applyBorder(sheet, `A${r}:H${r}`, THIN_BORDER);
                ['C', 'D', 'E', 'F', 'G', 'H'].forEach((col) => {
                    sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
                });

                const payment = payments[paymentIdx];
                if (payment) {
                    sheet.getCell(`J${r}`).value = payment.amount;
                    sheet.getCell(`J${r}`).numFmt = '#,##0';
                    sheet.getCell(`K${r}`).value = payment.note || '—';
                    sheet.getCell(`L${r}`).value = new Date(payment.date);
                    sheet.getCell(`L${r}`).numFmt = 'd-mmm';
                    applyBorder(sheet, `J${r}:L${r}`, THIN_BORDER);
                    ['J', 'K', 'L'].forEach((col) => {
                        sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
                    });
                    paymentIdx += 1;
                }
            });

            const groupEndRow = sheet.rowCount;

            if (group.key) {
                const badgeColor = badgeToggle % 2 === 0 ? 'FFBDD7EE' : 'FFFFFF00';
                badgeToggle += 1;
                const dateCell = sheet.getCell(`A${groupStartRow}`);
                dateCell.value = formatBadgeDate(group.key);
                dateCell.font = { bold: true };
                dateCell.alignment = { horizontal: 'center', vertical: 'middle' };
                dateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: badgeColor } };
                if (groupEndRow > groupStartRow) {
                    sheet.mergeCells(`A${groupStartRow}:A${groupEndRow}`);
                }
            }
        });

        while (paymentIdx < payments.length) {
            const r = sheet.rowCount + 1;
            const payment = payments[paymentIdx];
            sheet.getCell(`J${r}`).value = payment.amount;
            sheet.getCell(`J${r}`).numFmt = '#,##0';
            sheet.getCell(`K${r}`).value = payment.note || '—';
            sheet.getCell(`L${r}`).value = new Date(payment.date);
            sheet.getCell(`L${r}`).numFmt = 'd-mmm';
            applyBorder(sheet, `J${r}:L${r}`, THIN_BORDER);
            ['J', 'K', 'L'].forEach((col) => {
                sheet.getCell(`${col}${r}`).alignment = { horizontal: 'center' };
            });
            paymentIdx += 1;
        }

        const dataEndRow = sheet.rowCount;

        if (dataEndRow < dataStartRow) sheet.addRow([]);

        sheet.addRow([]);
        const yangiRow = sheet.rowCount + 1;
        sheet.getCell(`G${yangiRow}`).value = 'YANGI';
        sheet.getCell(`G${yangiRow}`).font = { bold: true };
        sheet.getCell(`G${yangiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        sheet.getCell(`H${yangiRow}`).value = { formula: `SUM(H${dataStartRow}:H${dataEndRow})` };
        sheet.getCell(`H${yangiRow}`).numFmt = '#,##0.00';
        sheet.getCell(`H${yangiRow}`).font = { bold: true };
        sheet.getCell(`H${yangiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        applyBorder(sheet, `G${yangiRow}:H${yangiRow}`, THIN_BORDER);

        const ostRow = sheet.rowCount + 1;
        sheet.getCell(`G${ostRow}`).value = 'OST';
        sheet.getCell(`G${ostRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
        if (prevDebtCell) {
            sheet.getCell(`H${ostRow}`).value = { formula: prevDebtCell };
        }
        sheet.getCell(`H${ostRow}`).numFmt = '#,##0.00';
        sheet.getCell(`H${ostRow}`).font = { bold: true, color: { argb: 'FFFF0000' } };
        applyBorder(sheet, `G${ostRow}:H${ostRow}`, THIN_BORDER);

        const jamiRow = sheet.rowCount + 1;
        sheet.getCell(`G${jamiRow}`).value = 'JAMI';
        sheet.getCell(`G${jamiRow}`).font = { bold: true };
        sheet.getCell(`H${jamiRow}`).value = { formula: `SUM(H${yangiRow}:H${ostRow})` };
        sheet.getCell(`H${jamiRow}`).numFmt = '#,##0.00';
        sheet.getCell(`H${jamiRow}`).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getCell(`G${jamiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
        sheet.getCell(`H${jamiRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00B0F0' } };
        applyBorder(sheet, `G${jamiRow}:H${jamiRow}`, THIN_BORDER);

        const paidTotalRow = jamiRow;
        sheet.getCell(`J${paidTotalRow}`).value = { formula: `SUM(J${dataStartRow}:J${jamiRow - 1})` };
        sheet.getCell(`J${paidTotalRow}`).numFmt = '#,##0';
        sheet.getCell(`J${paidTotalRow}`).font = { bold: true };
        sheet.getCell(`K${paidTotalRow}`).numFmt = '#,##0.00';
        sheet.getCell(`K${paidTotalRow}`).font = { bold: true, size: 14, color: { argb: 'FFFF0000' } };
        sheet.getCell(`K${paidTotalRow}`).alignment = { horizontal: 'center' };

        const qarzRow = sheet.rowCount + 1;
        sheet.getCell(`D${qarzRow}`).value = { formula: `SUM(D${dataStartRow}:D${dataEndRow})` };
        sheet.getCell(`D${qarzRow}`).font = { bold: true };
        sheet.getCell(`F${qarzRow}`).value = { formula: `SUM(F${dataStartRow}:F${dataEndRow})` };
        sheet.getCell(`F${qarzRow}`).numFmt = '#,##0.00';
        sheet.getCell(`F${qarzRow}`).font = { bold: true };
        sheet.getCell(`K${qarzRow}`).font = { bold: true, color: { argb: 'FF0070C0' } };
        sheet.getCell(`K${qarzRow}`).alignment = { horizontal: 'center' };
        applyBorder(sheet, `D${qarzRow}:F${qarzRow}`, THIN_BORDER);
        applyBorder(sheet, `K${qarzRow}:K${qarzRow}`, THIN_BORDER);

        prevDebtCell = `K${paidTotalRow}`;

        const blockEndRow = sheet.rowCount;

        for (let r = blockStartRow; r <= blockEndRow; r += 1) {
            sheet.getCell(`I${r}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9E9662' } };
        }
        applyBorder(sheet, `A${blockStartRow}:H${blockEndRow}`, THICK_BORDER);
        applyBorder(sheet, `J${blockStartRow}:L${blockEndRow}`, THICK_BORDER);

        sheet.addRow([]);
    });

    return workbook;
}

function formatBadgeDate(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}`;
}


export { buildOrdersExcel, buildStockExcel, buildDebtsExcel, buildSummaryExcel, buildClientLedgerExcel };
