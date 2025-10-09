// Authentication Middleware
// Verifies Supabase JWT tokens and attaches user to request

const { verifyToken, getUserProfile } = require('../services/authService');

/**
 * Verify JWT token and attach user to request
 * Usage: router.get('/protected', verifyAuth, handler)
 */
async function verifyAuth(req, res, next) {
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

    // Verify token with Supabase
    const authUser = await verifyToken(token);

    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }

    // Attach user ID to request
    req.userId = authUser.id;
    req.user = authUser;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

/**
 * Verify auth and attach full user profile to request
 * Usage: router.get('/protected', verifyAuthWithProfile, handler)
 */
async function verifyAuthWithProfile(req, res, next) {
  try {
    // First verify the token
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No authorization token provided',
      });
    }

    const token = authHeader.substring(7);
    const authUser = await verifyToken(token);

    if (!authUser) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }

    // Get full profile from database
    const profile = await getUserProfile(authUser.id);

    // Attach to request
    req.userId = authUser.id;
    req.user = authUser;
    req.userProfile = profile;

    next();
  } catch (error) {
    console.error('Auth with profile middleware error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

module.exports = {
  verifyAuth,
  verifyAuthWithProfile,
};
