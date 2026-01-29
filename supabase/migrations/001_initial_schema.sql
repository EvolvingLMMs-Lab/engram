-- Engram Initial Schema
-- Privacy-first AI memory layer database

-- Devices linked to users
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_name TEXT,
  public_key TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Encrypted blob metadata (content is in Supabase Storage)
CREATE TABLE blobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER,
  checksum TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync event log (append-only)
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  blob_id UUID REFERENCES blobs(id),
  event_type TEXT NOT NULL,
  sequence_num BIGSERIAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team shared vaults (for Team/Enterprise tiers)
CREATE TABLE vaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  owner_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE vault_members (
  vault_id UUID REFERENCES vaults(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_vault_key TEXT,
  role TEXT DEFAULT 'member',
  PRIMARY KEY (vault_id, user_id)
);

-- Indexes
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_blobs_user_id ON blobs(user_id);
CREATE INDEX idx_sync_events_user_id ON sync_events(user_id);
CREATE INDEX idx_sync_events_sequence ON sync_events(sequence_num);

-- Enable Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_members ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage own devices" ON devices
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own blobs" ON blobs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can read own sync events" ON sync_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sync events" ON sync_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Vault members can access vault" ON vaults
  FOR SELECT USING (
    id IN (SELECT vault_id FROM vault_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
  );

CREATE POLICY "Vault owners can update vault" ON vaults
  FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Vault owners can delete vault" ON vaults
  FOR DELETE USING (owner_id = auth.uid());

CREATE POLICY "Users can view their vault memberships" ON vault_members
  FOR SELECT USING (user_id = auth.uid());
