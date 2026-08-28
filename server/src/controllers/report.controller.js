import { ApiError, isValidObjectId, sendSuccess } from '../lib/helpers.js';
import { getKassaDoc } from '../models/index.js';
import { resolveMonthYear, resolveFormat, setDownloadHeaders } from '../utils/reports/shared.js';
import { fetchOrdersReportData, fetchStockReportData, fetchDebtsReportData, fetchClientLedgerData } from '../utils/reports/data.js';
import { buildOrdersExcel, buildStockExcel, buildDebtsExcel, buildSummaryExcel, buildClientLedgerExcel } from '../utils/reports/excel.js';
import { buildOrdersPdf, buildStockPdf, buildDebtsPdf, buildSummaryPdf } from '../utils/reports/pdf.js';
const reportController = {
    async orders(req, res) {
        const format = resolveFormat(req.query);
        const { month, year, monthName, start, end } = resolveMonthYear(req.query);
        const data = await fetchOrdersReportData({ start, end });

        const filenameBase = `buyurtmalar_${monthName}_${year}`;

        if (format === 'excel') {
            const workbook = await buildOrdersExcel({ month, year, monthName, ...data });
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildOrdersPdf({ month, year, monthName, ...data });
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },

    async stock(req, res) {
        const format = resolveFormat(req.query);
        const data = await fetchStockReportData();
        const filenameBase = `ombor_qoldigi_${new Date().toISOString().slice(0, 10)}`;

        if (format === 'excel') {
            const workbook = await buildStockExcel(data);
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildStockPdf(data);
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },

    async debts(req, res) {
        const format = resolveFormat(req.query);
        const data = await fetchDebtsReportData();
        const filenameBase = `mijozlar_qarzi_${new Date().toISOString().slice(0, 10)}`;

        if (format === 'excel') {
            const workbook = await buildDebtsExcel(data);
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildDebtsPdf(data);
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },

    async clientLedger(req, res) {
        try {
            const { clientId } = req.params;
            if (!isValidObjectId(clientId)) throw new ApiError(400, "Noto'g'ri mijoz ID.");

            const { client, months } = await fetchClientLedgerData(clientId);
            const workbook = buildClientLedgerExcel({ client, months });

            const filenameBase = `${client.name}_hisobot_${new Date().toISOString().slice(0, 10)}`.replace(/\s+/g, '_');
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        } catch (error) {
            res.status(error.statusCode || 500).json({
                success: false,
                message: error.message || 'Hisobot yaratishda xatolik yuz berdi.',
            });
        }
    },

    async summary(req, res) {
        const format = resolveFormat(req.query);
        const { month, year, monthName, start, end } = resolveMonthYear(req.query);

        const [ordersData, stockData, debtsData, kassa] = await Promise.all([
            fetchOrdersReportData({ start, end }),
            fetchStockReportData(),
            fetchDebtsReportData(),
            getKassaDoc(),
        ]);

        const filenameBase = `umumiy_hisobot_${monthName}_${year}`;
        const payload = { month, year, monthName, ordersData, stockData, debtsData, kassaBalance: kassa.balance };

        if (format === 'excel') {
            const workbook = await buildSummaryExcel(payload);
            setDownloadHeaders(res, `${filenameBase}.xlsx`, 'excel');
            await workbook.xlsx.write(res);
            return res.end();
        }

        const doc = buildSummaryPdf(payload);
        setDownloadHeaders(res, `${filenameBase}.pdf`, 'pdf');
        doc.pipe(res);
        doc.end();
    },
};


export default reportController;
