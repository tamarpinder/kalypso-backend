// Bridge.xyz Liquidation Address API Routes
// Handles crypto liquidation addresses for automatic USD conversion

const express = require('express');
const router = express.Router();
const {
  createLiquidationAddress,
  getLiquidationAddress,
  listLiquidationAddresses,
  getSupportedLiquidationOptions,
} = require('../../services/liquidationService');

/**
 * POST /api/bridge/liquidation-addresses
 * Create a new liquidation address for crypto-to-USD conversion
 *
 * Body: { userId: string, currency: string, chain: string }
 * Returns: { success: boolean, address: object }
 */
router.post('/', async (req, res) => {
  try {
    const { userId, currency, chain } = req.body;

    if (!userId || !currency || !chain) {
      return res.status(400).json({
        success: false,
        error: 'userId, currency, and chain are required',
      });
    }

    const result = await createLiquidationAddress(userId, currency, chain);

    res.json(result);
  } catch (error) {
    console.error('Liquidation address creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create liquidation address',
    });
  }
});

/**
 * GET /api/bridge/liquidation-addresses
 * Get all liquidation addresses for a user
 *
 * Query params: userId (required)
 * Returns: { success: boolean, addresses: array }
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

    const addresses = await listLiquidationAddresses(userId);

    res.json({
      success: true,
      addresses,
    });
  } catch (error) {
    console.error('Get liquidation addresses error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get liquidation addresses',
    });
  }
});

/**
 * GET /api/bridge/liquidation-addresses/supported
 * Get supported currencies and chains for liquidation
 *
 * Returns: { success: boolean, options: object }
 */
router.get('/supported', async (req, res) => {
  try {
    const options = getSupportedLiquidationOptions();

    res.json({
      success: true,
      options,
    });
  } catch (error) {
    console.error('Get supported options error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get supported options',
    });
  }
});

/**
 * GET /api/bridge/liquidation-addresses/:addressId
 * Get liquidation address details
 *
 * Returns: { success: boolean, address: object }
 */
router.get('/:addressId', async (req, res) => {
  try {
    const { addressId } = req.params;

    if (!addressId) {
      return res.status(400).json({
        success: false,
        error: 'addressId is required',
      });
    }

    const address = await getLiquidationAddress(addressId);

    res.json({
      success: true,
      address,
    });
  } catch (error) {
    console.error('Get liquidation address error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get liquidation address',
    });
  }
});

module.exports = router;
