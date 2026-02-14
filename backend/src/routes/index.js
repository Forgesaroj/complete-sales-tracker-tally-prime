/**
 * Routes Index
 * Combines all route modules into a single router
 *
 * Socket Events (granular):
 *   - bill:new - new bill created
 *   - bill:dispatchChanged - bill dispatch status updated
 *   - payment:recorded - payment recorded on a bill
 *   - cheque:new - new cheque created
 *   - cheque:received - cheque receipt recorded on bill
 *   - cheque:dateUpdated - cheque date updated
 *   - cheque:dateConfirmed - cheque date confirmed
 *   - cheque:statusChanged - cheque status changed
 *   - sack:statusChanged - sack status changed
 *   - dispatch:updated - dispatch status updated
 */

import { Router } from 'express';

// Import route modules
import dashboardRoutes from './dashboard.js';
import billsRoutes from './bills.js';
import sacksRoutes from './sacks.js';
import syncRoutes from './sync.js';
import stockRoutes from './stock.js';
import ledgersRoutes from './ledgers.js';
import invoicesRoutes from './invoices.js';
import receiptsRoutes from './receipts.js';
import usersRoutes from './users.js';
import fonepayRoutes from './fonepay.js';
import rbbRoutes from './rbb.js';
import chequesRoutes from './cheques.js';
import billPaymentsRoutes from './bill-payments.js';
import tallyRoutes from './tally.js';
import voucherHistoryRoutes from './voucher-history.js';
import vouchersRoutes from './vouchers.js';
import paymentsRoutes from './payments.js';
import daybookRoutes from './daybook.js';
import configRoutes from './config.js';
import emailRoutes from './email.js';
import outstandingRoutes from './outstanding.js';
import profitLossRoutes from './profit-loss.js';
import stockGroupsRoutes from './stock-groups.js';
import priceListsRoutes from './price-lists.js';
import inventoryMovementRoutes from './inventory-movement.js';
import bankReconRoutes from './bank-recon.js';
import balanceSheetRoutes from './balance-sheet.js';
import trialBalanceRoutes from './trial-balance.js';
import cashFlowRoutes from './cash-flow.js';
import ratioAnalysisRoutes from './ratio-analysis.js';
import tallyXmlRoutes from './tally-xml.js';
import columnarRoutes from './columnar.js';
import voucherLockRoutes from './voucher-lock.js';
import chatRoutes from './chat.js';
import collectionRoutes from './collection.js';
import bankNamesRoutes from './bank-names.js';

const router = Router();

// Mount routes
router.use('/dashboard', dashboardRoutes);
router.use('/bills', billsRoutes);
router.use('/sacks', sacksRoutes);
router.use('/sync', syncRoutes);
router.use('/stock', stockRoutes);
router.use('/ledgers', ledgersRoutes);
router.use('/invoice', invoicesRoutes);
router.use('/receipt', receiptsRoutes);
router.use('/users', usersRoutes);
router.use('/fonepay', fonepayRoutes);
router.use('/rbb', rbbRoutes);
router.use('/cheques', chequesRoutes);
router.use('/bill-payments', billPaymentsRoutes);
router.use('/tally', tallyRoutes);
router.use('/voucher-history', voucherHistoryRoutes);
router.use('/vouchers', vouchersRoutes);
router.use('/payments', paymentsRoutes);
router.use('/daybook', daybookRoutes);
router.use('/config', configRoutes);
router.use('/email', emailRoutes);
router.use('/outstanding', outstandingRoutes);
router.use('/profit-loss', profitLossRoutes);
router.use('/stock-groups', stockGroupsRoutes);
router.use('/price-lists', priceListsRoutes);
router.use('/inventory-movement', inventoryMovementRoutes);
router.use('/bank-recon', bankReconRoutes);
router.use('/balance-sheet', balanceSheetRoutes);
router.use('/trial-balance', trialBalanceRoutes);
router.use('/cash-flow', cashFlowRoutes);
router.use('/ratios', ratioAnalysisRoutes);
router.use('/tally-xml', tallyXmlRoutes);
router.use('/columnar', columnarRoutes);
router.use('/voucher-lock', voucherLockRoutes);
router.use('/chat', chatRoutes);
router.use('/collection', collectionRoutes);
router.use('/bank-names', bankNamesRoutes);

