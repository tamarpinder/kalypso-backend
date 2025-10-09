// Bridge.xyz API Configuration
require('dotenv').config();

const bridgeConfig = {
  // API Configuration
  apiKey: process.env.BRIDGE_API_KEY || '',
  environment: process.env.BRIDGE_ENVIRONMENT || 'sandbox',
  baseUrl: process.env.BRIDGE_BASE_URL || 'https://api.bridge.xyz/v0',

  // HTTP Client Configuration
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second initial delay (exponential backoff)

  // Retryable HTTP status codes
  retryableStatusCodes: [429, 500, 502, 503, 504],

  // Endpoints
  endpoints: {
    customers: '/customers',
    wallets: '/wallets',
    transfers: '/transfers',
    virtualAccounts: '/virtual_accounts',
    liquidationAddresses: '/liquidation_addresses',
    cards: '/cards',
    externalAccounts: '/external_accounts',
    plaid: '/plaid',
  },

  // Feature Flags
  features: {
    enableWebhooks: true,
    enableRealTimeBalanceSync: true,
    enableAuditLogging: true,
  },

  // Validation
  validate() {
    if (!this.apiKey) {
      throw new Error('BRIDGE_API_KEY environment variable is required');
    }
    if (!['sandbox', 'production'].includes(this.environment)) {
      throw new Error('BRIDGE_ENVIRONMENT must be either "sandbox" or "production"');
    }
    return true;
  }
};

// Validate configuration on load
try {
  bridgeConfig.validate();
  console.log(`✅ Bridge.xyz configured for ${bridgeConfig.environment} environment`);
} catch (error) {
  console.error('❌ Bridge.xyz configuration error:', error.message);
  // Don't throw in production, just log the error
  if (process.env.NODE_ENV === 'production') {
    console.error('⚠️  Bridge.xyz integration will not function correctly');
  }
}

module.exports = bridgeConfig;
