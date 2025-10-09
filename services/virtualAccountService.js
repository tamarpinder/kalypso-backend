// Bridge.xyz Virtual Account Service
// Handles US virtual bank account creation and management

const bridgeClient = require('./bridgeClient');
const { getUserById, createNotification } = require('../config/supabase.config');
const { supabase } = require('../config/supabase.config');

/**
 * Create a new US virtual bank account for a user
 * @param {string} userId - Kalypso user ID
 * @returns {Promise<Object>} Created virtual account data
 */
async function createVirtualAccount(userId) {
  try {
    // Get user and their Bridge customer ID
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.bridge_customer_id) {
      throw new Error('User must complete KYC before creating virtual account');
    }

    console.log(`📝 Creating Bridge virtual account for user ${userId}...`);

    // Create virtual account via Bridge API
    const accountData = {
      customer_id: user.bridge_customer_id,
      currency: 'usd',
      account_owner_name: user.name || `${user.first_name} ${user.last_name}`,
    };

    const bridgeAccount = await bridgeClient.post('/external_accounts', accountData);

    console.log('✅ Bridge virtual account created:', bridgeAccount.id);

    // Sync account to database
    await syncVirtualAccountToDatabase(bridgeAccount, userId);

    // Create notification
    await createNotification(
      userId,
      'success',
      'Virtual Account Created',
      'Your US virtual bank account has been created successfully. You can now receive USD deposits.',
      { accountId: bridgeAccount.id }
    );

    return {
      success: true,
      account: bridgeAccount,
    };
  } catch (error) {
    console.error('❌ Failed to create virtual account:', error.message);
    throw new Error('Failed to create virtual account');
  }
}

/**
 * Get virtual account details from Bridge
 * @param {string} accountId - Bridge external account ID
 * @returns {Promise<Object>} Virtual account details
 */
async function getVirtualAccount(accountId) {
  try {
    console.log(`📝 Fetching virtual account ${accountId}...`);

    const account = await bridgeClient.get(`/external_accounts/${accountId}`);

    console.log('✅ Virtual account fetched');

    return account;
  } catch (error) {
    console.error('❌ Failed to get virtual account:', error.message);
    throw new Error('Failed to get virtual account');
  }
}

/**
 * List all virtual accounts for a user
 * @param {string} userId - Kalypso user ID
 * @returns {Promise<Array>} List of virtual accounts
 */
async function listVirtualAccounts(userId) {
  try {
    console.log(`📝 Fetching virtual accounts for user ${userId}...`);

    // Get user's virtual accounts from database
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized');
      return [];
    }

    const { data: accounts, error } = await supabase
      .from('bridge_virtual_accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('❌ Failed to fetch virtual accounts from database:', error.message);
      throw error;
    }

    console.log(`✅ Found ${accounts?.length || 0} virtual accounts`);

    return accounts || [];
  } catch (error) {
    console.error('❌ Failed to list virtual accounts:', error.message);
    throw new Error('Failed to list virtual accounts');
  }
}

/**
 * Get virtual account by Bridge account ID
 * @param {string} bridgeAccountId - Bridge external account ID
 * @returns {Promise<Object|null>} Virtual account from database
 */
async function getVirtualAccountByBridgeId(bridgeAccountId) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized');
      return null;
    }

    const { data: account, error } = await supabase
      .from('bridge_virtual_accounts')
      .select('*')
      .eq('bridge_account_id', bridgeAccountId)
      .single();

    if (error) {
      console.error('❌ Failed to fetch virtual account from database:', error.message);
      return null;
    }

    return account;
  } catch (error) {
    console.error('❌ Failed to get virtual account by Bridge ID:', error.message);
    return null;
  }
}

/**
 * Sync Bridge virtual account to Supabase database
 * @param {Object} bridgeAccount - Bridge external account object
 * @param {string} userId - Kalypso user ID
 */
async function syncVirtualAccountToDatabase(bridgeAccount, userId) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot sync virtual account');
      return;
    }

    const { data, error } = await supabase
      .from('bridge_virtual_accounts')
      .upsert({
        user_id: userId,
        bridge_account_id: bridgeAccount.id,
        routing_number: bridgeAccount.ach?.routing_number || null,
        account_number: bridgeAccount.ach?.account_number || null,
        account_name: bridgeAccount.account_owner_name,
        currency: bridgeAccount.currency,
        status: bridgeAccount.status,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'bridge_account_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to sync virtual account to database:', error.message);
      return;
    }

    console.log('✅ Virtual account synced to database');
  } catch (error) {
    console.error('Failed to sync virtual account to database:', error.message);
  }
}

/**
 * Update virtual account status in database
 * @param {string} bridgeAccountId - Bridge external account ID
 * @param {string} status - New status
 */
async function updateVirtualAccountStatus(bridgeAccountId, status) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot update status');
      return;
    }

    const { error } = await supabase
      .from('bridge_virtual_accounts')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_account_id', bridgeAccountId);

    if (error) {
      console.error('Failed to update virtual account status:', error.message);
      return;
    }

    console.log('✅ Virtual account status updated');
  } catch (error) {
    console.error('Failed to update virtual account status:', error.message);
  }
}

module.exports = {
  createVirtualAccount,
  getVirtualAccount,
  listVirtualAccounts,
  getVirtualAccountByBridgeId,
  syncVirtualAccountToDatabase,
  updateVirtualAccountStatus,
};
