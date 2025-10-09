/**
 * Kalypso Bridge Cards Service
 * Handles crypto debit card operations via Bridge.xyz API
 */

const { supabase } = require('../config/supabase.config');
const bridgeClient = require('./bridgeClient');

/**
 * Create a new Bridge card (virtual or physical)
 */
async function createCard(userId, cardType = 'virtual', cardholderName) {
  try {
    // Get user's Bridge customer ID
    const { data: user } = await supabase
      .from('users')
      .select('bridge_customer_id')
      .eq('id', userId)
      .single();

    if (!user?.bridge_customer_id) {
      throw new Error('User must complete KYC before creating a card');
    }

    // Create card via Bridge API
    const cardData = {
      customer_id: user.bridge_customer_id,
      type: cardType, // 'virtual' or 'physical'
      cardholder_name: cardholderName,
      currency: 'usd',
      brand: 'visa' // Default to Visa
    };

    const bridgeCard = await bridgeClient.post('/cards', cardData);

    // Sync to database
    const dbCard = await syncCardToDatabase(bridgeCard, userId);

    return {
      success: true,
      card: dbCard
    };
  } catch (error) {
    console.error('Error creating card:', error);
    throw error;
  }
}

/**
 * Get all cards for a user
 */
async function getUserCards(userId) {
  try {
    const { data: cards, error } = await supabase
      .from('bridge_cards')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return {
      success: true,
      cards: cards || []
    };
  } catch (error) {
    console.error('Error fetching user cards:', error);
    throw error;
  }
}

/**
 * Get card details from Bridge API
 */
async function getCardDetails(cardId) {
  try {
    // Get card from database first
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('*')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    // Fetch latest details from Bridge
    const bridgeCard = await bridgeClient.get(`/cards/${card.bridge_card_id}`);

    // Update database with latest info
    await syncCardToDatabase(bridgeCard, card.user_id);

    return {
      success: true,
      card: bridgeCard
    };
  } catch (error) {
    console.error('Error fetching card details:', error);
    throw error;
  }
}

/**
 * Activate a card
 */
async function activateCard(cardId, activationCode = null) {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    const activationData = activationCode ? { activation_code: activationCode } : {};
    const bridgeCard = await bridgeClient.post(`/cards/${card.bridge_card_id}/activate`, activationData);

    // Update database
    await supabase
      .from('bridge_cards')
      .update({
        status: 'active',
        activation_status: 'activated',
        activated_at: new Date().toISOString()
      })
      .eq('id', cardId);

    return {
      success: true,
      card: bridgeCard
    };
  } catch (error) {
    console.error('Error activating card:', error);
    throw error;
  }
}

/**
 * Freeze a card
 */
async function freezeCard(cardId, reason = 'user_requested') {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    await bridgeClient.post(`/cards/${card.bridge_card_id}/freeze`, { reason });

    // Update database
    await supabase
      .from('bridge_cards')
      .update({
        is_frozen: true,
        frozen_at: new Date().toISOString(),
        frozen_reason: reason
      })
      .eq('id', cardId);

    return {
      success: true,
      message: 'Card frozen successfully'
    };
  } catch (error) {
    console.error('Error freezing card:', error);
    throw error;
  }
}

/**
 * Unfreeze a card
 */
async function unfreezeCard(cardId) {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    await bridgeClient.post(`/cards/${card.bridge_card_id}/unfreeze`);

    // Update database
    await supabase
      .from('bridge_cards')
      .update({
        is_frozen: false,
        frozen_at: null,
        frozen_reason: null
      })
      .eq('id', cardId);

    return {
      success: true,
      message: 'Card unfrozen successfully'
    };
  } catch (error) {
    console.error('Error unfreezing card:', error);
    throw error;
  }
}

/**
 * Update card spending limits
 */
