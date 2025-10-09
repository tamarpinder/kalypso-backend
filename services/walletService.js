// Bridge.xyz Wallet Service
// Handles wallet creation, balance queries, and transaction history

const bridgeClient = require('./bridgeClient');
const { getUserById, createNotification } = require('../config/supabase.config');
const { supabase } = require('../config/supabase.config');

/**
 * Create a new Bridge wallet for a user
 * @param {string} userId - Kalypso user ID
 * @param {string} type - Wallet type ('user' or 'treasury')
 * @returns {Promise<Object>} Created wallet data
 */
async function createWallet(userId, type = 'user') {
  try {
    // Get user and their Bridge customer ID
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.bridge_customer_id) {
      throw new Error('User must complete KYC before creating wallet');
    }

    console.log(`📝 Creating Bridge wallet for user ${userId}...`);

    // Create wallet via Bridge API
    const walletData = {
      type,
      customer_id: user.bridge_customer_id,
    };

    const bridgeWallet = await bridgeClient.post('/wallets', walletData);

    console.log('✅ Bridge wallet created:', bridgeWallet.id);

    // Sync wallet to database
    await syncWalletToDatabase(bridgeWallet, userId);

    // Create notification
    await createNotification(
      userId,
      'success',
      'Wallet Created',
      `Your ${type} wallet has been created successfully.`,
      { walletId: bridgeWallet.id }
    );

    return {
      success: true,
      wallet: bridgeWallet,
    };
  } catch (error) {
    console.error('❌ Failed to create wallet:', error.message);
    throw new Error('Failed to create wallet');
  }
}

/**
 * Get all wallets for a user
 * @param {string} userId - Kalypso user ID
 * @returns {Promise<Array>} List of wallets
 */
async function getUserWallets(userId) {
  try {
    console.log(`📝 Fetching wallets for user ${userId}...`);

    // Get user's wallets from database
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized');
      return [];
    }

    const { data: wallets, error } = await supabase
      .from('bridge_wallets')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Failed to fetch wallets from database:', error.message);
      throw error;
    }

    console.log(`✅ Found ${wallets?.length || 0} wallets`);

    return wallets || [];
  } catch (error) {
    console.error('❌ Failed to get user wallets:', error.message);
    throw new Error('Failed to get user wallets');
  }
}

/**
 * Get wallet balance from Bridge
 * @param {string} bridgeWalletId - Bridge wallet ID
 * @returns {Promise<Array>} Wallet balances by currency
 */
async function getWalletBalance(bridgeWalletId) {
  try {
    console.log(`📝 Fetching balance for wallet ${bridgeWalletId}...`);

    // Get wallet history from Bridge
    const historyResponse = await bridgeClient.get(`/wallets/${bridgeWalletId}/history?limit=100`);
    const history = historyResponse.data || [];

    // Calculate balances from history
    const balances = calculateBalanceFromHistory(history);

    // Update database with latest balances
    await updateWalletBalancesInDatabase(bridgeWalletId, balances);

    console.log(`✅ Fetched ${balances.length} currency balances`);

    return balances;
  } catch (error) {
    console.error('❌ Failed to get wallet balance:', error.message);
    throw new Error('Failed to get wallet balance');
  }
}

/**
 * Get wallet transaction history
 * @param {string} bridgeWalletId - Bridge wallet ID
 * @param {Object} params - Query parameters (limit, updated_after_ms, updated_before_ms)
 * @returns {Promise<Array>} Transaction history
 */
async function getWalletHistory(bridgeWalletId, params = {}) {
  try {
    console.log(`📝 Fetching history for wallet ${bridgeWalletId}...`);

    const queryParams = new URLSearchParams();
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.updated_after_ms) queryParams.append('updated_after_ms', params.updated_after_ms.toString());
    if (params.updated_before_ms) queryParams.append('updated_before_ms', params.updated_before_ms.toString());

    const queryString = queryParams.toString();
    const url = queryString
      ? `/wallets/${bridgeWalletId}/history?${queryString}`
      : `/wallets/${bridgeWalletId}/history`;

    const response = await bridgeClient.get(url);
    const history = response.data || [];

    console.log(`✅ Fetched ${history.length} transactions`);

    return history;
  } catch (error) {
    console.error('❌ Failed to get wallet history:', error.message);
    throw new Error('Failed to get wallet history');
  }
}

