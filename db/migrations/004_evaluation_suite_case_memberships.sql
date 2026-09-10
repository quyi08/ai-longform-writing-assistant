CREATE TABLE evaluation_suite_cases (
  suite_id text NOT NULL REFERENCES evaluation_suites(id) ON DELETE CASCADE,
  case_id text NOT NULL REFERENCES evaluation_cases(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (suite_id, case_id)
);

CREATE INDEX evaluation_suite_cases_case_idx
  ON evaluation_suite_cases (case_id);
