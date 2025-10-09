// Bridge.xyz Virtual Account API Routes
// Handles US virtual bank account creation and management

const express = require('express');
const router = express.Router();
const {
  createVirtualAccount,
  getVirtualAccount,
  listVirtualAccounts,
} = require('../../services/virtualAccountService');

/**
 * POST /api/bridge/virtual-accounts
 * Create a new US virtual bank account for a user
 *
 * Body: { userId: string }
 * Returns: { success: boolean, account: object }
 */
router.post('/', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required',
      });
    }

    const result = await createVirtualAccount(userId);

    res.json(result);
  } catch (error) {
    console.error('Virtual account creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create virtual account',
    });
  }
});

/**
 * GET /api/bridge/virtual-accounts
 * Get all virtual accounts for a user
 *
 * Query params: userId (required)
 * Returns: { success: boolean, accounts: array }
 */
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId query parameter is required',
      });
    }

    const accounts = await listVirtualAccounts(userId);

    res.json({
      success: true,
      accounts,
    });
  } catch (error) {
    console.error('Get virtual accounts error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get virtual accounts',
    });
  }
});

/**
 * GET /api/bridge/virtual-accounts/:accountId
 * Get virtual account details
 *
 * Returns: { success: boolean, account: object }
 */
router.get('/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'accountId is required',
      });
    }

    const account = await getVirtualAccount(accountId);

    res.json({
      success: true,
      account,
    });
  } catch (error) {
    console.error('Get virtual account error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get virtual account',
    });
  }
});

module.exports = router;
