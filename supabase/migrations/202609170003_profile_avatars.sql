BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cosmath-avatars', 'cosmath-avatars', true, 2097152, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=true, file_size_limit=2097152, allowed_mime_types=excluded.allowed_mime_types;

CREATE POLICY "avatar public read" ON storage.objects FOR SELECT USING (bucket_id='cosmath-avatars');
CREATE POLICY "avatar owner insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='cosmath-avatars' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "avatar owner update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id='cosmath-avatars' AND (storage.foldername(name))[1]=auth.uid()::text)
  WITH CHECK (bucket_id='cosmath-avatars' AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY "avatar owner delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='cosmath-avatars' AND (storage.foldername(name))[1]=auth.uid()::text);

COMMIT;
