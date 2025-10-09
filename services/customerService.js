// Bridge.xyz Customer Service
// Handles customer creation, KYC initiation, and status management

const bridgeClient = require('./bridgeClient');
const { getUserById, updateUserBridgeCustomerId, updateUserKycStatus, createNotification } = require('../config/supabase.config');

/**
 * Create a Bridge customer
 */
async function createBridgeCustomer(userData) {
  try {
    const { v4: uuidv4 } = require('uuid');

    const customerData = {
      type: 'individual',
      email: userData.email,
      first_name: userData.first_name || userData.name?.split(' ')[0] || 'John',
      last_name: userData.last_name || userData.name?.split(' ').slice(1).join(' ') || 'Doe',
      phone: userData.phone || '+15555555555',
      birth_date: userData.birth_date || '1990-01-01',
      signed_agreement_id: uuidv4(),
      residential_address: {
        street_line_1: userData.address_street_line_1 || '123 Main St',
        street_line_2: userData.address_street_line_2 || '',
        city: userData.address_city || 'San Francisco',
        state: userData.address_state || 'CA',
        postal_code: userData.address_postal_code || '94102',
        country: userData.address_country || 'US'
      },
      identifying_information: [
        {
          type: 'ssn',
          number: userData.ssn || '111111111',
          issuing_country: 'US'
        }
      ]
    };

    const bridgeCustomer = await bridgeClient.post('/customers', customerData);

    console.log('✅ Bridge customer created:', bridgeCustomer.id);

    return bridgeCustomer;
  } catch (error) {
    console.error('❌ Failed to create Bridge customer:', JSON.stringify(error, null, 2));
    throw new Error('Failed to create Bridge customer');
  }
}

/**
 * Get Bridge customer by ID
 */
async function getBridgeCustomer(bridgeCustomerId) {
  try {
    const customer = await bridgeClient.get(`/customers/${bridgeCustomerId}`);
    return customer;
  } catch (error) {
    console.error('❌ Failed to get Bridge customer:', error.message);
    throw new Error('Failed to get Bridge customer');
  }
}

/**
 * Update Bridge customer
 */
async function updateBridgeCustomer(bridgeCustomerId, updates) {
  try {
    const customer = await bridgeClient.put(`/customers/${bridgeCustomerId}`, updates);
    return customer;
  } catch (error) {
    console.error('❌ Failed to update Bridge customer:', error.message);
    throw new Error('Failed to update Bridge customer');
  }
}

/**
 * Get customer KYC status from Bridge
 */
async function getKycStatus(bridgeCustomerId) {
  try {
    const customer = await getBridgeCustomer(bridgeCustomerId);

    return {
      status: customer.status,
      requirements_due: customer.requirements_due || [],
      future_requirements_due: customer.future_requirements_due || [],
      endorsements: customer.endorsements || [],
      rejection_reasons: customer.rejection_reasons || []
    };
  } catch (error) {
    console.error('❌ Failed to get KYC status:', error.message);
    throw new Error('Failed to get KYC status');
  }
}

/**
 * Map Bridge customer status to Kalypso KYC status
 */
function mapBridgeStatusToKalypso(bridgeStatus, endorsements = []) {
  const statusMap = {
    'active': 'approved',
    'paused': 'under_review',
    'offboarded': 'rejected'
  };

  // Check if user has required endorsements for Tier 2
  // Tier 2 requires either 'ach' or 'base' endorsement approval
  const hasRequiredEndorsements = endorsements.some(e =>
    (e.name === 'ach' || e.name === 'base') && e.status === 'approved'
  );

  // Determine KYC tier
  const kycTier = hasRequiredEndorsements ? 2 : 1;

  return {
    kycStatus: statusMap[bridgeStatus] || 'pending',
    kycTier
  };
}

/**
 * Sync Bridge customer status with Supabase
 */
