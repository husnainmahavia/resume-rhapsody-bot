CREATE TABLE public.applicant_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Husnain Mahavia',
  email text NOT NULL DEFAULT 'husnainmahavia.1@gmail.com',
  phone text DEFAULT '+44 7387 055617',
  location text DEFAULT 'Manchester, UK',
  title text DEFAULT 'Full-Stack Developer | AI Specialist | Tech Lead',
  years_experience text DEFAULT '8+',
  skills text[] DEFAULT ARRAY['JavaScript', 'React', 'Python', 'WordPress', 'AI', 'TypeScript', 'PHP', 'Node.js'],
  summary text DEFAULT '',
  cv_content text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.applicant_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to applicant_profile" ON public.applicant_profile FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER update_applicant_profile_updated_at
  BEFORE UPDATE ON public.applicant_profile
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();