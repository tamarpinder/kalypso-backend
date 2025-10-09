const crypto = require('crypto');

/**
 * Generate HMAC signature for Fiserv Commerce Hub API authentication
 * Formula: ApiKey + ClientRequestId + Timestamp + RequestBody (NO delimiters)
 *
 * @param {string} apiKey - Fiserv API Key
 * @param {string} apiSecret - Fiserv API Secret
 * @param {string} payload - Request payload (JSON string), empty string for GET requests
 * @returns {Object} Authentication headers
 */
function generateFiservAuthHeaders(apiKey, apiSecret, payload = '') {
  // Generate unique client request ID (UUID v4)
  const clientRequestId = generateClientRequestId();

  // Get current timestamp in milliseconds (epoch)
  const timestamp = Date.now().toString();

  // Build raw signature: ApiKey + ClientRequestId + Timestamp + RequestBody
  // CRITICAL: No delimiters, no hashing payload separately
  const rawSignature = apiKey + clientRequestId + timestamp + payload;

  // Generate HMAC-SHA256 signature and Base64 encode
  const hmac = crypto
    .createHmac('sha256', apiSecret)
    .update(rawSignature)
    .digest('base64');

  // Return headers object
  return {
    'Content-Type': 'application/json',
    'Client-Request-Id': clientRequestId,
    'Api-Key': apiKey,
    'Timestamp': timestamp,
    'Auth-Token-Type': 'HMAC',
    'Authorization': hmac
  };
}

/**
 * Generate unique client request ID for tracking
 * Format: UUID v4
 */
function generateClientRequestId() {
  return crypto.randomUUID();
}

/**
 * Validate HMAC timestamp (must be within 5 minutes)
 *
 * @param {string} timestamp - Timestamp from request
 * @returns {boolean} True if valid, false if expired
 */
function isTimestampValid(timestamp) {
  const currentTime = Date.now();
  const requestTime = parseInt(timestamp);
  const timeDiff = Math.abs(currentTime - requestTime);

  // HMAC validity is 300 seconds (5 minutes)
  return timeDiff <= 300000;
}

/**
 * Make authenticated request to Fiserv Commerce Hub API
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} endpoint - API endpoint path
 * @param {Object} data - Request payload object
 * @param {Object} credentials - Fiserv credentials { apiKey, apiSecret, merchantId, host }
 * @returns {Promise<Object>} API response
 */
async function fiservRequest(method, endpoint, data = null, credentials) {
  const { apiKey, apiSecret, merchantId, host } = credentials;

  // Convert data to JSON string for payload
  const payload = data ? JSON.stringify(data) : '';

  // Generate auth headers
  const headers = generateFiservAuthHeaders(apiKey, apiSecret, payload);

  // Build full URL
  const url = `${host}${endpoint}`;

  // Make request
  const options = {
    method,
    headers,
    ...(payload && { body: payload })
  };

  // Debug logging
  console.log('\n🔍 Fiserv API Request Debug:');
  console.log('URL:', url);
  console.log('Method:', method);
  console.log('Headers:', JSON.stringify(headers, null, 2));
  console.log('Payload:', payload.substring(0, 200) + '...');

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();

    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(responseData, null, 2));

    if (!response.ok) {
      throw new Error(
        `Fiserv API Error: ${response.status} - ${responseData.error?.message || JSON.stringify(responseData)}`
      );
    }

    return responseData;
  } catch (error) {
    console.error('Fiserv Request Failed:', error);
    throw error;
  }
}

/**
 * Process a card payment through Fiserv Commerce Hub
 *
 * @param {Object} paymentData - Payment details
 * @param {Object} credentials - Fiserv credentials
 * @returns {Promise<Object>} Payment response
 */
async function processCardPayment(paymentData, credentials) {
  const {
    amount,
    currency,
    cardNumber,
    expiryMonth,
    expiryYear,
    cvv,
    cardholderName,
    customerEmail,
    customerPhone,
    billingAddress
  } = paymentData;

  // Build Fiserv payment request (Commerce Hub format - Official)
  const requestPayload = {
    amount: {
      total: parseFloat(parseFloat(amount).toFixed(2)),
      currency: currency
    },
    source: {
      sourceType: 'PaymentCard',
      card: {
        cardData: cardNumber.replace(/\s/g, ''),
        expirationMonth: expiryMonth.padStart(2, '0'),
        expirationYear: expiryYear.length === 2 ? `20${expiryYear}` : expiryYear,
        securityCode: cvv
      }
    },
    transactionDetails: {
      captureFlag: true
    },
    merchantDetails: {
      merchantId: credentials.merchantId,
      terminalId: '10000001'
    }
  };

  // Make payment request
  return await fiservRequest('POST', '/payments/v1/charges', requestPayload, credentials);
}

/**
 * Verify a payment transaction
 *
 * @param {string} transactionId - Fiserv transaction ID
 * @param {Object} credentials - Fiserv credentials
 * @returns {Promise<Object>} Transaction details
 */
async function verifyTransaction(transactionId, credentials) {
  return await fiservRequest('GET', `/payments/v1/charges/${transactionId}`, null, credentials);
}

/**
 * Refund a transaction
 *
 * @param {string} transactionId - Original transaction ID
 * @param {number} amount - Refund amount
 * @param {Object} credentials - Fiserv credentials
 * @returns {Promise<Object>} Refund response
 */
async function refundTransaction(transactionId, amount, credentials) {
  const refundPayload = {
    amount: {
      total: parseFloat(amount).toFixed(2),
      currency: 'USD' // Update based on original transaction
    },
    transactionDetails: {
      merchantTransactionId: `REF-${Date.now().toString().slice(-9).toUpperCase()}`
    }
  };

  return await fiservRequest('POST', `/payments/v1/charges/${transactionId}/refund`, refundPayload, credentials);
}

module.exports = {
  generateFiservAuthHeaders,
  generateClientRequestId,
  isTimestampValid,
  fiservRequest,
  processCardPayment,
  verifyTransaction,
  refundTransaction
};
