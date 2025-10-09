// Bridge.xyz API HTTP Client
// Handles authentication, retries, idempotency, and error handling

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const bridgeConfig = require('../config/bridge.config');
const { createAuditLog } = require('../config/supabase.config');

/**
 * Bridge.xyz API Client
 * Provides HTTP methods with automatic retry, idempotency, and logging
 */
class BridgeClient {
  constructor() {
    this.config = bridgeConfig;

    // Create axios instance with default configuration
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': this.config.apiKey,
      }
    });

    // Setup request interceptor
    this.client.interceptors.request.use(
      (config) => this._handleRequest(config),
      (error) => Promise.reject(error)
    );

    // Setup response interceptor
    this.client.interceptors.response.use(
      (response) => this._handleResponse(response),
      (error) => this._handleError(error)
    );
  }

  /**
   * Request interceptor - adds correlation ID, idempotency key, logging
   */
  _handleRequest(config) {
    // Add correlation ID for request tracking
    const correlationId = uuidv4();
    config.headers['X-Correlation-ID'] = correlationId;

    // Add idempotency key for POST/PUT requests
    if (['post', 'put'].includes(config.method.toLowerCase())) {
      if (!config.headers['Idempotency-Key']) {
        config.headers['Idempotency-Key'] = uuidv4();
      }
    }

    // Log request
    console.log(`[Bridge API] ${config.method.toUpperCase()} ${config.url}`, {
      correlationId,
      idempotencyKey: config.headers['Idempotency-Key'],
    });

    // Store metadata for audit logging
    config.metadata = {
      correlationId,
      startTime: Date.now()
    };

    return config;
  }

  /**
   * Response interceptor - logs successful responses
   */
  _handleResponse(response) {
    const duration = Date.now() - response.config.metadata.startTime;

    console.log(`[Bridge API] ✅ ${response.status} ${response.config.url}`, {
      correlationId: response.config.metadata.correlationId,
      duration: `${duration}ms`
    });

    // Create audit log (non-blocking)
    this._createAuditLog({
      eventType: 'bridge_api_success',
      description: `${response.config.method.toUpperCase()} ${response.config.url}`,
      data: {
        status: response.status,
        correlationId: response.config.metadata.correlationId,
        duration
      }
    });

    return response.data;
  }

  /**
   * Error interceptor - handles retries and logging
   */
  async _handleError(error) {
    const config = error.config;
    const status = error.response?.status;
    const duration = Date.now() - (config.metadata?.startTime || Date.now());

    // Log error
    console.error(`[Bridge API] ❌ ${status || 'NETWORK_ERROR'} ${config.url}`, {
      correlationId: config.metadata?.correlationId,
      duration: `${duration}ms`,
      error: JSON.stringify(error.response?.data || error.message, null, 2)
    });

    // Create audit log (non-blocking)
    this._createAuditLog({
      eventType: 'bridge_api_error',
      description: `${config.method.toUpperCase()} ${config.url} failed`,
      data: {
        status,
        error: error.response?.data || error.message,
        correlationId: config.metadata?.correlationId,
        duration
      }
    });

    // Retry logic for retryable errors
    if (this._isRetryable(error)) {
      return this._retry(error);
    }

    // Throw formatted error
    throw this._formatError(error);
  }

  /**
   * Check if error is retryable
   */
  _isRetryable(error) {
    // Don't retry if we've already retried max times
    if (error.config._retryCount >= this.config.retryAttempts) {
      return false;
    }

    // Retry on network errors
    if (!error.response) {
      return true;
    }

    // Retry on specific status codes
    const status = error.response.status;
    return this.config.retryableStatusCodes.includes(status);
  }

  /**
   * Retry failed request with exponential backoff
   */
  async _retry(error) {
    const config = error.config;
    config._retryCount = config._retryCount || 0;
    config._retryCount++;

    // Calculate backoff delay (exponential: 1s, 2s, 4s, 8s, ...)
    const delay = this.config.retryDelay * Math.pow(2, config._retryCount - 1);

    console.log(`[Bridge API] 🔄 Retry ${config._retryCount}/${this.config.retryAttempts} after ${delay}ms delay`);

    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, delay));

    // Retry request
    return this.client(config);
  }

  /**
   * Format error for throwing
   */
  _formatError(error) {
    const formatted = {
      message: error.message,
      status: error.response?.status,
      code: error.code,
      bridgeError: error.response?.data,
      correlationId: error.config?.metadata?.correlationId
    };

    return new Error(JSON.stringify(formatted));
  }

  /**
   * Create audit log entry (non-blocking)
   */
  async _createAuditLog(logData) {
    try {
      await createAuditLog({
        ...logData,
        bridgeEventType: logData.eventType
      });
    } catch (err) {
      // Silently fail - don't break API calls due to audit log failures
      console.error('Audit log creation failed:', err.message);
    }
  }

  /**
   * HTTP GET request
   */
  async get(url, config = {}) {
    return this.client.get(url, config);
  }

  /**
   * HTTP POST request
   */
  async post(url, data, config = {}) {
    return this.client.post(url, data, config);
  }

  /**
   * HTTP PUT request
   */
  async put(url, data, config = {}) {
    return this.client.put(url, data, config);
  }

  /**
   * HTTP DELETE request
   */
  async delete(url, config = {}) {
    return this.client.delete(url, config);
  }

  /**
   * HTTP PATCH request
   */
  async patch(url, data, config = {}) {
    return this.client.patch(url, data, config);
  }
}

// Export singleton instance
const bridgeClient = new BridgeClient();
module.exports = bridgeClient;
