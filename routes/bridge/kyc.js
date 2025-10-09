// Bridge.xyz KYC API Routes
// Handles Verified Plus (Tier 2) KYC initiation and status checking

const express = require('express');
const router = express.Router();
const { initiateKyc, syncCustomerStatus, getKycStatus } = require('../../services/customerService');
const { getUserById } = require('../../config/supabase.config');

/**
 * POST /api/bridge/kyc/initiate
 * Initiate Verified Plus KYC process for a user
 *
 * Body: { userId: string }
 * Returns: { success: boolean, kycLink: string, bridgeCustomerId: string }
 */
router.post('/initiate', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Initiate KYC process (creates Bridge customer if needed)
    const result = await initiateKyc(userId);

    res.json(result);
  } catch (error) {
    console.error('KYC initiation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate KYC process'
    });
  }
});

/**
 * GET /api/bridge/kyc/status/:userId
 * Get current KYC status for a user
 *
 * Returns: {
 *   kycStatus: string,
 *   kycTier: number,
 *   bridgeCustomerId: string,
 *   requirements: object
 * }
 */
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user from Supabase
    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // If no Bridge customer ID yet, return basic status
    if (!user.bridge_customer_id) {
      return res.json({
        kycStatus: user.kyc_status || 'not_started',
        kycTier: user.kyc_tier || 1,
        bridgeCustomerId: null,
        requirements: {
          status: 'not_started',
          requirements_due: [],
          future_requirements_due: [],
          endorsements: []
        }
      });
    }

    // Get detailed status from Bridge
    const bridgeKycStatus = await getKycStatus(user.bridge_customer_id);

    // Sync with Supabase (updates local KYC status)
    const syncedStatus = await syncCustomerStatus(userId, user.bridge_customer_id);

    res.json({
      kycStatus: syncedStatus.kycStatus,
      kycTier: syncedStatus.kycTier,
      bridgeCustomerId: user.bridge_customer_id,
      requirements: bridgeKycStatus
    });
  } catch (error) {
    console.error('KYC status check error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to check KYC status'
    });
  }
});

/**
 * POST /api/bridge/kyc/sync/:userId
 * Manually sync KYC status from Bridge to Supabase
 * Useful for checking status after user completes KYC flow
 *
 * Returns: { kycStatus: string, kycTier: number }
 */
router.post('/sync/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user from Supabase
    const user = await getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.bridge_customer_id) {
      return res.status(400).json({
        success: false,
        error: 'User has not started KYC process'
      });
    }

    // Sync status from Bridge
    const syncedStatus = await syncCustomerStatus(userId, user.bridge_customer_id);

    res.json({
      success: true,
      ...syncedStatus
    });
  } catch (error) {
    console.error('KYC sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to sync KYC status'
    });
  }
});

module.exports = router;
