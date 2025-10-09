const express = require('express');
const router = express.Router();
const {
  processCardPayment,
  verifyTransaction,
  refundTransaction
} = require('../utils/fiservAuth');

// Load Fiserv credentials from environment
const FISERV_CREDENTIALS = {
  apiKey: process.env.FISERV_API_KEY,
  apiSecret: process.env.FISERV_API_SECRET,
  merchantId: process.env.FISERV_MERCHANT_ID,
  host: process.env.FISERV_HOST || 'https://connect-cert.fiservapis.com/ch'
};

// Validate required credentials
if (!FISERV_CREDENTIALS.apiKey || !FISERV_CREDENTIALS.apiSecret || !FISERV_CREDENTIALS.merchantId) {
  console.error('❌ ERROR: Missing required Fiserv credentials in environment variables');
  console.error('   Required: FISERV_API_KEY, FISERV_API_SECRET, FISERV_MERCHANT_ID');
}

/**
 * POST /api/payments/process
 * Process a crypto purchase payment
 */
router.post('/process', async (req, res) => {
  try {
    const {
      fiatAmount,
      fiatCurrency,
      cryptoAmount,
      cryptoCurrency,
      cardNumber,
      cardholderName,
      expiryMonth,
      expiryYear,
      cvv,
      email,
      phone,
      country
    } = req.body;

    // Validate required fields
    if (!fiatAmount || !cardNumber || !cardholderName || !expiryMonth || !expiryYear || !cvv) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment fields'
      });
    }

    // Check if mock mode is enabled
    const useMockMode = process.env.PAYMENT_MODE === 'mock';

    if (useMockMode) {
      console.log('🧪 MOCK MODE: Simulating payment processing...');

      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check for test decline cards
      const declineCards = ['4000300011112220', '5100000000000131', '4263970000005262'];
      const cleanedCard = cardNumber.replace(/\s/g, '');

      if (declineCards.includes(cleanedCard)) {
        return res.status(400).json({
          success: false,
          error: 'Payment declined - Do Not Honor',
          transactionId: `MOCK-${Date.now().toString().slice(-9)}`,
          gatewayResponse: {
            transactionState: 'DECLINED',
            errorMessage: 'Do Not Honor'
          }
        });
      }

      // Check for 3DS required cards
      const threeDSCards = ['4012000033330026', '5555555555554444'];
      if (threeDSCards.includes(cleanedCard)) {
        return res.json({
          success: true,
          requires3DS: true,
          authenticationUrl: 'https://3ds-simulator.fiserv.com/authenticate',
          transactionId: `MOCK-3DS-${Date.now().toString().slice(-9)}`,
          gatewayResponse: {
            transactionState: 'PENDING_3DS'
          }
        });
      }

      // Successful mock payment
      return res.json({
        success: true,
        transactionId: `MOCK-${Date.now().toString().slice(-9).toUpperCase()}`,
        orderId: `KAL-${Date.now().toString().slice(-9).toUpperCase()}`,
        amount: fiatAmount,
        currency: fiatCurrency,
        cryptoAmount,
        cryptoCurrency,
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
        gatewayResponse: {
          transactionState: 'AUTHORIZED',
          transactionType: 'CHARGE'
        }
      });
    }

    // Build payment data for live Fiserv mode
    const paymentData = {
      amount: fiatAmount,
      currency: fiatCurrency || 'USD',
      cardNumber,
      expiryMonth,
      expiryYear,
      cvv,
      cardholderName,
      customerEmail: email,
      customerPhone: phone,
      billingAddress: {
        country: country || 'US'
      }
    };

    // Process payment through Fiserv
    const paymentResult = await processCardPayment(paymentData, FISERV_CREDENTIALS);

    // Check if 3D Secure authentication is required
    if (paymentResult.authenticationResponse?.authenticationType === '3DS') {
      return res.json({
        success: true,
        requires3DS: true,
        authenticationUrl: paymentResult.authenticationResponse.acsURL,
        transactionId: paymentResult.ipgTransactionId,
        gatewayResponse: paymentResult.gatewayResponse
      });
    }

    // Payment successful
    if (paymentResult.gatewayResponse?.transactionState === 'AUTHORIZED' ||
        paymentResult.gatewayResponse?.transactionState === 'CAPTURED') {

      // TODO: Trigger crypto purchase flow here
      // - Reserve crypto amount
      // - Create blockchain transaction
      // - Update user wallet

      return res.json({
        success: true,
        transactionId: paymentResult.ipgTransactionId,
        orderId: paymentResult.orderId,
        amount: fiatAmount,
        currency: fiatCurrency,
        cryptoAmount,
        cryptoCurrency,
        status: 'COMPLETED',
        timestamp: new Date().toISOString(),
        gatewayResponse: paymentResult.gatewayResponse
      });
    }

    // Payment failed
    return res.status(400).json({
      success: false,
      error: paymentResult.gatewayResponse?.errorMessage || 'Payment failed',
      transactionId: paymentResult.ipgTransactionId,
      gatewayResponse: paymentResult.gatewayResponse
    });

  } catch (error) {
    console.error('Payment processing error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Payment processing failed'
    });
  }
});

