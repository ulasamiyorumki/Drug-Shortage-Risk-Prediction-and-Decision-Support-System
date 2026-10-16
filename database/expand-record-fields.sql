ALTER TABLE drug_records
  MODIFY generic_name TEXT NULL,
  MODIFY brand_name TEXT NULL,
  MODIFY manufacturer TEXT NULL,
  MODIFY vendor TEXT NULL,
  MODIFY ndc MEDIUMTEXT NULL,
  MODIFY product_ndc MEDIUMTEXT NULL,
  MODIFY package_ndc MEDIUMTEXT NULL,
  MODIFY application_no TEXT NULL;
