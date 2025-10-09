-- Kalypso Bridge.xyz Integration Schema
-- Migration 001: Core tables for Bridge integration

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS TABLE (extends Supabase auth.users)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Profile Information
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    phone TEXT,

    -- Bridge Integration
    bridge_customer_id TEXT UNIQUE,
    kyc_status TEXT DEFAULT 'not_started' CHECK (kyc_status IN ('not_started', 'pending', 'under_review', 'approved', 'rejected')),
    kyc_tier INTEGER DEFAULT 1 CHECK (kyc_tier IN (1, 2)),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BRIDGE WALLETS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.bridge_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_wallet_id TEXT UNIQUE NOT NULL,
    wallet_type TEXT DEFAULT 'user' CHECK (wallet_type IN ('user', 'treasury')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'frozen')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, wallet_type)
);

-- ============================================================================
-- WALLET BALANCES (cached from Bridge)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wallet_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bridge_wallet_id UUID NOT NULL REFERENCES public.bridge_wallets(id) ON DELETE CASCADE,

    -- Balance Details
    currency TEXT NOT NULL,
    chain TEXT,
    balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
    usd_value DECIMAL(20, 2) DEFAULT 0,
    contract_address TEXT,

    -- Metadata
    last_updated TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(bridge_wallet_id, currency, chain)
);

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_transfer_id TEXT UNIQUE,

    -- Transaction Details
    type TEXT NOT NULL CHECK (type IN ('onramp', 'offramp', 'transfer', 'card_spend', 'card_refund', 'deposit', 'withdrawal')),
    amount DECIMAL(20, 8) NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

    -- Source and Destination
    source_type TEXT,
    source_details JSONB,
    destination_type TEXT,
    destination_details JSONB,

    -- Fees
    developer_fee DECIMAL(20, 8) DEFAULT 0,
    exchange_fee DECIMAL(20, 8) DEFAULT 0,
    gas_fee DECIMAL(20, 8) DEFAULT 0,
    total_fee DECIMAL(20, 8) DEFAULT 0,

    -- Bridge Integration
    bridge_state TEXT,
    bridge_receipt JSONB,
    bridge_tx_hash TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- EXTERNAL ACCOUNTS (Bank Accounts via Plaid)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.external_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_external_account_id TEXT UNIQUE NOT NULL,

    -- Account Details
    account_type TEXT NOT NULL CHECK (account_type IN ('us', 'sepa', 'uk', 'canada')),
    currency TEXT NOT NULL DEFAULT 'usd',
    account_owner_name TEXT,
    bank_name TEXT,
    last_4 TEXT,
    active BOOLEAN DEFAULT TRUE,

    -- Account Specifics (stored as JSONB for flexibility)
    account_details JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- VIRTUAL ACCOUNTS (US Virtual Bank Accounts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.virtual_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_virtual_account_id TEXT UNIQUE NOT NULL,

    -- Account Details
    currency TEXT NOT NULL DEFAULT 'usd' CHECK (currency IN ('usd', 'eur', 'mxn')),
    status TEXT DEFAULT 'activated' CHECK (status IN ('activated', 'deactivated')),
    developer_fee_percent DECIMAL(5, 4) DEFAULT 0,

    -- Deposit Instructions (stored as JSONB)
    deposit_instructions JSONB,

    -- Destination Configuration
    destination_currency TEXT,
    destination_payment_rail TEXT,
    destination_address TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LIQUIDATION ADDRESSES (Crypto Deposit Addresses)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.liquidation_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_liquidation_address_id TEXT UNIQUE NOT NULL,

    -- Address Details
    currency TEXT NOT NULL,
    chain TEXT NOT NULL,
    address TEXT NOT NULL,

    -- Destination Configuration
    destination_payment_rail TEXT,
    destination_currency TEXT,
    destination_address TEXT,

    -- Fee Configuration
    custom_developer_fee_percent DECIMAL(5, 4),
    global_developer_fee_percent DECIMAL(5, 4),

    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, currency, chain)
);

-- ============================================================================
-- CARD ACCOUNTS (Crypto Debit Cards)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.card_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_card_account_id TEXT UNIQUE NOT NULL,

    -- Card Details
    card_type TEXT DEFAULT 'virtual' CHECK (card_type IN ('virtual', 'physical')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'blocked', 'expired', 'frozen')),
    last_4 TEXT,
    expiry_month INTEGER,
    expiry_year INTEGER,
    cardholder_name TEXT,

    -- Spending Controls
    daily_limit DECIMAL(10, 2),
    monthly_limit DECIMAL(10, 2),
    current_daily_spend DECIMAL(10, 2) DEFAULT 0,
    current_monthly_spend DECIMAL(10, 2) DEFAULT 0,

    -- PIN Management
    pin_set BOOLEAN DEFAULT FALSE,
    pin_updated_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOGS (Compliance & Security)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),

    -- Event Details
    event_type TEXT NOT NULL,
    event_description TEXT,
    event_data JSONB,

    -- Bridge Integration
    bridge_event_id TEXT,
    bridge_event_type TEXT,

    -- Request Context
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================

-- Users
CREATE INDEX idx_users_bridge_customer_id ON public.users(bridge_customer_id) WHERE bridge_customer_id IS NOT NULL;
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_kyc_status ON public.users(kyc_status);

-- Bridge Wallets
CREATE INDEX idx_bridge_wallets_user_id ON public.bridge_wallets(user_id);
CREATE INDEX idx_bridge_wallets_bridge_id ON public.bridge_wallets(bridge_wallet_id);
CREATE INDEX idx_bridge_wallets_status ON public.bridge_wallets(status);

-- Wallet Balances
CREATE INDEX idx_wallet_balances_bridge_wallet_id ON public.wallet_balances(bridge_wallet_id);
CREATE INDEX idx_wallet_balances_currency ON public.wallet_balances(currency);

-- Transactions
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_bridge_transfer_id ON public.transactions(bridge_transfer_id) WHERE bridge_transfer_id IS NOT NULL;
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);

-- External Accounts
CREATE INDEX idx_external_accounts_user_id ON public.external_accounts(user_id);
CREATE INDEX idx_external_accounts_bridge_id ON public.external_accounts(bridge_external_account_id);

-- Virtual Accounts
CREATE INDEX idx_virtual_accounts_user_id ON public.virtual_accounts(user_id);
CREATE INDEX idx_virtual_accounts_bridge_id ON public.virtual_accounts(bridge_virtual_account_id);

-- Liquidation Addresses
CREATE INDEX idx_liquidation_addresses_user_id ON public.liquidation_addresses(user_id);
CREATE INDEX idx_liquidation_addresses_bridge_id ON public.liquidation_addresses(bridge_liquidation_address_id);
CREATE INDEX idx_liquidation_addresses_address ON public.liquidation_addresses(address);

-- Card Accounts
CREATE INDEX idx_card_accounts_user_id ON public.card_accounts(user_id);
CREATE INDEX idx_card_accounts_bridge_id ON public.card_accounts(bridge_card_account_id);
CREATE INDEX idx_card_accounts_status ON public.card_accounts(status);

-- Audit Logs
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all tables with updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bridge_wallets_updated_at BEFORE UPDATE ON public.bridge_wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_external_accounts_updated_at BEFORE UPDATE ON public.external_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_virtual_accounts_updated_at BEFORE UPDATE ON public.virtual_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_liquidation_addresses_updated_at BEFORE UPDATE ON public.liquidation_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_card_accounts_updated_at BEFORE UPDATE ON public.card_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
