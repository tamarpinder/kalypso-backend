-- Authentication Setup Migration
-- Migration 006: Create test user with Supabase Auth

-- ============================================================================
-- UPDATE EXISTING TEST USER TO TIER 2
-- ============================================================================
-- Update the existing test user to have Tier 2 KYC access
UPDATE public.users
SET kyc_tier = 2,
    kyc_status = 'approved'
WHERE email = 'test@mykalypso.com';

-- ============================================================================
-- NOTES FOR MANUAL SETUP
-- ============================================================================
-- The test user's auth password is managed by Supabase Auth, not in this migration
-- To create the test user's password:
--
-- Option 1: Via Supabase Dashboard
-- 1. Go to Authentication → Users
-- 2. Find user: test@mykalypso.com (ID: 123e4567-e89b-12d3-a456-426614174000)
-- 3. Click "..." → "Reset Password"
-- 4. Set password to: Test1234!
--
-- Option 2: Via SQL (if auth.users is accessible)
-- Run this if you have access to auth schema:
--
-- UPDATE auth.users
-- SET encrypted_password = crypt('Test1234!', gen_salt('bf'))
-- WHERE email = 'test@mykalypso.com';
--
-- Note: The password hash is managed by Supabase Auth system
-- This migration only updates the public.users profile table

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE public.users IS 'User profiles linked to Supabase auth.users. Authentication handled by Supabase Auth, profile data stored here.';