// Frontend error logging endpoint
import fs from 'fs';
import path from 'path';
import express from 'express';
const ERROR_LOG = path.join(process.cwd(), 'frontend-errors.log');
router.post('/log/error', express.text({ type: '*/*' }), (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { message, stack, url, timestamp } = body;
    const line = `[${timestamp || new Date().toISOString()}] ${message}\n  URL: ${url || 'unknown'}\n  ${(stack || '').split('\n').slice(0, 3).join('\n  ')}\n\n`;
    fs.appendFileSync(ERROR_LOG, line);
  } catch {}
  res.json({ ok: true });
});

// Legacy routes for backward compatibility
// Redirect old /api/auth/login to /api/users/auth/login
router.post('/auth/login', (req, res, next) => {
  req.url = '/users/auth/login';
  router.handle(req, res, next);
});

// Redirect old /api/notifications to /api/users/notifications
router.get('/notifications', (req, res, next) => {
  req.url = '/users/notifications';
  router.handle(req, res, next);
});

router.patch('/notifications/:id/read', (req, res, next) => {
  req.url = `/users/notifications/${req.params.id}/read`;
  router.handle(req, res, next);
});

// Redirect old /api/pending-invoices to /api/invoice/pending
router.get('/pending-invoices', (req, res, next) => {
  req.url = '/invoice/pending';
  router.handle(req, res, next);
});

router.get('/pending-invoices/count', (req, res, next) => {
  req.url = '/invoice/pending/count';
  router.handle(req, res, next);
});

router.post('/pending-invoices/sync', (req, res, next) => {
  req.url = '/invoice/pending/sync';
  router.handle(req, res, next);
});

router.delete('/pending-invoices/:id', (req, res, next) => {
  req.url = `/invoice/pending/${req.params.id}`;
  router.handle(req, res, next);
});

// Redirect old /api/godowns to /api/invoice/godowns
router.get('/godowns', (req, res, next) => {
  req.url = '/invoice/godowns';
  router.handle(req, res, next);
});

// Redirect old /api/voucher-types to /api/receipt/voucher-types
router.get('/voucher-types', (req, res, next) => {
  req.url = '/receipt/voucher-types';
  router.handle(req, res, next);
});

// Redirect old /api/pending-sales-bills to /api/receipt/pending-sales-bills
router.get('/pending-sales-bills', (req, res, next) => {
  req.url = '/receipt/pending-sales-bills';
  router.handle(req, res, next);
});

router.post('/pending-sales-bills/:masterId/complete', (req, res, next) => {
  req.url = `/receipt/pending-sales-bills/${req.params.masterId}/complete`;
  router.handle(req, res, next);
});

// Redirect old /api/voucher/:masterId/complete-payment
router.put('/voucher/:masterId/complete-payment', (req, res, next) => {
  req.url = `/receipt/voucher/${req.params.masterId}/complete-payment`;
  router.handle(req, res, next);
});

// Redirect old /api/cheque-receipt-activity routes
router.post('/cheque-receipt-activity', (req, res, next) => {
  req.url = '/cheques/receipt-activity';
  router.handle(req, res, next);
});

router.put('/cheque-receipt-activity/:chequeId/update-date', (req, res, next) => {
  req.url = `/cheques/receipt-activity/${req.params.chequeId}/update-date`;
  router.handle(req, res, next);
});

router.post('/cheque-receipt-activity/:chequeId/add-breakdown', (req, res, next) => {
  req.url = `/cheques/receipt-activity/${req.params.chequeId}/add-breakdown`;
  router.handle(req, res, next);
});

router.get('/cheque-receipt-activity/pending-dates', (req, res, next) => {
  req.url = '/cheques/receipt-activity/pending-dates';
  router.handle(req, res, next);
});

export default router;
