/**
 * Users Routes
 * User authentication and management
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

// ==================== AUTHENTICATION ====================

/**
 * POST /api/users/auth/login
 * Simple login (for development - use proper auth in production!)
 */
router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.getUserByUsername(username);
    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // In production, use JWT tokens!
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        language: user.language
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== USER MANAGEMENT ====================

/**
 * GET /api/users
 * Get all users (admin only in production)
 */
router.get('/', (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users
 * Create new user
 */
router.post('/', (req, res) => {
  try {
    const { username, password, displayName, role, language } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const result = db.createUser({
      username,
      password,  // Should hash in production!
      displayName: displayName || username,
      role: role || 'cashier',
      language: language || 'en'
    });

    res.json({
      success: true,
      userId: result.lastInsertRowid
    });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/users/:id/notifications
 * Update user notification preferences
 */
router.patch('/:id/notifications', (req, res) => {
  try {
    const { notifyNewBill, notifyPayment, notifyLargeBill, notifyDispatch, largeBillThreshold } = req.body;

    const result = db.updateUserNotificationPrefs(req.params.id, {
      notifyNewBill,
      notifyPayment,
      notifyLargeBill,
      notifyDispatch,
      largeBillThreshold
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOTIFICATIONS ====================

/**
 * GET /api/users/notifications
 * Get user's unread notifications
 */
router.get('/notifications', (req, res) => {
  try {
    const userId = req.query.userId || 1;  // In production, get from auth token
    const notifications = db.getUnreadNotifications(userId);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/users/notifications/:id/read
 * Mark notification as read
 */
router.patch('/notifications/:id/read', (req, res) => {
  try {
    db.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
