CREATE TABLE memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  confidence REAL DEFAULT 0.5,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memories_user_id ON memories(user_id);
CREATE INDEX idx_memories_created_at ON memories(created_at DESC);
CREATE INDEX idx_memories_source ON memories(source);

ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own memories" ON memories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memories" ON memories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memories" ON memories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memories" ON memories
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Anon can read all memories for demo" ON memories
  FOR SELECT USING (true);

CREATE POLICY "Anon can insert memories for demo" ON memories
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon can delete memories for demo" ON memories
  FOR DELETE USING (true);
