// Bridge.xyz Wallet API Routes
// Handles wallet creation, balance queries, and transaction history

const express = require('express');
const router = express.Router();
const {
  createWallet,
  getUserWallets,
  getWalletBalance,
  getWalletHistory,
  getTotalBalances,
} = require('../../services/walletService');
const { supabase } = require('../../config/supabase.config');

/**
 * POST /api/bridge/wallets
 * Create a new Bridge wallet for a user
 *
 * Body: { userId: string, type?: 'user' | 'treasury' }
 * Returns: { success: boolean, wallet: object }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, type } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    const result = await createWallet(userId, type);

    res.json(result);
  } catch (error) {
    console.error('Wallet creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create wallet',
    });
  }
});

/**
 * GET /api/bridge/wallets/:userId
 * Get all wallets for a user
 *
 * Returns: { success: boolean, wallets: array }
 */
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    const wallets = await getUserWallets(userId);

    res.json({
      success: true,
      wallets,
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get wallets',
    });
  }
});

/**
 * GET /api/bridge/wallets/:bridgeWalletId/balance
 * Get wallet balance from Bridge
 *
 * Returns: { success: boolean, balances: array }
 */
router.get('/:bridgeWalletId/balance', async (req, res) => {
  try {
    const { bridgeWalletId } = req.params;

    if (!bridgeWalletId) {
      return res.status(400).json({
        success: false,
        error: 'bridgeWalletId is required',
      });
    }

    // In sandbox mode, Bridge API doesn't support balance endpoint
    // Fetch directly from database instead - first get wallet, then balances

    // Step 1: Get the wallet's internal UUID
    const { data: wallet, error: walletError } = await supabase
      .from('bridge_wallets')
      .select('id')
      .eq('bridge_wallet_id', bridgeWalletId)
      .single();

    if (walletError || !wallet) {
      console.error('❌ Wallet not found:', bridgeWalletId);
      return res.json({ success: true, balances: [] });
    }

    // Step 2: Get balances using the wallet's internal UUID
    const { data: balances, error: balancesError } = await supabase
      .from('wallet_balances')
      .select('currency, chain, balance, usd_value')
      .eq('bridge_wallet_id', wallet.id);

    if (balancesError) {
      console.error('❌ Database error fetching balances:', balancesError.message);
      return res.json({ success: true, balances: [] });
    }

    console.log(`✅ Found ${balances?.length || 0} balances for wallet ${bridgeWalletId}`);

    // Transform database format to API format
    const formattedBalances = (balances || []).map(b => ({
      currency: b.currency,
      amount: b.balance?.toString() || '0',
      chain: b.chain,
      usdValue: parseFloat(b.balance || '0') * (b.currency === 'USDC' ? 1 : b.currency === 'ETH' ? 3000 : 50000)
    }));

    res.json({
      success: true,
      balances: formattedBalances,
    });
  } catch (error) {
    console.error('Get wallet balance error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get wallet balance',
    });
  }
});

/**
 * GET /api/bridge/wallets/:bridgeWalletId/history
 * Get wallet transaction history
 *
 * Query params: limit, updated_after_ms, updated_before_ms
 * Returns: { success: boolean, history: array }
 */
router.get('/:bridgeWalletId/history', async (req, res) => {
  try {
    const { bridgeWalletId } = req.params;
    const { limit = 10 } = req.query;

    if (!bridgeWalletId) {
      return res.status(400).json({
        success: false,
        error: 'bridgeWalletId is required',
      });
    }

    // In sandbox mode, fetch transaction history from database
    const { data: wallet, error: walletError } = await supabase
      .from('bridge_wallets')
      .select('user_id')
      .eq('bridge_wallet_id', bridgeWalletId)
      .single();

    if (walletError || !wallet) {
      return res.json({ success: true, history: [] });
    }

    // Fetch user's transactions from database
    const { data: transactions, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', wallet.user_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (txError) {
      console.error('❌ Error fetching transactions:', txError.message);
      return res.json({ success: true, history: [] });
    }

    // Transform to frontend format
    const history = (transactions || []).map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount.toString(),
      currency: tx.currency,
      status: tx.status,
      created_at: tx.created_at,
      completed_at: tx.completed_at,
      source_type: tx.source_type,
      destination_type: tx.destination_type,
    }));

    res.json({
      success: true,
      history,
    });
  } catch (error) {
    console.error('Get wallet history error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get wallet history',
    });
  }
});

/**
 * GET /api/bridge/wallets/total/balances
 * Get total balances across all wallets
 *
 * Returns: { success: boolean, balances: array }
 */
router.get('/total/balances', async (req, res) => {
  try {
    const balances = await getTotalBalances();

    res.json({
      success: true,
      balances,
    });
  } catch (error) {
    console.error('Get total balances error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get total balances',
    });
  }
});

module.exports = router;
