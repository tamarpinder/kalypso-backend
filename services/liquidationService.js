// Bridge.xyz Liquidation Address Service
// Handles crypto liquidation addresses for automatic USD conversion

const bridgeClient = require('./bridgeClient');
const { getUserById, createNotification } = require('../config/supabase.config');
const { supabase } = require('../config/supabase.config');

/**
 * Create a liquidation address for automatic crypto-to-USD conversion
 * @param {string} userId - Kalypso user ID
 * @param {string} currency - Crypto currency (e.g., 'usdc', 'eth', 'btc')
 * @param {string} chain - Blockchain network (e.g., 'ethereum', 'polygon', 'bitcoin')
 * @returns {Promise<Object>} Created liquidation address
 */
async function createLiquidationAddress(userId, currency, chain) {
  try {
    // Get user and their Bridge customer ID
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.bridge_customer_id) {
      throw new Error('User must complete KYC before creating liquidation address');
    }

    console.log(`📝 Creating liquidation address for user ${userId} (${currency} on ${chain})...`);

    // Create liquidation address via Bridge API
    const addressData = {
      customer_id: user.bridge_customer_id,
      currency: currency.toLowerCase(),
      chain: chain.toLowerCase(),
      // Auto-convert to USD and deposit to virtual account
      destination_payment_rail: 'ach',
      destination_currency: 'usd',
    };

    const bridgeAddress = await bridgeClient.post('/liquidation_addresses', addressData);

    console.log('✅ Bridge liquidation address created:', bridgeAddress.id);

    // Sync address to database
    await syncLiquidationAddressToDatabase(bridgeAddress, userId);

    // Create notification
    await createNotification(
      userId,
      'success',
      'Liquidation Address Created',
      `Your ${currency.toUpperCase()} liquidation address on ${chain} has been created. Deposits will auto-convert to USD.`,
      { addressId: bridgeAddress.id, address: bridgeAddress.address }
    );

    return {
      success: true,
      address: bridgeAddress,
    };
  } catch (error) {
    console.error('❌ Failed to create liquidation address:', error.message);
    throw new Error('Failed to create liquidation address');
  }
}

/**
 * Get liquidation address details from Bridge
 * @param {string} addressId - Bridge liquidation address ID
 * @returns {Promise<Object>} Liquidation address details
 */
async function getLiquidationAddress(addressId) {
  try {
    console.log(`📝 Fetching liquidation address ${addressId}...`);

    const address = await bridgeClient.get(`/liquidation_addresses/${addressId}`);

    console.log('✅ Liquidation address fetched');

    return address;
  } catch (error) {
    console.error('❌ Failed to get liquidation address:', error.message);
    throw new Error('Failed to get liquidation address');
  }
}

/**
 * List all liquidation addresses for a user
 * @param {string} userId - Kalypso user ID
 * @returns {Promise<Array>} List of liquidation addresses
 */
async function listLiquidationAddresses(userId) {
  try {
    console.log(`📝 Fetching liquidation addresses for user ${userId}...`);

    // Get user's liquidation addresses from database
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized');
      return [];
    }

    const { data: addresses, error } = await supabase
      .from('liquidation_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Failed to fetch liquidation addresses from database:', error.message);
      throw error;
    }

    console.log(`✅ Found ${addresses?.length || 0} liquidation addresses`);

    return addresses || [];
  } catch (error) {
    console.error('❌ Failed to list liquidation addresses:', error.message);
    throw new Error('Failed to list liquidation addresses');
  }
}

/**
 * Get liquidation address by Bridge address ID
 * @param {string} bridgeAddressId - Bridge liquidation address ID
 * @returns {Promise<Object|null>} Liquidation address from database
 */
async function getLiquidationAddressByBridgeId(bridgeAddressId) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized');
      return null;
    }

    const { data: address, error } = await supabase
      .from('liquidation_addresses')
      .select('*')
      .eq('bridge_liquidation_address_id', bridgeAddressId)
      .single();

    if (error) {
      console.error('❌ Failed to fetch liquidation address from database:', error.message);
      return null;
    }

    return address;
  } catch (error) {
    console.error('❌ Failed to get liquidation address by Bridge ID:', error.message);
    return null;
  }
}

/**
 * Sync Bridge liquidation address to Supabase database
 * @param {Object} bridgeAddress - Bridge liquidation address object
 * @param {string} userId - Kalypso user ID
 */
async function syncLiquidationAddressToDatabase(bridgeAddress, userId) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot sync liquidation address');
      return;
    }

    const { data, error } = await supabase
      .from('liquidation_addresses')
      .upsert({
        user_id: userId,
        bridge_liquidation_address_id: bridgeAddress.id,
        currency: bridgeAddress.currency,
        chain: bridgeAddress.chain,
        address: bridgeAddress.address,
        destination_payment_rail: bridgeAddress.destination_payment_rail,
        destination_currency: bridgeAddress.destination_currency,
        destination_address: bridgeAddress.destination_address || null,
        custom_developer_fee_percent: bridgeAddress.custom_developer_fee_percent || null,
        global_developer_fee_percent: bridgeAddress.global_developer_fee_percent || null,
        status: bridgeAddress.status || 'active',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'bridge_liquidation_address_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to sync liquidation address to database:', error.message);
      return;
    }

    console.log('✅ Liquidation address synced to database');
  } catch (error) {
    console.error('Failed to sync liquidation address to database:', error.message);
  }
}

/**
 * Update liquidation address status in database
 * @param {string} bridgeAddressId - Bridge liquidation address ID
 * @param {string} status - New status
 */
async function updateLiquidationAddressStatus(bridgeAddressId, status) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot update status');
      return;
    }

    const { error } = await supabase
      .from('liquidation_addresses')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_liquidation_address_id', bridgeAddressId);

    if (error) {
      console.error('Failed to update liquidation address status:', error.message);
      return;
    }

    console.log('✅ Liquidation address status updated');
  } catch (error) {
    console.error('Failed to update liquidation address status:', error.message);
  }
}

/**
 * Get supported liquidation currencies and chains
 * @returns {Object} Supported currencies by chain
 */
function getSupportedLiquidationOptions() {
  return {
    ethereum: ['usdc', 'usdt', 'eth'],
    polygon: ['usdc', 'usdt', 'matic'],
    bitcoin: ['btc'],
    solana: ['usdc', 'sol'],
  };
}

module.exports = {
  createLiquidationAddress,
  getLiquidationAddress,
  listLiquidationAddresses,
  getLiquidationAddressByBridgeId,
  syncLiquidationAddressToDatabase,
  updateLiquidationAddressStatus,
  getSupportedLiquidationOptions,
};
