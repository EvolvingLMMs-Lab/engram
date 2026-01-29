-- Create private bucket for encrypted blobs
INSERT INTO storage.buckets (id, name, public)
VALUES ('encrypted-blobs', 'encrypted-blobs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Users can only access their own folder
CREATE POLICY "Users can upload to own folder" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'encrypted-blobs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own blobs" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'encrypted-blobs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own blobs" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'encrypted-blobs' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
