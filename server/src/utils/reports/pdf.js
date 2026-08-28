import PDFDocument from 'pdfkit';
import { REPORT_COLORS, STATUS_LABELS_UZ, formatMoney } from './shared.js';
function newPdfDoc() {
    return new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
}

function pdfHeader(doc, title, subtitle) {
    doc.rect(0, 0, doc.page.width, 68).fill(`#${REPORT_COLORS.headerBg}`);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17)
        .text(title, 40, 18, { width: doc.page.width - 80 });
    if (subtitle) {
        doc.font('Helvetica').fontSize(9)
            .text(subtitle, 40, 42, { width: doc.page.width - 80 });
    }
    doc.fillColor('#000000');
    doc.y = 86;
}

function drawPdfTable(doc, { columns, rows }) {
    const startX = doc.page.margins.left;
    const tableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const rowHeight = 20;
    let y = doc.y;

    function drawHeaderRow() {
        doc.rect(startX, y, tableWidth, rowHeight).fill(`#${REPORT_COLORS.tableHeaderBg}`);
        let x = startX;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
        columns.forEach((col) => {
            const w = tableWidth * col.width;
            doc.text(col.label, x + 4, y + 6, { width: w - 8, align: col.align || 'left' });
            x += w;
        });
        doc.fillColor('#000000');
        y += rowHeight;
    }

    drawHeaderRow();

    rows.forEach((row, idx) => {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 20) {
            doc.addPage();
            y = doc.page.margins.top;
            drawHeaderRow();
        }
        if (idx % 2 === 0) {
            doc.rect(startX, y, tableWidth, rowHeight).fill(`#${REPORT_COLORS.stripeBg}`);
        }
        doc.fillColor('#000000');
        let x = startX;
        doc.font('Helvetica').fontSize(8);
        columns.forEach((col) => {
            const w = tableWidth * col.width;
            const val = row[col.key] === undefined || row[col.key] === null ? '' : String(row[col.key]);
            doc.text(val, x + 4, y + 6, { width: w - 8, align: col.align || 'left' });
            x += w;
        });
        y += rowHeight;
    });

    doc.y = y + 14;
    return y;
}

function pdfSectionTitle(doc, text) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).fillColor(`#${REPORT_COLORS.headerBg}`)
        .text(text, doc.page.margins.left, doc.y);
    doc.fillColor('#000000');
    doc.moveDown(0.3);
}

function pdfSummaryLine(doc, text) {
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#444444')
        .text(text, doc.page.margins.left, doc.y, { width: doc.page.width - 80 });
    doc.fillColor('#000000');
    doc.moveDown(0.6);
}

function pdfFooter(doc) {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(7.5).fillColor('#999999').text(
            `Sahifa ${i + 1} / ${range.count}  •  Yaratilgan: ${new Date().toLocaleString('uz-UZ')}`,
            doc.page.margins.left,
            doc.page.height - 26,
            { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
        );
    }
    doc.fillColor('#000000');
}

function buildOrdersPdf({ month, year, monthName, orders, totalOrders, totalRevenue, completed, pending, cancelled, totalKg, totalBoxes }) {
    const doc = newPdfDoc();
    pdfHeader(doc, `Buyurtmalar hisoboti — ${monthName} ${year}`, `Sahifa yaratilgan sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    pdfSummaryLine(
        doc,
        `Jami buyurtmalar: ${totalOrders}  |  Jami summa: ${formatMoney(totalRevenue)} $  |  Jami: ${totalBoxes} quti / ${totalKg} kg  |  Bajarilgan: ${completed}  |  Kutilmoqda: ${pending}  |  Bekor qilingan: ${cancelled}`
    );

    const rows = [];
    let oi = 0;
    orders.forEach((order) => {
        oi += 1;
        order.items.forEach((item, i) => {
            const hasBoxData = item.quantityBoxes != null && item.boxKg != null;
            rows.push({
                no: i === 0 ? oi : '',
                date: i === 0 ? new Date(order.createdAt).toLocaleDateString('uz-UZ') : '',
                client: i === 0 ? (order.client?.name || '—') : '',
                product: `${item.productName} (${item.size})`,
                box: hasBoxData ? item.quantityBoxes : '',
                qty: item.quantityKg,
                price: formatMoney(item.pricePerKg),
                subtotal: formatMoney(item.subtotal),
                status: i === 0 ? (STATUS_LABELS_UZ[order.status] || order.status) : '',
            });
        });
    });

    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.05, align: 'center' },
            { key: 'date', label: 'Sana', width: 0.10 },
            { key: 'client', label: 'Mijoz', width: 0.16 },
            { key: 'product', label: 'Mahsulot', width: 0.19 },
            { key: 'box', label: 'Quti', width: 0.08, align: 'right' },
            { key: 'qty', label: 'Kg', width: 0.09, align: 'right' },
            { key: 'price', label: 'Narx/kg', width: 0.11, align: 'right' },
            { key: 'subtotal', label: 'Summa', width: 0.13, align: 'right' },
            { key: 'status', label: 'Status', width: 0.09 },
        ],
        rows,
    });

    pdfFooter(doc);
    return doc;
}

function buildStockPdf({ rows, totalKg, totalValue, totalBoxes }) {
    const doc = newPdfDoc();
    pdfHeader(doc, "Ombordagi mahsulotlar qoldig'i", `Sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    pdfSummaryLine(doc, `Jami: ${totalBoxes} quti / ${totalKg} kg  |  Jami qiymat: ${formatMoney(totalValue)} $`);

    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.06, align: 'center' },
            { key: 'product', label: 'Mahsulot', width: 0.24 },
            { key: 'category', label: 'Kategoriya', width: 0.16 },
            { key: 'size', label: "Razmer", width: 0.1, align: 'center' },
            { key: 'boxes', label: 'SHT', width: 0.1, align: 'right' },
            { key: 'totalKg', label: 'Jami (kg)', width: 0.13, align: 'right' },
            { key: 'value', label: 'Qiymat', width: 0.21, align: 'right' },
        ],
        rows: rows.map((r, idx) => ({
            no: idx + 1,
            product: r.product,
            category: r.category,
            size: r.size,
            boxes: r.boxes,
            totalKg: r.totalKg,
            value: formatMoney(r.value),
        })),
    });

    pdfFooter(doc);
    return doc;
}