async function syncCustomerStatus(userId, bridgeCustomerId) {
  try {
    // Get current user status from database BEFORE updating
    const currentUser = await getUserById(userId);
    const previousStatus = currentUser?.kyc_status || 'not_started';
    const previousTier = currentUser?.kyc_tier || 0;

    // Get Bridge customer status
    const kycStatus = await getKycStatus(bridgeCustomerId);

    // Map to Kalypso status
    const { kycStatus: kalypsoStatus, kycTier } = mapBridgeStatusToKalypso(
      kycStatus.status,
      kycStatus.endorsements
    );

    // Check if status has actually changed
    const statusChanged = previousStatus !== kalypsoStatus || previousTier !== kycTier;

    // Update Supabase
    await updateUserKycStatus(userId, kalypsoStatus, kycTier);

    console.log(`✅ Synced KYC status for user ${userId}:`, {
      kalypsoStatus,
      kycTier,
      changed: statusChanged ? '(status changed)' : '(no change)'
    });

    // ONLY create notification if status has actually changed
    if (statusChanged) {
      const notificationConfig = {
        approved: {
          type: 'success',
          title: 'KYC Verification Complete',
          message: `Your identity verification has been approved! You now have Tier ${kycTier} access.`
        },
        pending: {
          type: 'info',
          title: 'KYC Verification Pending',
          message: 'Your identity verification is being reviewed. We\'ll notify you once it\'s complete.'
        },
        under_review: {
          type: 'warning',
          title: 'KYC Under Review',
          message: 'Your identity verification requires additional review. This may take a few business days.'
        },
        rejected: {
          type: 'error',
          title: 'KYC Verification Failed',
          message: 'We were unable to verify your identity. Please contact support for assistance.'
        }
      };

      const config = notificationConfig[kalypsoStatus];
      if (config) {
        await createNotification(userId, config.type, config.title, config.message, {
          kycStatus: kalypsoStatus,
          kycTier,
          bridgeCustomerId
        });
        console.log(`📬 Created notification for KYC status change: ${previousStatus} → ${kalypsoStatus}`);
      }
    }

    return { kycStatus: kalypsoStatus, kycTier };
  } catch (error) {
    console.error('❌ Failed to sync customer status:', error.message);
    throw new Error('Failed to sync customer status');
  }
}

/**
 * Initiate KYC process for a user
 * Creates Bridge customer if doesn't exist, returns KYC link
 */
async function initiateKyc(userId) {
  try {
    // Get user from Supabase
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    let bridgeCustomerId = user.bridge_customer_id;

    // Create Bridge customer if doesn't exist
    if (!bridgeCustomerId) {
      const bridgeCustomer = await createBridgeCustomer({
        email: user.email,
        name: user.name,
        phone: user.phone
      });

      bridgeCustomerId = bridgeCustomer.id;

      // Update Supabase with Bridge customer ID
      await updateUserBridgeCustomerId(userId, bridgeCustomerId);
    }

    // Get Bridge KYC onboarding link from API
    // Bridge provides a hosted KYC flow URL for each customer
    const kycLinkResponse = await bridgeClient.get(`/customers/${bridgeCustomerId}/kyc_link`);
    console.log('🔍 Bridge KYC Link Response:', JSON.stringify(kycLinkResponse, null, 2));
    const kycLink = kycLinkResponse.kyc_link || kycLinkResponse.kycLink || kycLinkResponse.url;

    // Notify user that KYC process has started
    await createNotification(
      userId,
      'kyc',
      'KYC Verification Started',
      'Complete your identity verification to unlock full platform features.',
      { bridgeCustomerId, kycLink }
    );

    return {
      success: true,
      kycLink,
      bridgeCustomerId
    };
  } catch (error) {
    console.error('❌ Failed to initiate KYC:', error.message);
    throw new Error('Failed to initiate KYC process');
  }
}

module.exports = {
  createBridgeCustomer,
  getBridgeCustomer,
  updateBridgeCustomer,
  getKycStatus,
  syncCustomerStatus,
  initiateKyc,
  mapBridgeStatusToKalypso
};
