-- Device linking for multi-device sync
CREATE TABLE device_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  link_code TEXT NOT NULL UNIQUE,
  encrypted_master_key TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  linked_device_id UUID REFERENCES devices(id),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_device_link_requests_code ON device_link_requests(link_code);
CREATE INDEX idx_device_link_requests_user ON device_link_requests(user_id);

ALTER TABLE device_link_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own link requests" ON device_link_requests
  FOR ALL USING (auth.uid() = user_id);

-- Add blind_id column for privacy-preserving sync
ALTER TABLE sync_events ADD COLUMN IF NOT EXISTS blind_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sync_events_blind_id ON sync_events(blind_id);
