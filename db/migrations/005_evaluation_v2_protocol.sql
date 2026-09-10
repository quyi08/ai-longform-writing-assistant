ALTER TABLE evaluation_runs
  ADD COLUMN IF NOT EXISTS evaluation_protocol text NOT NULL DEFAULT 'v1-diagnostic',
  ADD COLUMN IF NOT EXISTS comparability text NOT NULL DEFAULT 'historical_diagnostic',
  ADD COLUMN IF NOT EXISTS diagnostic_summary jsonb;

UPDATE evaluation_runs
SET diagnostic_summary = COALESCE(
  diagnostic_summary,
  jsonb_build_object(
    'reason', 'V1 首轮冒烟诊断：用于定位检索、评分与成本口径问题，不参与横向优劣比较。',
    'issues', jsonb_build_array('未来证据在 Top-K 后截断', 'Judge 风险字段类型未归一', '跨题型平均分不可比')
  )
)
WHERE evaluation_protocol = 'v1-diagnostic'
  AND comparability = 'historical_diagnostic';
