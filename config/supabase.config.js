// Supabase Configuration for Kalypso Backend
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Validation
if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL environment variable is required');
}
if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_KEY environment variable is required');
}

// Create Supabase client with service role key
// This bypasses Row Level Security policies and should only be used in backend
let supabase = null;

if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    db: {
      schema: 'public'
    }
  });
} else {
  console.warn('⚠️  Supabase not initialized - missing credentials');
}

// Helper functions for common database operations

/**
 * Get user by ID
 */
async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw new Error(`Failed to get user: ${error.message}`);
  return data;
}

/**
 * Get user by email
 */
async function getUserByEmail(email) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    throw new Error(`Failed to get user by email: ${error.message}`);
  }
  return data;
}

/**
 * Get user by Bridge customer ID
 */
async function getUserByBridgeCustomerId(bridgeCustomerId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('bridge_customer_id', bridgeCustomerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get user by Bridge customer ID: ${error.message}`);
  }
  return data;
}

/**
 * Update user's Bridge customer ID
 */
async function updateUserBridgeCustomerId(userId, bridgeCustomerId) {
  const { data, error } = await supabase
    .from('users')
    .update({ bridge_customer_id: bridgeCustomerId })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update Bridge customer ID: ${error.message}`);
  return data;
}

/**
 * Update user's KYC status
 */
async function updateUserKycStatus(userId, kycStatus, kycTier = null) {
  const updates = { kyc_status: kycStatus };
  if (kycTier !== null) updates.kyc_tier = kycTier;

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw new Error(`Failed to update KYC status: ${error.message}`);
  return data;
}

/**
 * Create audit log entry
 */
async function createAuditLog(logData) {
  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      user_id: logData.userId || null,
      event_type: logData.eventType,
      event_description: logData.description || null,
      event_data: logData.data || null,
      bridge_event_id: logData.bridgeEventId || null,
      bridge_event_type: logData.bridgeEventType || null,
      ip_address: logData.ipAddress || null,
      user_agent: logData.userAgent || null
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create audit log:', error.message);
    // Don't throw - audit log failures shouldn't break main flow
  }
  return data;
}

/**
 * Create a notification for a user with enhanced options
 * @param {string} userId - User ID
 * @param {string} type - Notification type (success, error, warning, info, etc.)
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 * @param {Object} options - Enhanced options (priority, category, actionUrl, expiresAt)
 */
async function createNotification(userId, type, title, message, data = {}, options = {}) {
  if (!supabase) {
    console.warn('⚠️  Supabase not initialized - cannot create notification');
    return null;
  }

  // Extract options with defaults
  const {
    priority = 'normal',
    category = 'general',
    actionUrl = null,
    expiresAt = null
  } = options;

  // Check user notification preferences
  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();

  // If preferences exist, check if this notification should be sent
  if (preferences) {
    // Check category-specific preferences
    const categoryEnabled = getCategoryPreference(preferences, category);
    if (!categoryEnabled) {
      console.log(`[Notification] Skipped - user disabled ${category} notifications`);
      return null;
    }

    // Check priority filter
    if (!meetsMinimumPriority(priority, preferences.min_priority_level)) {
      console.log(`[Notification] Skipped - priority ${priority} below minimum ${preferences.min_priority_level}`);
      return null;
    }
  }

  // Create notification
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      data,
      priority,
      category,
      action_url: actionUrl,
      expires_at: expiresAt
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create notification:', error.message);
    return null;
  }

  return notification;
}

/**
 * Get category-specific preference setting
 */
function getCategoryPreference(preferences, category) {
  const categoryMap = {
    'transaction': preferences.enable_transaction_notifications,
    'card': preferences.enable_card_notifications,
    'wallet': preferences.enable_wallet_notifications,
    'kyc': preferences.enable_kyc_notifications,
    'security': preferences.enable_security_notifications,
    'system': preferences.enable_system_notifications,
    'general': true // General notifications always enabled
  };
  return categoryMap[category] !== undefined ? categoryMap[category] : true;
}

/**
 * Check if notification priority meets minimum threshold
 */
function meetsMinimumPriority(notificationPriority, minPriority) {
  const priorityLevels = {
    'low': 0,
    'normal': 1,
    'high': 2,
    'urgent': 3
  };

  const notificationLevel = priorityLevels[notificationPriority] || 1;
  const minimumLevel = priorityLevels[minPriority] || 0;

  return notificationLevel >= minimumLevel;
}

/**
 * Mark notification as read
 */
async function markNotificationRead(notificationId) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId)
    .select()
    .single();

  if (error) {
    console.error('Failed to mark notification as read:', error.message);
    return null;
  }

  return data;
}

/**
 * Get unread notification count for a user
 */
async function getUnreadCount(userId) {
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    console.error('Failed to get unread count:', error.message);
    return 0;
  }

  return count || 0;
}

// Test connection on startup
async function testConnection() {
  if (!supabase) {
    console.warn('⚠️  Supabase connection test skipped - not initialized');
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);

    if (error) throw error;
    console.log('✅ Supabase connection established');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}

// Test on load (non-blocking)
if (supabase) {
  testConnection();
}

module.exports = {
  supabase,
  getUserById,
  getUserByEmail,
  getUserByBridgeCustomerId,
  updateUserBridgeCustomerId,
  updateUserKycStatus,
  createAuditLog,
  createNotification,
  markNotificationRead,
  getUnreadCount,
  testConnection
};
