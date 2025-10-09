// Notification Management API
// Endpoints for managing user notifications and preferences

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase.config');

/**
 * GET /api/notifications
 * Get all notifications for a user
 */
router.get('/', async (req, res) => {
  try {
    const { userId, unreadOnly, limit = 50, category, priority } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Apply filters
    if (unreadOnly === 'true') {
      query = query.eq('read', false);
    }

    if (category) {
      query = query.eq('category', category);
    }

    if (priority) {
      query = query.eq('priority', priority);
    }

    const { data: notifications, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      notifications,
      count: notifications.length
    });
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * GET /api/notifications/count
 * Get unread notification count
 */
router.get('/count', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;

    res.json({
      success: true,
      unreadCount: count || 0
    });
  } catch (error) {
    console.error('Failed to get notification count:', error);
    res.status(500).json({ error: 'Failed to get notification count' });
  }
});

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read
 */
router.put('/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      notification: data
    });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * PUT /api/notifications/read-all
 * Mark all notifications as read for a user
 */
router.put('/read-all', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      updatedCount: data.length
    });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Failed to delete notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

/**
 * DELETE /api/notifications/clear
 * Clear all read notifications
 */
router.delete('/clear', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', userId)
      .eq('read', true);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Read notifications cleared'
    });
  } catch (error) {
    console.error('Failed to clear notifications:', error);
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

/**
 * GET /api/notifications/preferences
 * Get user notification preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const { data: preferences, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    res.json({
      success: true,
      preferences: preferences || null
    });
  } catch (error) {
    console.error('Failed to fetch notification preferences:', error);
    res.status(500).json({ error: 'Failed to fetch notification preferences' });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update user notification preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const {
      userId,
      enable_transaction_notifications,
      enable_card_notifications,
      enable_wallet_notifications,
      enable_kyc_notifications,
      enable_security_notifications,
      enable_system_notifications,
      min_priority_level,
      enable_email_notifications,
      email_for_high_priority,
      enable_push_notifications,
      push_for_urgent
    } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const updates = {};
    if (enable_transaction_notifications !== undefined) updates.enable_transaction_notifications = enable_transaction_notifications;
    if (enable_card_notifications !== undefined) updates.enable_card_notifications = enable_card_notifications;
    if (enable_wallet_notifications !== undefined) updates.enable_wallet_notifications = enable_wallet_notifications;
    if (enable_kyc_notifications !== undefined) updates.enable_kyc_notifications = enable_kyc_notifications;
    if (enable_security_notifications !== undefined) updates.enable_security_notifications = enable_security_notifications;
    if (enable_system_notifications !== undefined) updates.enable_system_notifications = enable_system_notifications;
    if (min_priority_level) updates.min_priority_level = min_priority_level;
    if (enable_email_notifications !== undefined) updates.enable_email_notifications = enable_email_notifications;
    if (email_for_high_priority !== undefined) updates.email_for_high_priority = email_for_high_priority;
    if (enable_push_notifications !== undefined) updates.enable_push_notifications = enable_push_notifications;
    if (push_for_urgent !== undefined) updates.push_for_urgent = push_for_urgent;

    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: userId,
        ...updates,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      preferences: data
    });
  } catch (error) {
    console.error('Failed to update notification preferences:', error);
    res.status(500).json({ error: 'Failed to update notification preferences' });
  }
});

module.exports = router;
