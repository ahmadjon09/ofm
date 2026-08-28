import { Router } from 'express';
import { mongoose } from '../lib/db.js';
import { authenticate, authorize, authLimiter, adminLimiter } from '../middleware/auth.js';
import authController from '../controllers/auth.controller.js';
import userController from '../controllers/user.controller.js';
import productController from '../controllers/product.controller.js';
import clientController from '../controllers/client.controller.js';
import orderController from '../controllers/order.controller.js';
import kassaController from '../controllers/kassa.controller.js';
import dashboardController from '../controllers/dashboard.controller.js';
import reportController from '../controllers/report.controller.js';
import { sendSuccess } from '../lib/helpers.js';

const router = Router();

router.get('/health', (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? 'ulangan' : 'ulanmagan';
    return sendSuccess(res, 200, "Server ishlamoqda.", {
        status: 'ok',
        database: dbState,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});

router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/login', authLimiter, authController.login);
router.get('/auth/me', authenticate, authController.me);
router.patch('/auth/profile', authenticate, authController.updateProfile);

router.get('/users', authenticate, authorize('admin'), adminLimiter, userController.list);
router.get('/users/:id', authenticate, authorize('admin'), adminLimiter, userController.getById);
router.put('/users/:id', authenticate, authorize('admin'), adminLimiter, userController.update);
router.delete('/users/:id', authenticate, authorize('admin'), adminLimiter, userController.remove);

router.post('/products', authenticate, authorize('admin', 'manager'), productController.create);
router.get('/products', authenticate, productController.list);
router.get('/products/:id', authenticate, productController.getById);
router.put('/products/:id', authenticate, authorize('admin', 'manager'), productController.update);
router.delete('/products/:id', authenticate, authorize('admin', 'manager'), productController.remove);

router.post('/clients', authenticate, authorize('admin', 'manager'), clientController.create);
router.get('/clients', authenticate, clientController.list);
router.get('/clients/:id', authenticate, clientController.getById);
router.put('/clients/:id', authenticate, authorize('admin', 'manager'), clientController.update);
router.delete('/clients/:id', authenticate, authorize('admin'), clientController.remove);
router.post('/clients/:id/payments', authenticate, authorize('admin', 'manager'), clientController.addPayment);
router.get('/clients/:id/payments', authenticate, clientController.paymentHistory);

router.post('/orders', authenticate, authorize('admin', 'manager', 'worker'), orderController.create);
router.get('/orders', authenticate, orderController.list);
router.get('/orders/:id', authenticate, orderController.getById);
router.patch('/orders/:id/status', authenticate, authorize('admin', 'manager'), orderController.updateStatus);
router.delete('/orders/:id', authenticate, authorize('admin'), orderController.remove);

router.get('/kassa', authenticate, authorize('admin', 'manager'), kassaController.get);
router.get('/kassa/history', authenticate, authorize('admin', 'manager'), kassaController.history);
router.get('/kassa/suggestions', authenticate, authorize('admin', 'manager'), kassaController.expenseSuggestions);
router.delete('/kassa/del/:id', authenticate, authorize('admin', 'manager'), kassaController.deleteHistory);
router.post('/kassa/expense', authenticate, authorize('admin', 'manager'), kassaController.expense);
router.post('/kassa/income', authenticate, authorize('admin', 'manager'), kassaController.income);
router.patch('/kassa/history/:id', authenticate, authorize('admin', 'manager'), kassaController.updateHistoryNote);

router.get('/dashboard/stats', authenticate, authorize('admin', 'manager'), dashboardController.stats);

router.get('/reports/orders', authenticate, authorize('admin', 'manager'), reportController.orders);
router.get('/reports/stock', authenticate, authorize('admin', 'manager'), reportController.stock);
router.get('/reports/debts', authenticate, authorize('admin', 'manager'), reportController.debts);
router.get('/reports/client/:clientId', authenticate, authorize('admin', 'manager'), reportController.clientLedger);
router.get('/reports/summary', authenticate, authorize('admin', 'manager'), reportController.summary);

export default router;