async function updateSpendingLimits(cardId, limits) {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    // Update via Bridge API
    const limitData = {
      daily_limit: limits.dailyLimit,
      monthly_limit: limits.monthlyLimit,
      single_transaction_limit: limits.singleTransactionLimit
    };

    await bridgeClient.put(`/cards/${card.bridge_card_id}/limits`, limitData);

    // Update database
    await supabase
      .from('bridge_cards')
      .update({
        daily_spend_limit: limits.dailyLimit,
        monthly_spend_limit: limits.monthlyLimit,
        single_transaction_limit: limits.singleTransactionLimit
      })
      .eq('id', cardId);

    return {
      success: true,
      message: 'Spending limits updated'
    };
  } catch (error) {
    console.error('Error updating spending limits:', error);
    throw error;
  }
}

/**
 * Update card controls (international, online, ATM, contactless)
 */
async function updateCardControls(cardId, controls) {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    // Update via Bridge API
    await bridgeClient.put(`/cards/${card.bridge_card_id}/controls`, controls);

    // Update database
    const updateData = {};
    if (controls.internationalEnabled !== undefined) updateData.international_enabled = controls.internationalEnabled;
    if (controls.onlineEnabled !== undefined) updateData.online_enabled = controls.onlineEnabled;
    if (controls.contactlessEnabled !== undefined) updateData.contactless_enabled = controls.contactlessEnabled;
    if (controls.atmEnabled !== undefined) updateData.atm_enabled = controls.atmEnabled;

    await supabase
      .from('bridge_cards')
      .update(updateData)
      .eq('id', cardId);

    return {
      success: true,
      message: 'Card controls updated'
    };
  } catch (error) {
    console.error('Error updating card controls:', error);
    throw error;
  }
}

/**
 * Get card transactions
 */
async function getCardTransactions(cardId, params = {}) {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id, user_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    // Fetch from database with pagination
    let query = supabase
      .from('card_transactions')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: false });

    if (params.limit) {
      query = query.limit(params.limit);
    }

    if (params.offset) {
      query = query.range(params.offset, params.offset + (params.limit || 50) - 1);
    }

    const { data: transactions, error } = await query;

    if (error) throw error;

    return {
      success: true,
      transactions: transactions || []
    };
  } catch (error) {
    console.error('Error fetching card transactions:', error);
    throw error;
  }
}

/**
 * Cancel a card
 */
async function cancelCard(cardId, reason = 'user_requested') {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    await bridgeClient.post(`/cards/${card.bridge_card_id}/cancel`, { reason });

    // Update database
    await supabase
      .from('bridge_cards')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      })
      .eq('id', cardId);

    return {
      success: true,
      message: 'Card cancelled successfully'
    };
  } catch (error) {
    console.error('Error cancelling card:', error);
    throw error;
  }
}

/**
 * Get card sensitive data (PAN, CVV, PIN) - highly restricted
 */
async function getCardSensitiveData(cardId) {
  try {
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('bridge_card_id')
      .eq('id', cardId)
      .single();

    if (!card) {
      throw new Error('Card not found');
    }

    // This endpoint returns encrypted sensitive data
    const sensitiveData = await bridgeClient.get(`/cards/${card.bridge_card_id}/sensitive`);

    return {
      success: true,
      data: sensitiveData
    };
  } catch (error) {
    console.error('Error fetching card sensitive data:', error);
    throw error;
  }
}

/**
 * Reset daily spend tracking (runs automatically at midnight UTC)
 */
async function resetDailySpend() {
  try {
    const now = new Date().toISOString();

    await supabase
      .from('bridge_cards')
      .update({
        current_daily_spend: 0,
        last_daily_reset: now
      })
      .lt('last_daily_reset', now);

    return { success: true };
  } catch (error) {
    console.error('Error resetting daily spend:', error);
    throw error;
  }
}

/**
 * Reset monthly spend tracking (runs on 1st of each month)
 */
async function resetMonthlySpend() {
  try {
    const now = new Date().toISOString();

    await supabase
      .from('bridge_cards')
      .update({
        current_monthly_spend: 0,
        last_monthly_reset: now
      })
      .lt('last_monthly_reset', now);

    return { success: true };
  } catch (error) {
    console.error('Error resetting monthly spend:', error);
    throw error;
  }
}

