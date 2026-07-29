-- Add fcm_tokens array to profiles to store multiple devices per user
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS fcm_tokens text[] DEFAULT '{}'::text[];

-- Create an index to quickly look up users by token (optional but helpful if doing reverse lookups)
CREATE INDEX IF NOT EXISTS idx_profiles_fcm_tokens ON profiles USING GIN (fcm_tokens);
