// Bridge.xyz Webhook Handler
// Receives and processes webhook events from Bridge

const express = require('express');
const router = express.Router();
const { supabase, getUserByBridgeCustomerId, createAuditLog, createNotification } = require('../config/supabase.config');
const { syncCustomerStatus, mapBridgeStatusToKalypso } = require('../services/customerService');
const { getWalletBalance } = require('../services/walletService');

/**
 * POST /webhooks/bridge
 * Handles all Bridge.xyz webhook events
 *
 * Event types:
 * - customer.updated - KYC status changes
 * - transfer.updated - Transaction status updates
 * - wallet.transaction.created - Wallet transaction initiated
 * - wallet.transaction.confirmed - Wallet transaction confirmed on-chain
 * - card.transaction.created - Card spending
 * - virtual_account.deposit.created - Fiat deposits
 */
router.post('/', async (req, res) => {
  try {
    const event = req.body;

    console.log('[Bridge Webhook] Received event:', event.type, event.id);

    // Create audit log
    await createAuditLog({
      eventType: 'bridge_webhook_received',
      description: `Bridge webhook: ${event.type}`,
      data: event,
      bridgeEventId: event.id,
      bridgeEventType: event.type
    });

    // Route to appropriate handler based on event type
    switch (event.type) {
      case 'customer.updated':
        await handleCustomerUpdated(event);
        break;

      case 'transfer.updated':
        await handleTransferUpdated(event);
        break;

      case 'wallet.transaction.created':
        await handleWalletTransactionCreated(event);
        break;

      case 'wallet.transaction.confirmed':
        await handleWalletTransactionConfirmed(event);
        break;

      case 'card.transaction.created':
        await handleCardTransaction(event);
        break;

      case 'virtual_account.deposit.created':
        await handleVirtualAccountDeposit(event);
        break;

      default:
        console.log('[Bridge Webhook] Unhandled event type:', event.type);
    }

    // Always respond with 200 OK to acknowledge receipt
    res.json({ received: true });
  } catch (error) {
    console.error('[Bridge Webhook] Error processing webhook:', error);

    // Log the error but still return 200 to prevent retries
    await createAuditLog({
      eventType: 'bridge_webhook_error',
      description: `Failed to process Bridge webhook: ${error.message}`,
      data: { error: error.message, event: req.body }
    });

    res.json({ received: true, error: error.message });
  }
});

/**
 * Handle customer.updated event
 * Fired when KYC status changes
 */
async function handleCustomerUpdated(event) {
  try {
    const customer = event.data;
    const bridgeCustomerId = customer.id;

    console.log('[Bridge Webhook] Customer updated:', bridgeCustomerId, customer.status);

    // Find user by Bridge customer ID
    const user = await getUserByBridgeCustomerId(bridgeCustomerId);

    if (!user) {
      console.warn('[Bridge Webhook] User not found for Bridge customer:', bridgeCustomerId);
      return;
    }

    // Map Bridge status to Kalypso status
    const { kycStatus, kycTier } = mapBridgeStatusToKalypso(
      customer.status,
      customer.endorsements
    );

    // Update Supabase
    const { error } = await supabase
      .from('users')
      .update({
        kyc_status: kycStatus,
        kyc_tier: kycTier
      })
      .eq('id', user.id);

    if (error) throw error;

    console.log(`[Bridge Webhook] ✅ Updated user ${user.id} KYC status:`, { kycStatus, kycTier });

    // Create audit log
    await createAuditLog({
      userId: user.id,
      eventType: 'kyc_status_updated',
      description: `KYC status updated to ${kycStatus} (tier ${kycTier})`,
      data: { kycStatus, kycTier, bridgeCustomerStatus: customer.status },
      bridgeEventId: event.id,
      bridgeEventType: event.type
    });
  } catch (error) {
    console.error('[Bridge Webhook] Error handling customer.updated:', error);
    throw error;
  }
}

/**
 * Handle transfer.updated event
 * Fired when transaction status changes
 */
