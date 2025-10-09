// Bridge.xyz Transfer Service
// Handles internal, external (on-chain), and ACH transfers

const bridgeClient = require('./bridgeClient');
const { getUserById, createNotification, supabase } = require('../config/supabase.config');

// Check if running in mock mode
const BRIDGE_MODE = process.env.BRIDGE_MODE || 'live';

/**
 * Create a new transfer
 * @param {string} userId - Kalypso user ID
 * @param {Object} transferData - Transfer details
 * @returns {Promise<Object>} Created transfer data
 */
async function createTransfer(userId, transferData) {
  const { type, amount, currency, source_wallet_id, destination } = transferData;

  try {
    // Validate user
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.bridge_customer_id) {
      throw new Error('User must complete KYC before creating transfers');
    }

    console.log(`📝 Creating ${type} transfer for user ${userId}...`);

    // Prepare Bridge transfer payload based on type
    let bridgeTransferData;

    if (type === 'internal') {
      // Internal transfer between Bridge wallets
      bridgeTransferData = {
        source: {
          payment_rail: destination.chain || 'ethereum',
          currency: currency,
        },
        destination: {
          payment_rail: destination.chain || 'ethereum',
          currency: currency,
          to_bridge_wallet_id: destination.wallet_id,
        },
        from_wallet_id: source_wallet_id,
        on_behalf_of: user.bridge_customer_id,
        amount: amount.toString(),
      };
    } else if (type === 'external') {
      // External on-chain transfer
      // For sandbox/testing: If source_wallet_id is test data, use a placeholder address
      // In production, you'd fetch the wallet's actual on-chain address via Bridge API
      const fromAddress = destination.from_address || '0x0000000000000000000000000000000000000000';

      bridgeTransferData = {
        source: {
          payment_rail: destination.chain,
          currency: currency,
          from_address: fromAddress,
        },
        destination: {
          payment_rail: destination.chain,
          currency: currency,
          to_address: destination.address,
        },
        from_wallet_id: source_wallet_id,
        on_behalf_of: user.bridge_customer_id,
        amount: amount.toString(),
      };
    } else if (type === 'ach') {
      // ACH transfer from virtual account to external bank
      bridgeTransferData = {
        source: {
          payment_rail: 'ach',
          currency: 'usd',
          from_external_account_id: source_wallet_id, // This would be external account ID
        },
        destination: {
          payment_rail: 'ach',
          currency: 'usd',
          external_account_details: {
            account_owner_name: destination.account_owner_name,
            account_number: destination.account_number,
            routing_number: destination.routing_number,
          },
        },
        amount: amount.toString(),
      };
    } else {
      throw new Error('Invalid transfer type');
    }

    // Log payload for debugging
    console.log('🔍 Bridge transfer payload:', JSON.stringify(bridgeTransferData, null, 2));

    // Create transfer via Bridge API or use mock
    let bridgeTransfer;

    if (BRIDGE_MODE === 'mock') {
      console.log('🧪 Mock mode: Simulating transfer creation...');

      // Generate mock transfer response
      bridgeTransfer = {
        id: `mock_transfer_${Date.now()}`,
        state: 'pending',
        amount: amount.toString(),
        fee: '0.001',
        source: bridgeTransferData.source,
        destination: bridgeTransferData.destination,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('✅ Mock transfer created:', bridgeTransfer.id);

      // Simulate transfer completion after 2 seconds
      setTimeout(async () => {
        bridgeTransfer.state = 'completed';
        bridgeTransfer.transaction_hash = `0x${Math.random().toString(16).substring(2, 66)}`;
        await updateTransferStatusInDatabase(bridgeTransfer.id, bridgeTransfer);

        await createNotification(
          userId,
          'success',
          'Transfer Completed',
          `Your ${type} transfer of ${amount} ${currency.toUpperCase()} has been completed.`,
          { transferId: bridgeTransfer.id, transactionHash: bridgeTransfer.transaction_hash },
          { priority: 'normal', category: 'transaction' }
        );
      }, 2000);
    } else {
      // Real Bridge API call
      bridgeTransfer = await bridgeClient.post('/transfers', bridgeTransferData);
      console.log('✅ Bridge transfer created:', bridgeTransfer.id);
    }

    // Sync transfer to database
    await syncTransferToDatabase(bridgeTransfer, userId, type, destination);

    // Create notification
    await createNotification(
      userId,
      'info',
      'Transfer Initiated',
      `Your ${type} transfer of ${amount} ${currency.toUpperCase()} has been initiated.`,
      { transferId: bridgeTransfer.id },
      { priority: 'normal', category: 'transaction' }
    );

    return {
      success: true,
      transfer: bridgeTransfer,
    };
  } catch (error) {
    console.error('❌ Failed to create transfer:', error.message);

    // Create error notification
    await createNotification(
      userId,
      'error',
      'Transfer Failed',
      `Failed to initiate transfer: ${error.message}`,
      null,
      { priority: 'high', category: 'transaction' }
    );

    throw new Error(`Failed to create transfer: ${error.message}`);
  }
}

/**
 * Get transfer status
 * @param {string} transferId - Bridge transfer ID
 * @returns {Promise<Object>} Transfer details
 */
async function getTransferStatus(transferId) {
  try {
    console.log(`📝 Fetching status for transfer ${transferId}...`);

    const transfer = await bridgeClient.get(`/transfers/${transferId}`);

    console.log(`✅ Transfer status: ${transfer.state}`);

    // Update database with latest status
    await updateTransferStatusInDatabase(transferId, transfer);

    return transfer;
  } catch (error) {
    console.error('❌ Failed to get transfer status:', error.message);
    throw new Error('Failed to get transfer status');
  }
}

