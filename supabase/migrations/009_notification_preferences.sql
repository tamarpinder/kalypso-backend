-- Kalypso Notification System Enhancement
-- Migration 009: Notification Preferences and Priority System

-- ============================================================================
-- ENHANCE NOTIFICATIONS TABLE WITH PRIORITY
-- ============================================================================
-- Add priority column to existing notifications table
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));

-- Add action URL for clickable notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS action_url TEXT;

-- Add expiry for time-sensitive notifications
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add category for better organization
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general' CHECK (category IN ('general', 'transaction', 'card', 'wallet', 'kyc', 'security', 'system'));

-- Index for priority queries
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority);
CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(category);

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- In-App Notification Preferences
    enable_transaction_notifications BOOLEAN DEFAULT TRUE,
    enable_card_notifications BOOLEAN DEFAULT TRUE,
    enable_wallet_notifications BOOLEAN DEFAULT TRUE,
    enable_kyc_notifications BOOLEAN DEFAULT TRUE,
    enable_security_notifications BOOLEAN DEFAULT TRUE,
    enable_system_notifications BOOLEAN DEFAULT TRUE,

    -- Priority Filters (minimum priority to show)
    min_priority_level TEXT DEFAULT 'low' CHECK (min_priority_level IN ('low', 'normal', 'high', 'urgent')),

    -- Email Notifications (future enhancement)
    enable_email_notifications BOOLEAN DEFAULT FALSE,
    email_for_high_priority BOOLEAN DEFAULT TRUE,

    -- Push Notifications (future enhancement)
    enable_push_notifications BOOLEAN DEFAULT FALSE,
    push_for_urgent BOOLEAN DEFAULT TRUE,

    -- Quiet Hours (future enhancement)
    enable_quiet_hours BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One preference record per user
    UNIQUE(user_id)
);

-- ============================================================================
-- NOTIFICATION DELIVERY LOG
-- ============================================================================
-- Track notification delivery attempts for debugging
CREATE TABLE IF NOT EXISTS public.notification_delivery_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Delivery Details
    delivery_method TEXT CHECK (delivery_method IN ('in_app', 'email', 'push', 'sms')),
    delivery_status TEXT CHECK (delivery_status IN ('pending', 'delivered', 'failed', 'skipped')),
    failure_reason TEXT,

    -- Timestamps
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_notification_preferences_user_id ON public.notification_preferences(user_id);
CREATE INDEX idx_notification_delivery_log_notification_id ON public.notification_delivery_log(notification_id);
CREATE INDEX idx_notification_delivery_log_user_id ON public.notification_delivery_log(user_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- Users can view and update their own preferences
CREATE POLICY "Users can view own notification preferences"
ON public.notification_preferences FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
ON public.notification_preferences FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
ON public.notification_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Service role can manage all preferences
CREATE POLICY "Service role can manage all notification preferences"
ON public.notification_preferences FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- DEFAULT PREFERENCES FOR EXISTING USERS
-- ============================================================================
-- Create default notification preferences for all existing users
INSERT INTO public.notification_preferences (user_id)
SELECT id FROM public.users
WHERE id NOT IN (SELECT user_id FROM public.notification_preferences)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- AUTOMATIC PREFERENCE CREATION TRIGGER
-- ============================================================================
-- Automatically create notification preferences when a new user is created
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_notification_preferences_on_user_creation
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_notification_preferences();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.notification_preferences IS 'User notification preferences for controlling which notifications they receive';
COMMENT ON COLUMN public.notifications.priority IS 'Notification priority: low, normal, high, urgent';
COMMENT ON COLUMN public.notifications.category IS 'Notification category for filtering and organization';
COMMENT ON COLUMN public.notifications.action_url IS 'Optional URL to navigate to when notification is clicked';
COMMENT ON COLUMN public.notifications.expires_at IS 'Timestamp when notification should be automatically removed';
COMMENT ON TABLE public.notification_delivery_log IS 'Tracks notification delivery attempts for debugging and analytics';
