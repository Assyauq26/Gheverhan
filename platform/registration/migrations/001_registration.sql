BEGIN;
CREATE SCHEMA IF NOT EXISTS registration;
REVOKE ALL ON SCHEMA registration FROM PUBLIC;
CREATE TABLE IF NOT EXISTS registration.entries (
  id uuid PRIMARY KEY,
  reference_code text NOT NULL UNIQUE CHECK (reference_code ~ '^BTOS-[A-F0-9]{24}$'),
  full_name text NOT NULL CHECK (length(full_name) BETWEEN 2 AND 100),
  email text NOT NULL CHECK (length(email) <= 254),
  whatsapp text CHECK (length(whatsapp) <= 16),
  store_name text NOT NULL CHECK (length(store_name) BETWEEN 1 AND 100),
  category text NOT NULL CHECK (category IN ('Fashion','Elektronik','Kecantikan','Makanan','Aksesoris','Lainnya')),
  domain text CHECK (length(domain) <= 253),
  city text CHECK (length(city) <= 100),
  description text CHECK (length(description) <= 500),
  consent_version text NOT NULL,
  consent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'REGISTERED' CHECK (status = 'REGISTERED'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registration.requests (
  key_hash text PRIMARY KEY,
  payload_hash text NOT NULL,
  entry_id uuid NOT NULL REFERENCES registration.entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registration.rate_limits (
  key_hash text NOT NULL,
  bucket bigint NOT NULL,
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (key_hash,bucket)
);
CREATE TABLE IF NOT EXISTS registration.challenges (
  nonce_hash text PRIMARY KEY,
  request_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
REVOKE ALL ON ALL TABLES IN SCHEMA registration FROM PUBLIC;
-- The migration owner creates the dedicated non-login-owner runtime role first.
GRANT USAGE ON SCHEMA registration TO btos_registration_runtime;
GRANT SELECT, INSERT ON registration.entries, registration.requests TO btos_registration_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON registration.rate_limits TO btos_registration_runtime;
GRANT SELECT, INSERT, DELETE ON registration.challenges TO btos_registration_runtime;
COMMIT;