/**
 * List all transfers for a user
 * @param {string} userId - Kalypso user ID
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} List of transfers
 */
async function listTransfers(userId, params = {}) {
  try {
    console.log(`📝 Fetching transfers for user ${userId}...`);

    if (!supabase) {
      console.warn('⚠️  Supabase not initialized');
      return [];
    }

    let query = supabase
      .from('bridge_transfers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Apply filters
    if (params.type) {
      query = query.eq('transfer_type', params.type);
    }
    if (params.status) {
      query = query.eq('status', params.status);
    }
    if (params.limit) {
      query = query.limit(params.limit);
    }

    const { data: transfers, error } = await query;

    if (error) {
      console.error('❌ Failed to fetch transfers from database:', error.message);
      throw error;
    }

    console.log(`✅ Found ${transfers?.length || 0} transfers`);

    return transfers || [];
  } catch (error) {
    console.error('❌ Failed to list transfers:', error.message);
    throw new Error('Failed to list transfers');
  }
}

/**
 * Cancel a pending transfer
 * @param {string} userId - Kalypso user ID
 * @param {string} transferId - Bridge transfer ID
 * @returns {Promise<Object>} Cancelled transfer data
 */
async function cancelTransfer(userId, transferId) {
  try {
    console.log(`📝 Cancelling transfer ${transferId}...`);

    // Get transfer from database to verify ownership
    if (!supabase) {
      throw new Error('Database not initialized');
    }

    const { data: transfer, error } = await supabase
      .from('bridge_transfers')
      .select('*')
      .eq('bridge_transfer_id', transferId)
      .eq('user_id', userId)
      .single();

    if (error || !transfer) {
      throw new Error('Transfer not found or unauthorized');
    }

    if (transfer.status !== 'pending') {
      throw new Error('Can only cancel pending transfers');
    }

    // Cancel via Bridge API (if supported)
    // Note: Bridge API may not support transfer cancellation for all types
    // For now, we'll just update the status in our database

    const { error: updateError } = await supabase
      .from('bridge_transfers')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('bridge_transfer_id', transferId);

    if (updateError) {
      throw updateError;
    }

    console.log('✅ Transfer cancelled');

    // Create notification
    await createNotification(
      userId,
      'info',
      'Transfer Cancelled',
      'Your transfer has been cancelled.',
      { transferId },
      { priority: 'normal', category: 'transaction' }
    );

    return { success: true, transferId };
  } catch (error) {
    console.error('❌ Failed to cancel transfer:', error.message);
    throw new Error(`Failed to cancel transfer: ${error.message}`);
  }
}

/**
 * Sync Bridge transfer to Supabase database
 * @param {Object} bridgeTransfer - Bridge transfer object
 * @param {string} userId - Kalypso user ID
 * @param {string} type - Transfer type
 * @param {Object} destination - Destination details
 */
async function syncTransferToDatabase(bridgeTransfer, userId, type, destination) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot sync transfer');
      return;
    }

    // Extract relevant data from Bridge transfer
    const amount = parseFloat(bridgeTransfer.amount);
    const fee = parseFloat(bridgeTransfer.fee || 0);
    const currency = bridgeTransfer.source?.currency || bridgeTransfer.destination?.currency;

    const transferRecord = {
      user_id: userId,
      bridge_transfer_id: bridgeTransfer.id,
      bridge_source_wallet_id: bridgeTransfer.source?.from_bridge_wallet_id,
      bridge_destination_wallet_id: bridgeTransfer.destination?.to_bridge_wallet_id,
      transfer_type: type,
      amount: amount,
      currency: currency,
      fee: fee,
      total_amount: amount + fee,
      status: bridgeTransfer.state || 'pending',
      destination_address: destination.address || null,
      destination_chain: destination.chain || null,
      destination_account_number: destination.account_number || null,
      destination_routing_number: destination.routing_number || null,
      destination_user_id: destination.user_id || null,
      description: destination.description || null,
      memo: destination.memo || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bridge_transfers')
      .upsert(transferRecord, {
        onConflict: 'bridge_transfer_id',
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to sync transfer to database:', error.message);
      return;
    }

    console.log('✅ Transfer synced to database');
  } catch (error) {
    console.error('Failed to sync transfer to database:', error.message);
  }
}

/**
 * Update transfer status in database
 * @param {string} bridgeTransferId - Bridge transfer ID
 * @param {Object} bridgeTransfer - Updated Bridge transfer object
 */
async function updateTransferStatusInDatabase(bridgeTransferId, bridgeTransfer) {
  try {
    if (!supabase) {
      console.warn('⚠️  Supabase not initialized - cannot update transfer status');
      return;
    }

    const updates = {
      status: bridgeTransfer.state || 'pending',
      transaction_hash: bridgeTransfer.transaction_hash || null,
      updated_at: new Date().toISOString(),
    };

    // Add completion/failure timestamps
    if (bridgeTransfer.state === 'completed') {
      updates.completed_at = new Date().toISOString();
    } else if (bridgeTransfer.state === 'failed') {
      updates.failed_at = new Date().toISOString();
      updates.error_message = bridgeTransfer.error_message || null;
    } else if (bridgeTransfer.state === 'processing') {
      updates.processing_started_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('bridge_transfers')
      .update(updates)
      .eq('bridge_transfer_id', bridgeTransferId);

    if (error) {
      console.error('Failed to update transfer status in database:', error.message);
      return;
    }

    console.log('✅ Transfer status updated in database');
  } catch (error) {
    console.error('Failed to update transfer status in database:', error.message);
  }
}

module.exports = {
  createTransfer,
  getTransferStatus,
  listTransfers,
  cancelTransfer,
};