/**
 * POST /api/payments/3ds-callback
 * Handle 3D Secure authentication callback
 */
router.post('/3ds-callback', async (req, res) => {
  try {
    const { transactionId, PaRes, MD } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing transaction ID'
      });
    }

    // Verify the transaction after 3DS authentication
    const verificationResult = await verifyTransaction(transactionId, FISERV_CREDENTIALS);

    if (verificationResult.gatewayResponse?.transactionState === 'AUTHORIZED' ||
        verificationResult.gatewayResponse?.transactionState === 'CAPTURED') {

      return res.json({
        success: true,
        transactionId,
        status: 'COMPLETED',
        gatewayResponse: verificationResult.gatewayResponse
      });
    }

    return res.status(400).json({
      success: false,
      error: '3D Secure authentication failed',
      gatewayResponse: verificationResult.gatewayResponse
    });

  } catch (error) {
    console.error('3DS callback error:', error);
    res.status(500).json({
      success: false,
      error: error.message || '3DS verification failed'
    });
  }
});

/**
 * GET /api/payments/:transactionId
 * Get payment transaction details
 */
router.get('/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await verifyTransaction(transactionId, FISERV_CREDENTIALS);

    res.json({
      success: true,
      transaction
    });

  } catch (error) {
    console.error('Transaction lookup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Transaction lookup failed'
    });
  }
});

/**
 * POST /api/payments/:transactionId/refund
 * Refund a transaction
 */
router.post('/:transactionId/refund', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        error: 'Refund amount is required'
      });
    }

    const refundResult = await refundTransaction(transactionId, amount, FISERV_CREDENTIALS);

    if (refundResult.gatewayResponse?.transactionState === 'REFUNDED') {
      return res.json({
        success: true,
        refundId: refundResult.ipgTransactionId,
        amount,
        status: 'REFUNDED',
        gatewayResponse: refundResult.gatewayResponse
      });
    }

    return res.status(400).json({
      success: false,
      error: refundResult.gatewayResponse?.errorMessage || 'Refund failed',
      gatewayResponse: refundResult.gatewayResponse
    });

  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Refund processing failed'
    });
  }
});

/**
 * POST /api/payments/webhook
 * Handle Fiserv webhook notifications
 */
router.post('/webhook', async (req, res) => {
  try {
    const webhookData = req.body;

    console.log('Fiserv Webhook Received:', webhookData);

    // Verify webhook signature (implement HMAC verification)
    // Process webhook event based on type
    const eventType = webhookData.eventType;

    switch (eventType) {
      case 'PAYMENT_AUTHORIZED':
        // Handle payment authorization
        console.log('Payment authorized:', webhookData.transactionId);
        break;

      case 'PAYMENT_CAPTURED':
        // Handle payment capture
        console.log('Payment captured:', webhookData.transactionId);
        break;

      case 'PAYMENT_FAILED':
        // Handle payment failure
        console.log('Payment failed:', webhookData.transactionId);
        break;

      case 'REFUND_COMPLETED':
        // Handle refund completion
        console.log('Refund completed:', webhookData.transactionId);
        break;

      case 'CHARGEBACK_INITIATED':
        // Handle chargeback
        console.log('Chargeback initiated:', webhookData.transactionId);
        break;

      default:
        console.log('Unknown webhook event:', eventType);
    }

    // Respond to Fiserv that webhook was received
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

module.exports = router;
