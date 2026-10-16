CREATE TABLE IF NOT EXISTS drug_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source VARCHAR(48) NOT NULL,
  report_year SMALLINT NULL,
  generic_name TEXT NULL,
  brand_name TEXT NULL,
  manufacturer TEXT NULL,
  vendor TEXT NULL,
  ndc MEDIUMTEXT NULL,
  product_ndc MEDIUMTEXT NULL,
  package_ndc MEDIUMTEXT NULL,
  application_no TEXT NULL,
  shortage_status VARCHAR(100) NULL,
  shortage_reason TEXT NULL,
  search_text MEDIUMTEXT NOT NULL,
  raw_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_source_id (source, id),
  KEY idx_generic_name (generic_name(160)),
  KEY idx_brand_name (brand_name(160)),
  KEY idx_manufacturer (manufacturer(160)),
  KEY idx_vendor (vendor(160)),
  KEY idx_ndc (ndc(80)),
  KEY idx_product_ndc (product_ndc(80)),
  KEY idx_package_ndc (package_ndc(80)),
  KEY idx_application_no (application_no(80)),
  KEY idx_source_year (source, report_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS source_fields (
  source VARCHAR(48) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (source, field_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
