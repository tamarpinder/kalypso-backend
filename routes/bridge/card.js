/**
 * Kalypso Bridge Cards API Routes
 * Endpoints for managing crypto debit cards
 */

const express = require('express');
const router = express.Router();
const cardService = require('../../services/cardService');
const { verifyAuth } = require('../../middleware/auth');

/**
 * POST /api/bridge/cards
 * Create a new card (virtual or physical)
 */
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { cardType, cardholderName } = req.body;
    const userId = req.userId;

    if (!cardType || !cardholderName) {
      return res.status(400).json({
        error: 'Missing required fields: cardType, cardholderName'
      });
    }

    if (!['virtual', 'physical'].includes(cardType)) {
      return res.status(400).json({
        error: 'Invalid card type. Must be "virtual" or "physical"'
      });
    }

    const result = await cardService.createCard(userId, cardType, cardholderName);

    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating card:', error);
    res.status(500).json({
      error: error.message || 'Failed to create card'
    });
  }
});

/**
 * GET /api/bridge/cards
 * Get all cards for the authenticated user
 */
router.get('/', verifyAuth, async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📋 Fetching cards for user:', userId);
    const result = await cardService.getUserCards(userId);
    console.log('✅ Found', result.cards?.length || 0, 'cards');

    res.json(result);
  } catch (error) {
    console.error('❌ Error fetching cards:', error.message);
    console.error('Full error:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch cards'
    });
  }
});

/**
 * GET /api/bridge/cards/:cardId
 * Get card details
 */
router.get('/:cardId', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const result = await cardService.getCardDetails(cardId);

    res.json(result);
  } catch (error) {
    console.error('Error fetching card details:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch card details'
    });
  }
});

/**
 * POST /api/bridge/cards/:cardId/activate
 * Activate a card
 */
router.post('/:cardId/activate', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { activationCode } = req.body;

    const result = await cardService.activateCard(cardId, activationCode);

    res.json(result);
  } catch (error) {
    console.error('Error activating card:', error);
    res.status(500).json({
      error: error.message || 'Failed to activate card'
    });
  }
});

/**
 * POST /api/bridge/cards/:cardId/freeze
 * Freeze a card
 */
router.post('/:cardId/freeze', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { reason } = req.body;

    const result = await cardService.freezeCard(cardId, reason);

    res.json(result);
  } catch (error) {
    console.error('Error freezing card:', error);
    res.status(500).json({
      error: error.message || 'Failed to freeze card'
    });
  }
});

/**
 * POST /api/bridge/cards/:cardId/unfreeze
 * Unfreeze a card
 */
router.post('/:cardId/unfreeze', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const result = await cardService.unfreezeCard(cardId);

    res.json(result);
  } catch (error) {
    console.error('Error unfreezing card:', error);
    res.status(500).json({
      error: error.message || 'Failed to unfreeze card'
    });
  }
});

/**
 * PUT /api/bridge/cards/:cardId/limits
 * Update card spending limits
 */
router.put('/:cardId/limits', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { dailyLimit, monthlyLimit, singleTransactionLimit } = req.body;

    if (!dailyLimit && !monthlyLimit && !singleTransactionLimit) {
      return res.status(400).json({
        error: 'At least one limit must be provided'
      });
    }

    const limits = {
      dailyLimit: dailyLimit ? parseFloat(dailyLimit) : undefined,
      monthlyLimit: monthlyLimit ? parseFloat(monthlyLimit) : undefined,
      singleTransactionLimit: singleTransactionLimit ? parseFloat(singleTransactionLimit) : undefined
    };

    const result = await cardService.updateSpendingLimits(cardId, limits);

    res.json(result);
  } catch (error) {
    console.error('Error updating spending limits:', error);
    res.status(500).json({
      error: error.message || 'Failed to update spending limits'
    });
  }
});

/**
 * PUT /api/bridge/cards/:cardId/controls
 * Update card controls (international, online, ATM, contactless)
 */
router.put('/:cardId/controls', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { internationalEnabled, onlineEnabled, contactlessEnabled, atmEnabled } = req.body;

    const controls = {
      internationalEnabled,
      onlineEnabled,
      contactlessEnabled,
      atmEnabled
    };

    const result = await cardService.updateCardControls(cardId, controls);

    res.json(result);
  } catch (error) {
    console.error('Error updating card controls:', error);
    res.status(500).json({
      error: error.message || 'Failed to update card controls'
    });
  }
});

/**
 * GET /api/bridge/cards/:cardId/transactions
 * Get card transaction history
 */
router.get('/:cardId/transactions', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { limit, offset } = req.query;

    const params = {
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    };

    const result = await cardService.getCardTransactions(cardId, params);

    res.json(result);
  } catch (error) {
    console.error('Error fetching card transactions:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch card transactions'
    });
  }
});

/**
 * POST /api/bridge/cards/:cardId/cancel
 * Cancel a card
 */
router.post('/:cardId/cancel', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;
    const { reason } = req.body;

    const result = await cardService.cancelCard(cardId, reason);

    res.json(result);
  } catch (error) {
    console.error('Error cancelling card:', error);
    res.status(500).json({
      error: error.message || 'Failed to cancel card'
    });
  }
});

/**
 * GET /api/bridge/cards/:cardId/sensitive
 * Get card sensitive data (PAN, CVV, etc.)
 * HIGHLY RESTRICTED - Only for authorized operations
 */
router.get('/:cardId/sensitive', verifyAuth, async (req, res) => {
  try {
    const { cardId } = req.params;

    // Additional security validation recommended here
    // (e.g., 2FA, biometric, rate limiting)

    const result = await cardService.getCardSensitiveData(cardId);

    res.json(result);
  } catch (error) {
    console.error('Error fetching card sensitive data:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch card sensitive data'
    });
  }
});

module.exports = router;