/**
 * Get total balances across all wallets
 * @returns {Promise<Array>} Total balances by currency
 */
async function getTotalBalances() {
  try {
    console.log('📝 Fetching total wallet balances...');

    const response = await bridgeClient.get('/wallets/total_balances');
    const balances = response.data || [];

    console.log(`✅ Fetched ${balances.length} total currency balances`);

    return balances;
  } catch (error) {
    console.error('❌ Failed to get total balances:', error.message);
    throw new Error('Failed to get total balances');
  }
}

/**
 * Calculate current balance from transaction history
 * @param {Array} history - Transaction history
 * @returns {Array} Calculated balances
 */
function calculateBalanceFromHistory(history) {
  const balanceMap = new Map();

  history.forEach(transaction => {
    const { amount, destination, source } = transaction;
    const value = parseFloat(amount);

    // Determine if this is incoming or outgoing
    if (destination.bridge_wallet_id) {
      // Incoming transaction
      const key = `${destination.currency}_${destination.payment_rail}`;
      balanceMap.set(key, (balanceMap.get(key) || 0) + value);
    } else if (source.payment_rail) {
      // Outgoing transaction
      const key = `${source.currency}_${source.payment_rail}`;
      balanceMap.set(key, (balanceMap.get(key) || 0) - value);
    }
  });

  return Array.from(balanceMap.entries()).map(([key, balance]) => {
    const [currency, chain] = key.split('_');
    return {
      balance: balance.toString(),
      currency,
      chain,
    };
  });
}

/**
 * Sync Bridge wallet to Supabase database
 * @param {Object} bridgeWallet - Bridge wallet object
 * @param {string} userId - Kalypso user ID
 */
async function syncWalletToDatabase(bridgeWallet, userId) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot sync wallet');
      return;
    }

    const { data, error } = await supabase
      .from('bridge_wallets')
      .upsert({
        user_id: userId,
        bridge_wallet_id: bridgeWallet.id,
        wallet_type: bridgeWallet.type,
        status: bridgeWallet.status,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'bridge_wallet_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to sync wallet to database:', error.message);
      return;
    }

    console.log('✅ Wallet synced to database');
  } catch (error) {
    console.error('Failed to sync wallet to database:', error.message);
  }
}

/**
 * Update wallet balances in database
 * @param {string} bridgeWalletId - Bridge wallet ID
 * @param {Array} balances - Array of balance objects
 */
async function updateWalletBalancesInDatabase(bridgeWalletId, balances) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot update balances');
      return;
    }

    // Get internal wallet ID
    const { data: wallet, error: walletError } = await supabase
      .from('bridge_wallets')
      .select('id')
      .eq('bridge_wallet_id', bridgeWalletId)
      .single();

    if (walletError || !wallet) {
      console.error('Failed to find wallet in database:', walletError?.message);
      return;
    }

    // Upsert balances
    const balanceRecords = balances.map(balance => ({
      bridge_wallet_id: wallet.id,
      currency: balance.currency,
      chain: balance.chain,
      balance: parseFloat(balance.balance),
      last_updated: new Date().toISOString(),
    }));

    const { error: balanceError } = await supabase
      .from('wallet_balances')
      .upsert(balanceRecords, {
        onConflict: 'bridge_wallet_id,currency,chain',
      });

    if (balanceError) {
      console.error('Failed to update balances in database:', balanceError.message);
      return;
    }

    console.log('✅ Balances synced to database');
  } catch (error) {
    console.error('Failed to update wallet balances in database:', error.message);
  }
}

module.exports = {
  createWallet,
  getUserWallets,
  getWalletBalance,
  getWalletHistory,
  getTotalBalances,
};
