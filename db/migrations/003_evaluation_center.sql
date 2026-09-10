CREATE TABLE evaluation_suites (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('smoke', 'full')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_cases (
  id text PRIMARY KEY,
  suite_id text NOT NULL REFERENCES evaluation_suites(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  confirmed_at timestamptz,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_runs (
  id text PRIMARY KEY,
  suite_id text NOT NULL REFERENCES evaluation_suites(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status text NOT NULL,
  config jsonb NOT NULL,
  estimated_cost_cny numeric NOT NULL DEFAULT 0,
  consumed_cost_cny numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evaluation_variant_results (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  case_id text NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
  variant text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, case_id, variant)
);

CREATE TABLE evaluation_human_reviews (
  id text PRIMARY KEY,
  variant_result_id text NOT NULL REFERENCES evaluation_variant_results(id) ON DELETE CASCADE,
  decision text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evaluation_variant_results_claim_idx
  ON evaluation_variant_results (run_id, status, lease_expires_at, created_at);
