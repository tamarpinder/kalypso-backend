-- Kalypso Bridge.xyz Integration - Enhanced Cards Migration
-- Migration 007: Crypto Debit Cards Enhancement

-- ============================================================================
-- DROP EXISTING CARD_ACCOUNTS TABLE AND RECREATE WITH BRIDGE FIELDS
-- ============================================================================
DROP TABLE IF EXISTS public.card_accounts CASCADE;

-- ============================================================================
-- BRIDGE CARDS (Crypto Debit Cards)
-- ============================================================================
-- Enhanced table for Bridge.xyz card integration
CREATE TABLE IF NOT EXISTS public.bridge_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_card_id TEXT UNIQUE NOT NULL,
    bridge_customer_id TEXT,

    -- Card Details
    card_type TEXT DEFAULT 'virtual' CHECK (card_type IN ('virtual', 'physical')),
    card_brand TEXT DEFAULT 'visa' CHECK (card_brand IN ('visa', 'mastercard')),
    last_4 TEXT,
    expiry_month INTEGER,
    expiry_year INTEGER,
    cardholder_name TEXT NOT NULL,

    -- Card Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'frozen', 'cancelled', 'expired')),
    activation_status TEXT DEFAULT 'pending' CHECK (activation_status IN ('pending', 'activated', 'declined')),

    -- Shipping Info (Physical Cards)
    shipping_status TEXT CHECK (shipping_status IN ('pending', 'shipped', 'delivered', 'failed')),
    tracking_number TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    -- Spending Controls
    daily_spend_limit DECIMAL(10, 2) DEFAULT 1000.00,
    monthly_spend_limit DECIMAL(10, 2) DEFAULT 10000.00,
    single_transaction_limit DECIMAL(10, 2) DEFAULT 500.00,

    -- Current Spend Tracking (Reset daily/monthly)
    current_daily_spend DECIMAL(10, 2) DEFAULT 0,
    current_monthly_spend DECIMAL(10, 2) DEFAULT 0,
    last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
    last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),

    -- Card Controls
    is_frozen BOOLEAN DEFAULT FALSE,
    frozen_at TIMESTAMPTZ,
    frozen_reason TEXT,

    -- International/Online Controls
    international_enabled BOOLEAN DEFAULT TRUE,
    online_enabled BOOLEAN DEFAULT TRUE,
    contactless_enabled BOOLEAN DEFAULT TRUE,
    atm_enabled BOOLEAN DEFAULT TRUE,

    -- PIN Management
    pin_set BOOLEAN DEFAULT FALSE,
    pin_last_changed_at TIMESTAMPTZ,

    -- Metadata
    memo TEXT,
    tags TEXT[],

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    activated_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- Create partial unique index to ensure one active card per type per user
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_card_per_type
    ON public.bridge_cards (user_id, card_type)
    WHERE status = 'active';

-- ============================================================================
-- CARD TRANSACTIONS (Separate from wallet transactions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.card_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES public.bridge_cards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_transaction_id TEXT UNIQUE NOT NULL,

    -- Transaction Details
    amount DECIMAL(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    merchant_name TEXT,
    merchant_category TEXT,
    merchant_city TEXT,
    merchant_country TEXT,

    -- Transaction Type
    type TEXT CHECK (type IN ('purchase', 'refund', 'atm_withdrawal', 'fee', 'decline')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'settled', 'reversed')),

    -- Decline Info
    decline_reason TEXT,

    -- Metadata
    description TEXT,
    pos_entry_mode TEXT,
    is_international BOOLEAN DEFAULT FALSE,
    is_online BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    settled_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Bridge Cards
CREATE INDEX idx_bridge_cards_user_id ON public.bridge_cards(user_id);
CREATE INDEX idx_bridge_cards_bridge_id ON public.bridge_cards(bridge_card_id);
CREATE INDEX idx_bridge_cards_status ON public.bridge_cards(status);
CREATE INDEX idx_bridge_cards_type ON public.bridge_cards(card_type);
CREATE INDEX idx_bridge_cards_last_4 ON public.bridge_cards(last_4);

-- Card Transactions
CREATE INDEX idx_card_transactions_card_id ON public.card_transactions(card_id);
CREATE INDEX idx_card_transactions_user_id ON public.card_transactions(user_id);
CREATE INDEX idx_card_transactions_bridge_id ON public.card_transactions(bridge_transaction_id);
CREATE INDEX idx_card_transactions_status ON public.card_transactions(status);
CREATE INDEX idx_card_transactions_created_at ON public.card_transactions(created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================
CREATE TRIGGER update_bridge_cards_updated_at
    BEFORE UPDATE ON public.bridge_cards
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.bridge_cards IS 'Crypto debit cards (Visa/Mastercard) created via Bridge cards API. Supports virtual and physical cards.';
COMMENT ON COLUMN public.bridge_cards.bridge_card_id IS 'Bridge API card ID';
COMMENT ON COLUMN public.bridge_cards.card_type IS 'Virtual cards for online use, physical cards for in-person';
COMMENT ON COLUMN public.bridge_cards.activation_status IS 'Activation status after user receives card';
COMMENT ON COLUMN public.bridge_cards.shipping_status IS 'Shipping status for physical cards only';
COMMENT ON COLUMN public.bridge_cards.daily_spend_limit IS 'Maximum daily spend in USD';
COMMENT ON COLUMN public.bridge_cards.is_frozen IS 'User can freeze/unfreeze card for security';

COMMENT ON TABLE public.card_transactions IS 'Card purchase transactions, separate from wallet/blockchain transactions';
COMMENT ON COLUMN public.card_transactions.bridge_transaction_id IS 'Bridge API transaction ID';
COMMENT ON COLUMN public.card_transactions.type IS 'Transaction type (purchase, refund, ATM withdrawal, etc.)';
COMMENT ON COLUMN public.card_transactions.decline_reason IS 'Reason for declined transactions';
