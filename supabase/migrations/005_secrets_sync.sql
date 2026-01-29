-- Secrets E2EE Sync Schema
-- Enables multi-device encrypted secrets with RSA key distribution

-- Vault keys distribution table
-- Each device gets the vault key encrypted with their RSA public key
CREATE TABLE vault_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  encrypted_vault_key TEXT NOT NULL,  -- Vault key encrypted with device's RSA public key
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);

-- Secret sync events (separate channel from memory sync)
-- Append-only log for secret changes
CREATE TABLE secret_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  secret_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ADD', 'UPDATE', 'DELETE')),
  encrypted_data TEXT,       -- Secret value encrypted with vault key (AES-256-GCM)
  iv TEXT,                   -- Initialization vector for AES
  checksum TEXT,             -- SHA-256 of plaintext for integrity verification
  blind_id TEXT,             -- HMAC of secret key_name for privacy-preserving lookup
  sequence_num BIGSERIAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Extend devices table with encrypted private key storage
-- Private key is encrypted with master key before storage
ALTER TABLE devices ADD COLUMN IF NOT EXISTS encrypted_private_key TEXT;

-- Indexes for efficient querying
CREATE INDEX idx_vault_keys_user_id ON vault_keys(user_id);
CREATE INDEX idx_vault_keys_device_id ON vault_keys(device_id);
CREATE INDEX idx_secret_sync_events_user_id ON secret_sync_events(user_id);
CREATE INDEX idx_secret_sync_events_sequence ON secret_sync_events(sequence_num);
CREATE INDEX idx_secret_sync_events_blind_id ON secret_sync_events(blind_id);

-- Enable Row Level Security
ALTER TABLE vault_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_sync_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data
CREATE POLICY "Users can manage own vault keys" ON vault_keys
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read own secret sync events" ON secret_sync_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own secret sync events" ON secret_sync_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_vault_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for vault_keys updated_at
CREATE TRIGGER vault_keys_updated_at
  BEFORE UPDATE ON vault_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_vault_keys_updated_at();
