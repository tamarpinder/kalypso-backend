// Authentication Routes
// Handles user signup, login, profile, and logout

const express = require('express');
const router = express.Router();
const {
  signUpWithEmail,
  signInWithEmail,
  getUserProfile,
} = require('../services/authService');

/**
 * POST /api/auth/signup
 * Create a new user account
 *
 * Body: { email, password, name, phone? }
 * Returns: { success, user, profile, session }
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;

    // Validation
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters',
      });
    }

    const result = await signUpWithEmail(email, password, name, phone);

    res.status(201).json(result);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create account',
    });
  }
});

/**
 * POST /api/auth/login
 * Sign in with email and password
 *
 * Body: { email, password }
 * Returns: { success, user, session }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
    }

    const result = await signInWithEmail(email, password);

    res.json(result);
  } catch (error) {
    console.error('Login error:', error);
    res.status(401).json({
      success: false,
      error: error.message || 'Invalid credentials',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 *
 * Headers: Authorization: Bearer <token>
 * Returns: { id, email, name, phone, kycTier, kycStatus, bridgeCustomerId, createdAt }
 */
router.get('/me', async (req, res) => {
  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token and get user
    const { verifyToken } = require('../services/authService');
    const authUser = await verifyToken(token);

    // Get full user profile
    const profile = await getUserProfile(authUser.id);

    res.json({
      success: true,
      user: profile,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }
});

/**
 * POST /api/auth/logout
 * Sign out current user
 *
 * Note: Actual logout happens on client side by clearing Supabase session
 * This endpoint is for any server-side cleanup if needed
 */
router.post('/logout', async (req, res) => {
  try {
    // For Supabase auth, logout is handled client-side
    // This endpoint is here for consistency and future server-side cleanup

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to logout',
    });
  }
});

module.exports = router;