async function handleTransferUpdated(event) {
  try {
    const transfer = event.data;
    const bridgeTransferId = transfer.id;

    console.log('[Bridge Webhook] Transfer updated:', bridgeTransferId, transfer.state);

    // Find transaction by Bridge transfer ID
    const { data: transaction } = await supabase
      .from('transactions')
      .select('*')
      .eq('bridge_transfer_id', bridgeTransferId)
      .single();

    if (!transaction) {
      console.warn('[Bridge Webhook] Transaction not found for Bridge transfer:', bridgeTransferId);
      return;
    }

    // Map Bridge state to transaction status
    const statusMap = {
      'pending': 'pending',
      'processing': 'processing',
      'payment_processed': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled'
    };

    const status = statusMap[transfer.state] || 'processing';

    // Update transaction
    const updateData = {
      status,
      bridge_state: transfer.state,
      bridge_receipt: transfer,
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('transactions')
      .update(updateData)
      .eq('id', transaction.id);

    if (error) throw error;

    console.log(`[Bridge Webhook] ✅ Updated transaction ${transaction.id} status:`, status);

    // If completed, update wallet balance cache
    if (status === 'completed') {
      // TODO: Trigger wallet balance refresh
      console.log('[Bridge Webhook] TODO: Refresh wallet balance for user:', transaction.user_id);
    }
  } catch (error) {
    console.error('[Bridge Webhook] Error handling transfer.updated:', error);
    throw error;
  }
}

/**
 * Handle card.transaction.created event
 * Fired when user spends with crypto card
 */
async function handleCardTransaction(event) {
  try {
    const cardTransaction = event.data;
    console.log('[Bridge Webhook] Card transaction created:', cardTransaction.id);

    // Extract card and transaction details
    const bridgeCardId = cardTransaction.card_id;
    const bridgeTransactionId = cardTransaction.id;
    const amount = parseFloat(cardTransaction.amount);
    const currency = (cardTransaction.currency || 'usd').toUpperCase();

    if (!bridgeCardId) {
      console.warn('[Bridge Webhook] No card ID found in transaction');
      return;
    }

    // Find card by Bridge card ID
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('id, user_id, current_daily_spend, current_monthly_spend, daily_spend_limit, monthly_spend_limit, last_daily_reset, last_monthly_reset')
      .eq('bridge_card_id', bridgeCardId)
      .single();

    if (!card) {
      console.warn('[Bridge Webhook] Card not found:', bridgeCardId);
      return;
    }

    const userId = card.user_id;

    // Determine transaction type and status
    const transactionType = cardTransaction.type || 'purchase';
    const transactionStatus = cardTransaction.status || 'pending';
    const isApproved = transactionStatus === 'approved' || transactionStatus === 'settled';
    const isDeclined = transactionStatus === 'declined';

    // Create card transaction record
    const { error: insertError } = await supabase
      .from('card_transactions')
      .insert({
        card_id: card.id,
        user_id: userId,
        bridge_transaction_id: bridgeTransactionId,
        amount,
        currency: currency.toLowerCase(),
        merchant_name: cardTransaction.merchant?.name || null,
        merchant_category: cardTransaction.merchant?.category || null,
        merchant_city: cardTransaction.merchant?.city || null,
        merchant_country: cardTransaction.merchant?.country || null,
        type: transactionType,
        status: transactionStatus,
        decline_reason: cardTransaction.decline_reason || null,
        description: cardTransaction.description || null,
        is_international: cardTransaction.is_international || false,
        is_online: cardTransaction.is_online || false,
        created_at: cardTransaction.created_at || new Date().toISOString(),
        settled_at: transactionStatus === 'settled' ? new Date().toISOString() : null
      });

    if (insertError) {
      console.error('[Bridge Webhook] Failed to insert card transaction:', insertError.message);
    } else {
      console.log('[Bridge Webhook] ✅ Card transaction record created');
    }

    // Update spending limits if transaction was approved
    if (isApproved && transactionType === 'purchase') {
      await updateCardSpendingLimits(card, amount);
    }

    // Create audit log
    await createAuditLog({
      userId,
      eventType: 'card_transaction_created',
      description: `Card ${isApproved ? 'purchase' : (isDeclined ? 'declined' : 'transaction')}: ${amount} ${currency}${cardTransaction.merchant?.name ? ' at ' + cardTransaction.merchant.name : ''}`,
      data: { cardTransaction, transactionType, transactionStatus, amount, currency },
      bridgeEventId: event.id,
      bridgeEventType: event.type
    });

    // Create user notification
    let notificationTitle, notificationMessage, notificationType;

    if (isDeclined) {
      notificationTitle = 'Card Declined';
      notificationMessage = `Transaction of ${amount} ${currency} was declined${cardTransaction.decline_reason ? ': ' + cardTransaction.decline_reason : ''}`;
      notificationType = 'warning';
    } else if (isApproved) {
      notificationTitle = 'Card Purchase';
      notificationMessage = `${amount} ${currency}${cardTransaction.merchant?.name ? ' at ' + cardTransaction.merchant.name : ''}`;
      notificationType = 'info';
    } else {
      notificationTitle = 'Card Transaction';
      notificationMessage = `Transaction of ${amount} ${currency} is pending`;
      notificationType = 'info';
    }

    await createNotification(
      userId,
      notificationType,
      notificationTitle,
      notificationMessage,
      {
        transactionId: bridgeTransactionId,
        amount,
        currency,
        merchantName: cardTransaction.merchant?.name || null,
        type: transactionType,
        status: transactionStatus
      },
      {
        priority: isDeclined ? 'high' : 'normal',
        category: 'card'
      }
    );

    console.log(`[Bridge Webhook] ✅ Processed card transaction for user ${userId}`);
  } catch (error) {
    console.error('[Bridge Webhook] Error handling card.transaction.created:', error);
    throw error;
  }
}

/**
 * Update card spending limits after a purchase
 * @param {Object} card - Card database record
 * @param {number} amount - Transaction amount
 */
async function updateCardSpendingLimits(card, amount) {
  try {
    const now = new Date();
    const lastDailyReset = new Date(card.last_daily_reset);
    const lastMonthlyReset = new Date(card.last_monthly_reset);

    // Check if we need to reset daily spending (24 hours)
    const hoursSinceDaily = (now - lastDailyReset) / (1000 * 60 * 60);
    const shouldResetDaily = hoursSinceDaily >= 24;

    // Check if we need to reset monthly spending (30 days)
    const daysSinceMonthly = (now - lastMonthlyReset) / (1000 * 60 * 60 * 24);
    const shouldResetMonthly = daysSinceMonthly >= 30;

    const updates = {
      current_daily_spend: shouldResetDaily ? amount : card.current_daily_spend + amount,
      current_monthly_spend: shouldResetMonthly ? amount : card.current_monthly_spend + amount,
      updated_at: now.toISOString()
    };

    if (shouldResetDaily) {
      updates.last_daily_reset = now.toISOString();
    }
    if (shouldResetMonthly) {
      updates.last_monthly_reset = now.toISOString();
    }

    const { error } = await supabase
      .from('bridge_cards')
      .update(updates)
      .eq('id', card.id);

    if (error) {
      console.error('[Bridge Webhook] Failed to update card spending limits:', error.message);
    } else {
      console.log('[Bridge Webhook] ✅ Updated card spending limits');

      // Check if limits were exceeded
      const newDailySpend = updates.current_daily_spend;
      const newMonthlySpend = updates.current_monthly_spend;

      if (newDailySpend > card.daily_spend_limit) {
        console.warn('[Bridge Webhook] ⚠️  Daily spending limit exceeded');
      }
      if (newMonthlySpend > card.monthly_spend_limit) {
        console.warn('[Bridge Webhook] ⚠️  Monthly spending limit exceeded');
      }
    }
  } catch (error) {
    console.error('[Bridge Webhook] Error updating card spending limits:', error.message);
  }
}

/**
 * Handle virtual_account.deposit.created event
 * Fired when user deposits fiat to virtual account via ACH/Wire
 */
async function handleVirtualAccountDeposit(event) {
  try {
    const deposit = event.data;
    console.log('[Bridge Webhook] Virtual account deposit created:', deposit.id);

    // Extract deposit details
    const bridgeAccountId = deposit.external_account_id;
    const bridgeDepositId = deposit.id;
    const amount = parseFloat(deposit.amount);
    const currency = (deposit.currency || 'usd').toUpperCase();
    const status = deposit.status || 'pending';

    if (!bridgeAccountId) {
      console.warn('[Bridge Webhook] No account ID found in deposit');
      return;
    }

    // Find virtual account by Bridge account ID
    const { data: virtualAccount } = await supabase
      .from('bridge_virtual_accounts')
      .select('id, user_id')
      .eq('bridge_account_id', bridgeAccountId)
      .single();

    if (!virtualAccount) {
      console.warn('[Bridge Webhook] Virtual account not found:', bridgeAccountId);
      return;
    }

    const userId = virtualAccount.user_id;

    // Create deposit record in bridge_transfers table
    // (ACH deposits are technically incoming transfers)
    const depositRecord = {
      user_id: userId,
      bridge_transfer_id: bridgeDepositId,
      transfer_type: 'ach',
      amount,
      currency: currency.toLowerCase(),
      fee: 0,
      total_amount: amount,
      status: status === 'completed' ? 'completed' : 'pending',
      description: `ACH deposit of ${amount} ${currency}`,
      created_at: deposit.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (status === 'completed') {
      depositRecord.completed_at = deposit.completed_at || new Date().toISOString();
    }

    const { error: insertError } = await supabase
      .from('bridge_transfers')
      .insert(depositRecord);

    if (insertError) {
      console.error('[Bridge Webhook] Failed to insert deposit record:', insertError.message);
    } else {
      console.log('[Bridge Webhook] ✅ Deposit record created');
    }

    // Create audit log
    await createAuditLog({
      userId,
      eventType: 'virtual_account_deposit_created',
      description: `Virtual account deposit ${status}: ${amount} ${currency}`,
      data: {
        deposit,
        amount,
        currency,
        status,
        bridgeAccountId,
        bridgeDepositId
      },
      bridgeEventId: event.id,
      bridgeEventType: event.type
    });

    // Create user notification
    let notificationTitle, notificationMessage, notificationType;

    if (status === 'completed') {
      notificationTitle = 'Deposit Received';
      notificationMessage = `${amount} ${currency} has been deposited to your virtual account`;
      notificationType = 'success';
    } else if (status === 'pending') {
      notificationTitle = 'Deposit Pending';
      notificationMessage = `Deposit of ${amount} ${currency} is being processed`;
      notificationType = 'info';
    } else if (status === 'failed') {
      notificationTitle = 'Deposit Failed';
      notificationMessage = `Deposit of ${amount} ${currency} failed${deposit.failure_reason ? ': ' + deposit.failure_reason : ''}`;
      notificationType = 'error';
    } else {
      notificationTitle = 'Deposit Update';
      notificationMessage = `Deposit of ${amount} ${currency} status: ${status}`;
      notificationType = 'info';
    }

    await createNotification(
      userId,
      notificationType,
      notificationTitle,
      notificationMessage,
      {
        depositId: bridgeDepositId,
        amount,
        currency,
        status,
        accountId: bridgeAccountId
      },
      {
        priority: status === 'failed' ? 'urgent' : (status === 'completed' && amount >= 10000 ? 'high' : 'normal'),
        category: 'transaction'
      }
    );

    console.log(`[Bridge Webhook] ✅ Processed virtual account deposit for user ${userId}`);

    // If deposit is completed, we could automatically initiate conversion to crypto here
    // For now, we'll leave that as a manual/scheduled operation or separate webhook
    if (status === 'completed') {
      console.log('[Bridge Webhook] 💡 Deposit completed - consider initiating fiat-to-crypto conversion');
    }
  } catch (error) {
    console.error('[Bridge Webhook] Error handling virtual_account.deposit.created:', error);
    throw error;
  }
}

/**
 * Handle wallet.transaction.created event
 * Fired when a wallet transaction is initiated
 */
async function handleWalletTransactionCreated(event) {
  try {
    const transaction = event.data;
    console.log('[Bridge Webhook] Wallet transaction created:', transaction.id);

    // Extract wallet ID and transaction details
    const walletId = transaction.source?.from_bridge_wallet_id || transaction.destination?.to_bridge_wallet_id;

    if (!walletId) {
      console.warn('[Bridge Webhook] No wallet ID found in transaction');
      return;
    }

    // Find user by wallet ID
    const { data: wallet } = await supabase
      .from('bridge_wallets')
      .select('user_id')
      .eq('bridge_wallet_id', walletId)
      .single();

    if (!wallet) {
      console.warn('[Bridge Webhook] Wallet not found:', walletId);
      return;
    }

    const userId = wallet.user_id;

    // Determine transaction type and amount
    const isIncoming = transaction.destination?.to_bridge_wallet_id === walletId;
    const amount = parseFloat(transaction.amount);
    const currency = (transaction.source?.currency || transaction.destination?.currency || '').toUpperCase();
    const transactionType = isIncoming ? 'incoming' : 'outgoing';

    // Create audit log
    await createAuditLog({
      userId,
      eventType: 'wallet_transaction_created',
      description: `${transactionType} wallet transaction created: ${amount} ${currency}`,
      data: { transaction, walletId, transactionType, amount, currency },
      bridgeEventId: event.id,
      bridgeEventType: event.type
    });

    // Create user notification
    const notificationTitle = isIncoming ? 'Incoming Transaction' : 'Outgoing Transaction';
    const notificationMessage = `${isIncoming ? 'Receiving' : 'Sending'} ${amount} ${currency}`;

    await createNotification(
      userId,
      'info',
      notificationTitle,
      notificationMessage,
      {
        transactionId: transaction.id,
        amount,
        currency,
        type: transactionType,
        status: 'pending'
      },
      {
        priority: 'normal',
        category: 'wallet'
      }
    );

    console.log(`[Bridge Webhook] ✅ Processed wallet transaction created for user ${userId}`);
  } catch (error) {
    console.error('[Bridge Webhook] Error handling wallet.transaction.created:', error);
    throw error;
  }
}

/**
 * Handle wallet.transaction.confirmed event
 * Fired when a wallet transaction is confirmed on-chain
 */
async function handleWalletTransactionConfirmed(event) {
  try {
    const transaction = event.data;
    console.log('[Bridge Webhook] Wallet transaction confirmed:', transaction.id);

    // Extract wallet ID and transaction details
    const walletId = transaction.source?.from_bridge_wallet_id || transaction.destination?.to_bridge_wallet_id;

    if (!walletId) {
      console.warn('[Bridge Webhook] No wallet ID found in transaction');
      return;
    }

    // Find user by wallet ID
    const { data: wallet } = await supabase
      .from('bridge_wallets')
      .select('user_id')
      .eq('bridge_wallet_id', walletId)
      .single();

    if (!wallet) {
      console.warn('[Bridge Webhook] Wallet not found:', walletId);
      return;
    }

    const userId = wallet.user_id;

    // Determine transaction type and amount
    const isIncoming = transaction.destination?.to_bridge_wallet_id === walletId;
    const amount = parseFloat(transaction.amount);
    const currency = (transaction.source?.currency || transaction.destination?.currency || '').toUpperCase();
    const transactionType = isIncoming ? 'incoming' : 'outgoing';
    const txHash = transaction.transaction_hash || transaction.external_identifier;

    // Refresh wallet balance
    console.log('[Bridge Webhook] Refreshing wallet balance for wallet:', walletId);
    try {
      await getWalletBalance(walletId);
      console.log('[Bridge Webhook] ✅ Wallet balance refreshed');
    } catch (balanceError) {
      console.error('[Bridge Webhook] Failed to refresh wallet balance:', balanceError.message);
    }

    // Create audit log
    await createAuditLog({
      userId,
      eventType: 'wallet_transaction_confirmed',
      description: `${transactionType} wallet transaction confirmed: ${amount} ${currency}`,
      data: {
        transaction,
        walletId,
        transactionType,
        amount,
        currency,
        transactionHash: txHash
      },
      bridgeEventId: event.id,
      bridgeEventType: event.type
    });

    // Create user notification
    const notificationTitle = isIncoming ? 'Transaction Received' : 'Transaction Sent';
    const notificationMessage = `${isIncoming ? 'Received' : 'Sent'} ${amount} ${currency}`;

    await createNotification(
      userId,
      'success',
      notificationTitle,
      notificationMessage,
      {
        transactionId: transaction.id,
        amount,
        currency,
        type: transactionType,
        status: 'confirmed',
        transactionHash: txHash
      },
      {
        priority: isIncoming && amount > 1000 ? 'high' : 'normal',
        category: 'wallet'
      }
    );

    console.log(`[Bridge Webhook] ✅ Processed wallet transaction confirmed for user ${userId}`);
  } catch (error) {
    console.error('[Bridge Webhook] Error handling wallet.transaction.confirmed:', error);
    throw error;
  }
}

module.exports = router;
