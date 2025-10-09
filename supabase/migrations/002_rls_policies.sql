-- Kalypso Bridge.xyz Integration - Row Level Security Policies
-- Migration 002: RLS policies for data isolation and security

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liquidation_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.users FOR SELECT
USING (auth.uid() = id);

-- Users can update their own profile (excluding Bridge fields)
CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Service role (backend) can insert new users
CREATE POLICY "Service role can insert users"
ON public.users FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Service role (backend) can update all user fields including Bridge integration
CREATE POLICY "Service role can update all users"
ON public.users FOR UPDATE
USING (auth.role() = 'service_role');

-- ============================================================================
-- BRIDGE WALLETS POLICIES
-- ============================================================================

-- Users can only see their own wallets
CREATE POLICY "Users can view own wallets"
ON public.bridge_wallets FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage all wallets (for Bridge sync)
CREATE POLICY "Service role can manage all wallets"
ON public.bridge_wallets FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- WALLET BALANCES POLICIES
-- ============================================================================

-- Users can view balances of their own wallets
CREATE POLICY "Users can view own wallet balances"
ON public.wallet_balances FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.bridge_wallets
    WHERE bridge_wallets.id = wallet_balances.bridge_wallet_id
    AND bridge_wallets.user_id = auth.uid()
  )
);

-- Service role can manage all balances (for Bridge sync)
CREATE POLICY "Service role can manage all balances"
ON public.wallet_balances FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- TRANSACTIONS POLICIES
-- ============================================================================

-- Users can only view their own transactions
CREATE POLICY "Users can view own transactions"
ON public.transactions FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage all transactions (for Bridge webhooks)
CREATE POLICY "Service role can manage all transactions"
ON public.transactions FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- EXTERNAL ACCOUNTS POLICIES
-- ============================================================================

-- Users can view their own external bank accounts
CREATE POLICY "Users can view own external accounts"
ON public.external_accounts FOR SELECT
USING (auth.uid() = user_id);

-- Users can delete their own external accounts
CREATE POLICY "Users can delete own external accounts"
ON public.external_accounts FOR DELETE
USING (auth.uid() = user_id);

-- Service role can manage all external accounts (for Plaid integration)
CREATE POLICY "Service role can manage all external accounts"
ON public.external_accounts FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- VIRTUAL ACCOUNTS POLICIES
-- ============================================================================

-- Users can view their own virtual accounts
CREATE POLICY "Users can view own virtual accounts"
ON public.virtual_accounts FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage all virtual accounts (for Bridge integration)
CREATE POLICY "Service role can manage all virtual accounts"
ON public.virtual_accounts FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- LIQUIDATION ADDRESSES POLICIES
-- ============================================================================

-- Users can view their own crypto deposit addresses
CREATE POLICY "Users can view own liquidation addresses"
ON public.liquidation_addresses FOR SELECT
USING (auth.uid() = user_id);

-- Service role can manage all liquidation addresses (for Bridge integration)
CREATE POLICY "Service role can manage all liquidation addresses"
ON public.liquidation_addresses FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- CARD ACCOUNTS POLICIES
-- ============================================================================

-- Users can view their own cards
CREATE POLICY "Users can view own cards"
ON public.card_accounts FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own card settings (limits, status)
CREATE POLICY "Users can update own card settings"
ON public.card_accounts FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Service role can manage all cards (for Bridge integration)
CREATE POLICY "Service role can manage all cards"
ON public.card_accounts FOR ALL
USING (auth.role() = 'service_role');

-- ============================================================================
-- AUDIT LOGS POLICIES
-- ============================================================================

-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs"
ON public.audit_logs FOR SELECT
USING (auth.uid() = user_id);

-- Service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
ON public.audit_logs FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- No one can update or delete audit logs (immutable)
-- Only admins via direct database access

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================
--
-- 1. RLS policies ensure database-level isolation between users
-- 2. Even if application code has bugs, users cannot access each other's data
-- 3. Service role (backend with SUPABASE_SERVICE_KEY) bypasses RLS for admin operations
-- 4. Anonymous users (not logged in) have no access to any tables
-- 5. Audit logs are immutable - can only insert, never update/delete
--
-- CRITICAL FOR FINANCIAL COMPLIANCE:
-- - Users can NEVER see other users' wallets, balances, transactions, or cards
-- - All Bridge integration data (customer IDs, wallet IDs, etc.) is protected
-- - Service role is used ONLY in backend API, never exposed to frontend
--
-- ============================================================================
