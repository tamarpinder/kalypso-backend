// Authentication Service - Supabase Auth Integration
// Handles user signup, signin, and profile management

const { supabase, getUserById } = require('../config/supabase.config');

/**
 * Sign up a new user with email and password
 * Creates both Supabase auth user and profile in public.users
 */
async function signUpWithEmail(email, password, name, phone = null) {
  try {
    console.log(`📝 Creating new user: ${email}`);

    // Step 1: Create auth user in Supabase
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      console.error('❌ Supabase auth signup failed:', authError.message);
      throw new Error(authError.message);
    }

    if (!authData.user) {
      throw new Error('No user returned from Supabase');
    }

    const userId = authData.user.id;

    // Step 2: Create user profile in public.users table
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        name,
        phone,
        kyc_status: 'not_started',
        kyc_tier: 1,
      })
      .select()
      .single();

    if (profileError) {
      console.error('❌ Failed to create user profile:', profileError.message);
      // Cleanup: delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(userId);
      throw new Error('Failed to create user profile');
    }

    console.log('✅ User created successfully:', userId);

    return {
      success: true,
      user: authData.user,
      profile: profileData,
      session: authData.session,
    };
  } catch (error) {
    console.error('❌ Signup error:', error.message);
    throw error;
  }
}

/**
 * Sign in user with email and password
 * Returns Supabase session with JWT
 */
async function signInWithEmail(email, password) {
  try {
    console.log(`📝 Signing in user: ${email}`);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('❌ Sign in failed:', error.message);
      throw new Error('Invalid email or password');
    }

    if (!data.user || !data.session) {
      throw new Error('No session returned');
    }

    console.log('✅ User signed in successfully:', data.user.id);

    return {
      success: true,
      user: data.user,
      session: data.session,
    };
  } catch (error) {
    console.error('❌ Sign in error:', error.message);
    throw error;
  }
}

/**
 * Get user profile from public.users table
 * Includes all user data (KYC status, Bridge customer ID, etc.)
 */
async function getUserProfile(userId) {
  try {
    const user = await getUserById(userId);

    if (!user) {
      throw new Error('User profile not found');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      kycTier: user.kyc_tier,
      kycStatus: user.kyc_status,
      bridgeCustomerId: user.bridge_customer_id,
      createdAt: user.created_at,
    };
  } catch (error) {
    console.error('❌ Failed to get user profile:', error.message);
    throw error;
  }
}

/**
 * Verify Supabase JWT token
 * Used by middleware to authenticate requests
 */
async function verifyToken(token) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw new Error('Invalid token');
    }

    return user;
  } catch (error) {
    throw new Error('Token verification failed');
  }
}

module.exports = {
  signUpWithEmail,
  signInWithEmail,
  getUserProfile,
  verifyToken,
};
