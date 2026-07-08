-- Mark overall rating as manager-only on Performance Appraisal template.
-- Run once in MySQL after deploying manager-field support.

UPDATE hrm_form_templates
SET form_schema = JSON_SET(
  form_schema,
  '$[5].filled_by', 'manager',
  '$[5].label', 'Overall Rating',
  '$[5].required', false
)
WHERE category = 'appraisal'
  AND title LIKE '%Appraisal%'
  AND JSON_EXTRACT(form_schema, '$[5].key') = 'overall_rating';

-- If your schema index differs, use this safer approach:
UPDATE hrm_form_templates t
SET form_schema = (
  SELECT JSON_ARRAYAGG(
    CASE
      WHEN jt.field_key IN ('overall_rating', 'manager_rating')
        THEN JSON_SET(jt.field_json, '$.filled_by', 'manager', '$.label', 'Overall Rating')
      ELSE jt.field_json
    END
  )
  FROM JSON_TABLE(
    t.form_schema,
    '$[*]' COLUMNS (
      field_key VARCHAR(64) PATH '$.key',
      field_json JSON PATH '$'
    )
  ) AS jt
)
WHERE t.category = 'appraisal';