/**
 * Sync card data from Bridge to Supabase
 */
async function syncCardToDatabase(bridgeCard, userId) {
  try {
    const cardData = {
      user_id: userId,
      bridge_card_id: bridgeCard.id,
      bridge_customer_id: bridgeCard.customer_id,
      card_type: bridgeCard.type,
      card_brand: bridgeCard.brand,
      last_4: bridgeCard.last4,
      expiry_month: bridgeCard.exp_month,
      expiry_year: bridgeCard.exp_year,
      cardholder_name: bridgeCard.cardholder_name,
      status: bridgeCard.status,
      activation_status: bridgeCard.activation_status || 'pending',
      shipping_status: bridgeCard.shipping?.status,
      tracking_number: bridgeCard.shipping?.tracking_number,
      shipped_at: bridgeCard.shipping?.shipped_at,
      delivered_at: bridgeCard.shipping?.delivered_at,
      daily_spend_limit: bridgeCard.limits?.daily || 1000.00,
      monthly_spend_limit: bridgeCard.limits?.monthly || 10000.00,
      single_transaction_limit: bridgeCard.limits?.single_transaction || 500.00,
      is_frozen: bridgeCard.is_frozen || false,
      international_enabled: bridgeCard.controls?.international !== false,
      online_enabled: bridgeCard.controls?.online !== false,
      contactless_enabled: bridgeCard.controls?.contactless !== false,
      atm_enabled: bridgeCard.controls?.atm !== false,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('bridge_cards')
      .upsert(cardData, { onConflict: 'bridge_card_id' })
      .select()
      .single();

    if (error) throw error;

    return data;
  } catch (error) {
    console.error('Error syncing card to database:', error);
    throw error;
  }
}

/**
 * Sync card transaction to database (called by webhooks)
 */
async function syncCardTransaction(bridgeTransaction) {
  try {
    // Find card by bridge_card_id
    const { data: card } = await supabase
      .from('bridge_cards')
      .select('id, user_id')
      .eq('bridge_card_id', bridgeTransaction.card_id)
      .single();

    if (!card) {
      console.error('Card not found for transaction:', bridgeTransaction.id);
      return;
    }

    const transactionData = {
      card_id: card.id,
      user_id: card.user_id,
      bridge_transaction_id: bridgeTransaction.id,
      amount: bridgeTransaction.amount,
      currency: bridgeTransaction.currency,
      merchant_name: bridgeTransaction.merchant?.name,
      merchant_category: bridgeTransaction.merchant?.category,
      merchant_city: bridgeTransaction.merchant?.city,
      merchant_country: bridgeTransaction.merchant?.country,
      type: bridgeTransaction.type,
      status: bridgeTransaction.status,
      decline_reason: bridgeTransaction.decline_reason,
      description: bridgeTransaction.description,
      pos_entry_mode: bridgeTransaction.pos_entry_mode,
      is_international: bridgeTransaction.is_international || false,
      is_online: bridgeTransaction.is_online || false,
      settled_at: bridgeTransaction.settled_at
    };

    await supabase
      .from('card_transactions')
      .upsert(transactionData, { onConflict: 'bridge_transaction_id' });

    // Update card spend tracking if transaction is approved
    if (bridgeTransaction.status === 'approved' && bridgeTransaction.type === 'purchase') {
      await supabase.rpc('increment_card_spend', {
        card_uuid: card.id,
        amount: parseFloat(bridgeTransaction.amount)
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error syncing card transaction:', error);
    throw error;
  }
}

module.exports = {
  createCard,
  getUserCards,
  getCardDetails,
  activateCard,
  freezeCard,
  unfreezeCard,
  updateSpendingLimits,
  updateCardControls,
  getCardTransactions,
  cancelCard,
  getCardSensitiveData,
  resetDailySpend,
  resetMonthlySpend,
  syncCardToDatabase,
  syncCardTransaction
};
