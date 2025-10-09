-- Kalypso Bridge.xyz Integration - Transfer Operations
-- Migration 008: Bridge Transfers (Internal/External/ACH)

-- ============================================================================
-- BRIDGE TRANSFERS TABLE
-- ============================================================================
-- Handles all types of transfers: internal (wallet-to-wallet), external (on-chain), and ACH
CREATE TABLE IF NOT EXISTS public.bridge_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,

    -- Bridge Integration
    bridge_transfer_id TEXT UNIQUE NOT NULL,
    bridge_source_wallet_id TEXT,
    bridge_destination_wallet_id TEXT,

    -- Transfer Type
    transfer_type TEXT NOT NULL CHECK (transfer_type IN ('internal', 'external', 'ach')),

    -- Amount Details
    amount DECIMAL(20, 8) NOT NULL,
    currency TEXT NOT NULL,
    fee DECIMAL(20, 8) DEFAULT 0,
    total_amount DECIMAL(20, 8) NOT NULL, -- amount + fee

    -- Transfer Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),

    -- Destination Info
    destination_address TEXT, -- For external transfers (blockchain address)
    destination_chain TEXT, -- For external transfers (ethereum, polygon, bitcoin, etc.)
    destination_account_number TEXT, -- For ACH transfers
    destination_routing_number TEXT, -- For ACH transfers
    destination_user_id UUID REFERENCES public.users(id), -- For internal transfers
    destination_wallet_id UUID, -- For internal transfers (local wallet ID)

    -- Transaction Hashes (for blockchain transfers)
    transaction_hash TEXT,
    block_number BIGINT,
    confirmations INTEGER DEFAULT 0,

    -- Metadata
    description TEXT,
    memo TEXT,
    reference_id TEXT, -- User's reference ID

    -- Error Handling
    error_code TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processing_started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX idx_bridge_transfers_user_id ON public.bridge_transfers(user_id);
CREATE INDEX idx_bridge_transfers_bridge_id ON public.bridge_transfers(bridge_transfer_id);
CREATE INDEX idx_bridge_transfers_status ON public.bridge_transfers(status);
CREATE INDEX idx_bridge_transfers_type ON public.bridge_transfers(transfer_type);
CREATE INDEX idx_bridge_transfers_created_at ON public.bridge_transfers(created_at DESC);
CREATE INDEX idx_bridge_transfers_destination_user ON public.bridge_transfers(destination_user_id) WHERE destination_user_id IS NOT NULL;
CREATE INDEX idx_bridge_transfers_tx_hash ON public.bridge_transfers(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE TRIGGER update_bridge_transfers_updated_at
    BEFORE UPDATE ON public.bridge_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.bridge_transfers IS 'All transfer operations: internal (wallet-to-wallet), external (on-chain), and ACH (bank transfers)';
COMMENT ON COLUMN public.bridge_transfers.bridge_transfer_id IS 'Bridge API transfer ID';
COMMENT ON COLUMN public.bridge_transfers.transfer_type IS 'internal: between Kalypso users, external: on-chain withdrawal, ach: bank transfer';
COMMENT ON COLUMN public.bridge_transfers.destination_address IS 'Blockchain address for external transfers';
COMMENT ON COLUMN public.bridge_transfers.destination_chain IS 'Blockchain network for external transfers (ethereum, polygon, bitcoin, etc.)';
COMMENT ON COLUMN public.bridge_transfers.destination_user_id IS 'Recipient user ID for internal transfers';
COMMENT ON COLUMN public.bridge_transfers.transaction_hash IS 'Blockchain transaction hash for on-chain transfers';
COMMENT ON COLUMN public.bridge_transfers.status IS 'Transfer lifecycle: pending -> processing -> completed/failed';
