-- DOPAMINA 3D | PRIMEIRO ACESSO E CRIAÇÃO OBRIGATÓRIA DE SENHA
-- Faça backup antes. Execute uma única vez no SQL Editor do Supabase.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_set_password boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Garante que a criação automática de perfis não marque usuários já existentes
-- como primeiro acesso. A Edge Function admin-users marca must_set_password=true
-- exclusivamente no momento do convite.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, must_set_password, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'reseller',
    false,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- RLS: usuários podem consultar o próprio perfil, mas não podem alterar
-- role, is_active ou must_set_password diretamente pelo navegador.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profile self or staff read" ON public.profiles;
CREATE POLICY "profile self or staff read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "admin manages profiles" ON public.profiles;
CREATE POLICY "admin manages profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- A Edge Function admin-users, usando a chave service role somente no servidor,
-- marca must_set_password=false após confirmar que o usuário autenticado alterou
-- sua senha via supabase.auth.updateUser({ password }).