function buildDebtsPdf({ debtors, totalDebt }) {
    const doc = newPdfDoc();
    pdfHeader(doc, 'Mijozlarning qarzdorligi', `Sana: ${new Date().toLocaleDateString('uz-UZ')}`);
    pdfSummaryLine(doc, `Qarzdor mijozlar soni: ${debtors.length}  |  Jami qarz: ${formatMoney(totalDebt)} $`);

    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.06, align: 'center' },
            { key: 'name', label: 'Mijoz', width: 0.3 },
            { key: 'phone', label: 'Telefon', width: 0.2 },
            { key: 'orders', label: 'Buyurtma', width: 0.14, align: 'center' },
            { key: 'debt', label: "Qarz ($)", width: 0.3, align: 'right' },
        ],
        rows: debtors.map((c, idx) => ({
            no: idx + 1,
            name: c.name,
            phone: c.phone,
            orders: (c.orders || []).length,
            debt: formatMoney(c.debt),
        })),
    });

    pdfFooter(doc);
    return doc;
}

function buildSummaryPdf({ month, year, monthName, ordersData, stockData, debtsData, kassaBalance }) {
    const doc = newPdfDoc();
    pdfHeader(doc, `Oylik umumiy hisobot — ${monthName} ${year}`, `Sana: ${new Date().toLocaleDateString('uz-UZ')}`);

    pdfSectionTitle(doc, "Umumiy ko'rsatkichlar");
    drawPdfTable(doc, {
        columns: [
            { key: 'label', label: "Ko'rsatkich", width: 0.6 },
            { key: 'value', label: 'Qiymat', width: 0.4, align: 'right' },
        ],
        rows: [
            { label: 'Jami buyurtmalar soni', value: ordersData.totalOrders },
            { label: 'Jami savdo summasi', value: `${formatMoney(ordersData.totalRevenue)} $` },
            { label: 'Sotilgan', value: `${ordersData.totalBoxes} quti / ${ordersData.totalKg} kg` },
            { label: 'Bajarilgan / Kutilmoqda / Bekor qilingan', value: `${ordersData.completed} / ${ordersData.pending} / ${ordersData.cancelled}` },
            { label: 'Ombordagi jami qoldiq', value: `${stockData.totalBoxes} quti / ${stockData.totalKg} kg` },
            { label: 'Ombordagi jami qiymat', value: `${formatMoney(stockData.totalValue)} $` },
            { label: "Mijozlarning jami qarzi", value: `${formatMoney(debtsData.totalDebt)} $` },
            { label: 'Qarzdor mijozlar soni', value: debtsData.debtors.length },
            { label: 'Kassadagi joriy balans', value: `${formatMoney(kassaBalance)} $` },
        ],
    });

    doc.addPage();
    pdfSectionTitle(doc, "Eng ko'p qarzdor mijozlar (TOP-10)");
    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.08, align: 'center' },
            { key: 'name', label: 'Mijoz', width: 0.34 },
            { key: 'phone', label: 'Telefon', width: 0.24 },
            { key: 'debt', label: "Qarz ($)", width: 0.34, align: 'right' },
        ],
        rows: debtsData.debtors.slice(0, 10).map((c, idx) => ({
            no: idx + 1, name: c.name, phone: c.phone, debt: formatMoney(c.debt),
        })),
    });

    doc.addPage();
    pdfSectionTitle(doc, "Ombordagi qoldiq (TOP-15, kg bo'yicha)");
    const topStock = [...stockData.rows].sort((a, b) => b.totalKg - a.totalKg).slice(0, 15);
    drawPdfTable(doc, {
        columns: [
            { key: 'no', label: '№', width: 0.06, align: 'center' },
            { key: 'product', label: 'Mahsulot', width: 0.28 },
            { key: 'size', label: "Razmer", width: 0.12, align: 'center' },
            { key: 'totalKg', label: 'Jami (kg)', width: 0.22, align: 'right' },
            { key: 'value', label: 'Qiymat', width: 0.32, align: 'right' },
        ],
        rows: topStock.map((r, idx) => ({
            no: idx + 1, product: r.product, size: r.size, totalKg: r.totalKg, value: formatMoney(r.value),
        })),
    });

    pdfFooter(doc);
    return doc;
}


export { buildOrdersPdf, buildStockPdf, buildDebtsPdf, buildSummaryPdf };
