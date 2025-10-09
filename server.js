require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const bridgeKycRoutes = require('./routes/bridge/kyc');
const bridgeWalletRoutes = require('./routes/bridge/wallet');
const bridgeVirtualAccountRoutes = require('./routes/bridge/virtualAccount');
const bridgeLiquidationRoutes = require('./routes/bridge/liquidation');
const bridgeCardRoutes = require('./routes/bridge/card');
const bridgeTransferRoutes = require('./routes/bridge/transfer');
const notificationRoutes = require('./routes/notifications');
const bridgeWebhook = require('./webhooks/bridge');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration - Allow Vercel and localhost
const allowedOrigins = [
  'http://localhost:3002',
  'http://localhost:3000',
  'https://kalypso-frontend.vercel.app',
  'https://kalypso-frontend-git-main-tamarpinders-projects.vercel.app', // Vercel preview deployments
];

// Add any FRONTEND_URL from environment
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list or matches Vercel pattern
    if (allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      console.log('⚠️  CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Kalypso Backend API'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/bridge/kyc', bridgeKycRoutes);
app.use('/api/bridge/wallets', bridgeWalletRoutes);
app.use('/api/bridge/virtual-accounts', bridgeVirtualAccountRoutes);
app.use('/api/bridge/liquidation-addresses', bridgeLiquidationRoutes);
app.use('/api/bridge/cards', bridgeCardRoutes);
app.use('/api/bridge/transfers', bridgeTransferRoutes);

// Webhooks (no auth required - Bridge will send events here)
app.use('/webhooks/bridge', bridgeWebhook);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Kalypso Backend Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`💳 Payments API: http://localhost:${PORT}/api/payments`);
  console.log(`🔔 Notifications API: http://localhost:${PORT}/api/notifications`);
  console.log(`🔐 Bridge KYC API: http://localhost:${PORT}/api/bridge/kyc`);
  console.log(`💸 Bridge Transfers API: http://localhost:${PORT}/api/bridge/transfers`);
  console.log(`🪝 Bridge Webhooks: http://localhost:${PORT}/webhooks/bridge`);
  console.log(`\n📋 Environment:`);
  console.log(`   - Node version: ${process.version}`);
  console.log(`   - Fiserv API: ${process.env.FISERV_HOST || 'https://connect-cert.fiservapis.com/ch'}`);
  console.log(`   - Bridge API: ${process.env.BRIDGE_BASE_URL || 'https://api.bridge.xyz/v0'} (${process.env.BRIDGE_ENVIRONMENT || 'sandbox'})`);
  console.log(`   - Supabase: ${process.env.SUPABASE_URL ? '✅ Connected' : '❌ Not configured'}`);
  console.log(`   - Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3002'}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});
