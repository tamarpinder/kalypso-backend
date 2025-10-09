-- Kalypso Bridge.xyz Integration - Virtual Accounts Migration
-- Migration 005: US Virtual Bank Accounts (External Accounts)

-- ============================================================================
-- BRIDGE VIRTUAL ACCOUNTS (US Virtual Bank Accounts)
-- ============================================================================
-- This table stores US virtual bank account details from Bridge's external_accounts API
-- These are different from the virtual_accounts table (which is for liquidation)
CREATE TABLE IF NOT EXISTS public.bridge_virtual_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_account_id TEXT UNIQUE NOT NULL,

    -- ACH Account Details
    routing_number TEXT,
    account_number TEXT,
    account_name TEXT NOT NULL,

    -- Account Configuration
    currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency IN ('usd', 'eur', 'mxn')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive', 'closed')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one account per user (for now)
    UNIQUE(user_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_bridge_virtual_accounts_user_id ON public.bridge_virtual_accounts(user_id);
CREATE INDEX idx_bridge_virtual_accounts_bridge_id ON public.bridge_virtual_accounts(bridge_account_id);
CREATE INDEX idx_bridge_virtual_accounts_status ON public.bridge_virtual_accounts(status);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE TRIGGER update_bridge_virtual_accounts_updated_at
    BEFORE UPDATE ON public.bridge_virtual_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.bridge_virtual_accounts IS 'US virtual bank accounts created via Bridge external_accounts API. Used for receiving USD deposits via ACH/Wire.';
COMMENT ON COLUMN public.bridge_virtual_accounts.bridge_account_id IS 'Bridge API external_account ID';
COMMENT ON COLUMN public.bridge_virtual_accounts.routing_number IS 'US bank routing number (ABA routing number)';
COMMENT ON COLUMN public.bridge_virtual_accounts.account_number IS 'US bank account number';
COMMENT ON COLUMN public.bridge_virtual_accounts.account_name IS 'Account owner name displayed to senders';
