-- Dopamina 3D: permitir que somente administradores excluam anexos do financeiro.
-- Execute uma única vez no Supabase > SQL Editor.

DROP POLICY IF EXISTS "admin deletes finance files" ON storage.objects;
CREATE POLICY "admin deletes finance files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'finance-files'
  AND public.is_admin()
);
