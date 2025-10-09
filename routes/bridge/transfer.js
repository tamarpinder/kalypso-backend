// Bridge.xyz Transfer API Routes
// Handles internal, external (on-chain), and ACH transfers

const express = require('express');
const router = express.Router();
const {
  createTransfer,
  getTransferStatus,
  listTransfers,
  cancelTransfer,
} = require('../../services/transferService');

/**
 * POST /api/bridge/transfers
 * Create a new transfer (internal, external, or ACH)
 *
 * Body: {
 *   userId: string,
 *   type: 'internal' | 'external' | 'ach',
 *   amount: number,
 *   currency: string,
 *   source_wallet_id: string,
 *   destination: {
 *     // For internal transfers:
 *     wallet_id?: string,
 *     user_id?: string,
 *
 *     // For external transfers:
 *     address?: string,
 *     chain?: string,
 *
 *     // For ACH transfers:
 *     account_owner_name?: string,
 *     account_number?: string,
 *     routing_number?: string,
 *
 *     // Optional:
 *     description?: string,
 *     memo?: string
 *   }
 * }
 *
 * Returns: { success: boolean, transfer: object }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, type, amount, currency, source_wallet_id, destination } = req.body;

    // Validation
    if (!userId || !type || !amount || !currency || !source_wallet_id || !destination) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, type, amount, currency, source_wallet_id, destination',
      });
    }

    // Validate transfer type
    if (!['internal', 'external', 'ach'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transfer type. Must be: internal, external, or ach',
      });
    }

    // Type-specific validation
    if (type === 'internal' && !destination.wallet_id) {
      return res.status(400).json({
        success: false,
        error: 'destination.wallet_id is required for internal transfers',
      });
    }

    if (type === 'external' && (!destination.address || !destination.chain)) {
      return res.status(400).json({
        success: false,
        error: 'destination.address and destination.chain are required for external transfers',
      });
    }

    if (type === 'ach' && (!destination.account_number || !destination.routing_number || !destination.account_owner_name)) {
      return res.status(400).json({
        success: false,
        error: 'destination.account_number, routing_number, and account_owner_name are required for ACH transfers',
      });
    }

    const transferData = {
      type,
      amount,
      currency,
      source_wallet_id,
      destination,
    };

    const result = await createTransfer(userId, transferData);

    res.json(result);
  } catch (error) {
    console.error('Transfer creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create transfer',
    });
  }
});

/**
 * GET /api/bridge/transfers/:transferId/status
 * Get status of a specific transfer
 *
 * Returns: { success: boolean, transfer: object }
 */
router.get('/:transferId/status', async (req, res) => {
  try {
    const { transferId } = req.params;

    if (!transferId) {
      return res.status(400).json({
        success: false,
        error: 'transferId is required',
      });
    }

    const transfer = await getTransferStatus(transferId);

    res.json({
      success: true,
      transfer,
    });
  } catch (error) {
    console.error('Get transfer status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get transfer status',
    });
  }
});

/**
 * GET /api/bridge/transfers
 * List all transfers for a user
 *
 * Query params:
 *   - userId: string (required)
 *   - type: 'internal' | 'external' | 'ach' (optional)
 *   - status: 'pending' | 'processing' | 'completed' | 'failed' (optional)
 *   - limit: number (optional, default 50)
 *
 * Returns: { success: boolean, transfers: array }
 */
router.get('/', async (req, res) => {
  try {
    const { userId, type, status, limit } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId query parameter is required',
      });
    }

    const params = {};
    if (type) params.type = type;
    if (status) params.status = status;
    if (limit) params.limit = parseInt(limit);

    const transfers = await listTransfers(userId, params);

    res.json({
      success: true,
      transfers,
    });
  } catch (error) {
    console.error('List transfers error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list transfers',
    });
  }
});

/**
 * POST /api/bridge/transfers/:transferId/cancel
 * Cancel a pending transfer
 *
 * Body: { userId: string }
 * Returns: { success: boolean, transferId: string }
 */
router.post('/:transferId/cancel', async (req, res) => {
  try {
    const { transferId } = req.params;
    const { userId } = req.body;

    if (!transferId) {
      return res.status(400).json({
        success: false,
        error: 'transferId is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required in request body',
      });
    }

    const result = await cancelTransfer(userId, transferId);

    res.json(result);
  } catch (error) {
    console.error('Cancel transfer error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to cancel transfer',
    });
  }
});

module.exports = router;
