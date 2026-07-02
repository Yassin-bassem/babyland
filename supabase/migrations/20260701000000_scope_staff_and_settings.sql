-- Add version_id to app_settings
ALTER TABLE public.app_settings ADD COLUMN version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE;

-- Add version_id to staff_members
ALTER TABLE public.staff_members ADD COLUMN version_id UUID REFERENCES public.versions(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_app_settings_version ON public.app_settings(version_id);
CREATE INDEX idx_staff_members_version ON public.staff_members(version_id);

-- Populate existing settings and staff with the first active version
-- (Which corresponds to the original project currently running in the database)
DO $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM public.versions WHERE is_active = true LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.versions LIMIT 1;
  END IF;
  
  IF v_id IS NOT NULL THEN
    UPDATE public.app_settings SET version_id = v_id WHERE version_id IS NULL;
    UPDATE public.staff_members SET version_id = v_id WHERE version_id IS NULL;
  END IF;
END $$;

-- Make version_id NOT NULL after setting the defaults
ALTER TABLE public.app_settings ALTER COLUMN version_id SET NOT NULL;
ALTER TABLE public.staff_members ALTER COLUMN version_id SET NOT NULL;

-- Drop the existing global unique constraint on app_settings(key)
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_key_key;

-- Add a composite unique constraint on (key, version_id)
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_key_version_unique UNIQUE (key, version_id);
