-- Appraisal timing on job record (linked to joined_date)
SET @c1 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_jobs' AND COLUMN_NAME = 'first_appraisal_months'
);
SET @s1 := IF(@c1 = 0,
  'ALTER TABLE employee_jobs ADD COLUMN first_appraisal_months TINYINT UNSIGNED NULL COMMENT ''3 or 6'' AFTER joined_date',
  'SELECT 1');
PREPARE st1 FROM @s1; EXECUTE st1; DEALLOCATE PREPARE st1;

SET @c2 := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_jobs' AND COLUMN_NAME = 'second_appraisal_months'
);
SET @s2 := IF(@c2 = 0,
  'ALTER TABLE employee_jobs ADD COLUMN second_appraisal_months TINYINT UNSIGNED NULL COMMENT ''7, 8, or 12 (annual)'' AFTER first_appraisal_months',
  'SELECT 1');
PREPARE st2 FROM @s2; EXECUTE st2; DEALLOCATE PREPARE st2;

-- Blank appraisal template (HR can replace content later)
INSERT INTO hrm_form_templates (title, description, category, form_schema, is_active, created_by)
SELECT
  'Blank Appraisal Form',
  'Placeholder appraisal form — replace with final template later.',
  'appraisal',
  JSON_OBJECT(
    'version', 1,
    'fields', JSON_ARRAY(
      JSON_OBJECT('key', 'employee_name', 'label', 'Employee Name', 'type', 'text', 'readonly', true, 'autofill', 'employee.full_name'),
      JSON_OBJECT('key', 'job_title', 'label', 'Job Title', 'type', 'text', 'readonly', true, 'autofill', 'employee.job_title'),
      JSON_OBJECT('key', 'department', 'label', 'Department', 'type', 'text', 'readonly', true, 'autofill', 'employee.department'),
      JSON_OBJECT('key', 'review_period', 'label', 'Review Period', 'type', 'text', 'filled_by', 'hr'),
      JSON_OBJECT('key', 'employee_comments', 'label', 'Employee comments', 'type', 'textarea', 'required', true, 'filled_by', 'employee'),
      JSON_OBJECT('key', 'goals', 'label', 'Goals / achievements', 'type', 'textarea', 'filled_by', 'employee'),
      JSON_OBJECT('key', 'areas_to_improve', 'label', 'Areas to improve', 'type', 'textarea', 'filled_by', 'employee')
    )
  ),
  1,
  'system'
WHERE NOT EXISTS (
  SELECT 1 FROM hrm_form_templates WHERE title = 'Blank Appraisal Form' AND category = 'appraisal'
);
