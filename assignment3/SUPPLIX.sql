CREATE DATABASE SUPPLIX_A3_SUBMISSION CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE SUPPLIX_A3_SUBMISSION;

-- STEP 1: Application tables (15 MVP tables)
CREATE TABLE `User` (
  user_id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('GC','Supplier','PM') NOT NULL,
  phone VARCHAR(100),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE Project (
  project_id VARCHAR(20) PRIMARY KEY,
  owner_user_id VARCHAR(20) NOT NULL,
  name VARCHAR(200) NOT NULL,
  location VARCHAR(255),
  status ENUM('active','completed') NOT NULL DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  CONSTRAINT fk_project_owner FOREIGN KEY (owner_user_id) REFERENCES `User`(user_id),
  CONSTRAINT chk_project_dates CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB;

CREATE TABLE ProjectMember (
  project_id VARCHAR(20) NOT NULL,
  user_id VARCHAR(20) NOT NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id,user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES Project(project_id),
  CONSTRAINT fk_pm_user FOREIGN KEY (user_id) REFERENCES `User`(user_id)
) ENGINE=InnoDB;

CREATE TABLE Supplier (
  supplier_id VARCHAR(20) PRIMARY KEY,
  user_id VARCHAR(20) NULL UNIQUE,
  company_name VARCHAR(200) NOT NULL,
  description TEXT,
  location TEXT,
  phone VARCHAR(100),
  email VARCHAR(200), -- imported company contact email; not login email
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_supplier_user FOREIGN KEY (user_id) REFERENCES `User`(user_id)
) ENGINE=InnoDB;

CREATE TABLE Material (
  material_id VARCHAR(20) PRIMARY KEY,
  name TEXT NOT NULL,
  category VARCHAR(100) NULL, -- unavailable in materials.tsv; enrich later
  unit VARCHAR(50) NOT NULL,
  specification TEXT
) ENGINE=InnoDB;

CREATE TABLE SupplierMaterial (
  supplier_material_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  supplier_id VARCHAR(20) NOT NULL,
  material_id VARCHAR(20) NOT NULL,
  unit_price DECIMAL(18,4) NOT NULL,
  stock_available BOOLEAN NOT NULL,
  UNIQUE KEY uq_supplier_material (supplier_id,material_id),
  CONSTRAINT fk_sm_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id),
  CONSTRAINT fk_sm_material FOREIGN KEY (material_id) REFERENCES Material(material_id),
  CONSTRAINT chk_sm_price CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE RFQ (
  rfq_id VARCHAR(20) PRIMARY KEY,
  project_id VARCHAR(20) NOT NULL,
  created_by VARCHAR(20) NOT NULL,
  deadline DATE NOT NULL,
  status ENUM('draft','open','closed') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rfq_project FOREIGN KEY (project_id) REFERENCES Project(project_id),
  CONSTRAINT fk_rfq_creator FOREIGN KEY (created_by) REFERENCES `User`(user_id)
) ENGINE=InnoDB;

CREATE TABLE RFQ_Supplier (
  rfq_id VARCHAR(20) NOT NULL,
  supplier_id VARCHAR(20) NOT NULL,
  status ENUM('invited','responded','declined') NOT NULL DEFAULT 'invited',
  invited_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rfq_id,supplier_id),
  CONSTRAINT fk_rs_rfq FOREIGN KEY (rfq_id) REFERENCES RFQ(rfq_id),
  CONSTRAINT fk_rs_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
) ENGINE=InnoDB;

CREATE TABLE RFQ_Item (
  rfq_item_id VARCHAR(20) PRIMARY KEY,
  rfq_id VARCHAR(20) NOT NULL,
  material_id VARCHAR(20) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  required_date DATE,
  CONSTRAINT fk_ri_rfq FOREIGN KEY (rfq_id) REFERENCES RFQ(rfq_id),
  CONSTRAINT fk_ri_material FOREIGN KEY (material_id) REFERENCES Material(material_id),
  CONSTRAINT chk_ri_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE Quotation (
  quotation_id VARCHAR(20) PRIMARY KEY,
  rfq_id VARCHAR(20) NOT NULL,
  supplier_id VARCHAR(20) NOT NULL,
  delivery_terms TEXT,
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_quotation_rfq_supplier (rfq_id,supplier_id),
  -- MySQL permits multiple NULLs: only one accepted quotation per RFQ.
  accepted_rfq_id VARCHAR(20) GENERATED ALWAYS AS
    (CASE WHEN status = 'accepted' THEN rfq_id ELSE NULL END) STORED,
  UNIQUE KEY uq_one_accepted_quotation (accepted_rfq_id),
  CONSTRAINT fk_quotation_invitation FOREIGN KEY (rfq_id,supplier_id)
    REFERENCES RFQ_Supplier(rfq_id,supplier_id)
) ENGINE=InnoDB;

CREATE TABLE Quotation_Item (
  quotation_item_id VARCHAR(20) PRIMARY KEY,
  quotation_id VARCHAR(20) NOT NULL,
  rfq_item_id VARCHAR(20) NOT NULL,
  unit_price DECIMAL(18,4) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  delivery_date DATE NOT NULL,
  UNIQUE KEY uq_qi_quotation_item (quotation_id,rfq_item_id),
  CONSTRAINT fk_qi_quotation FOREIGN KEY (quotation_id) REFERENCES Quotation(quotation_id),
  CONSTRAINT fk_qi_rfq_item FOREIGN KEY (rfq_item_id) REFERENCES RFQ_Item(rfq_item_id),
  CONSTRAINT chk_qi_price CHECK (unit_price >= 0),
  CONSTRAINT chk_qi_quantity CHECK (quantity > 0)
) ENGINE=InnoDB;

CREATE TABLE PurchaseOrder (
  po_id VARCHAR(20) PRIMARY KEY,
  quotation_id VARCHAR(20) NOT NULL UNIQUE,
  created_by VARCHAR(20) NOT NULL,
  status ENUM('draft','pending','accepted','rejected','in_progress','fulfilled') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_po_quotation FOREIGN KEY (quotation_id) REFERENCES Quotation(quotation_id),
  CONSTRAINT fk_po_creator FOREIGN KEY (created_by) REFERENCES `User`(user_id)
) ENGINE=InnoDB;

CREATE TABLE PO_Item (
  po_item_id VARCHAR(20) PRIMARY KEY,
  po_id VARCHAR(20) NOT NULL,
  quotation_item_id VARCHAR(20) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  agreed_unit_price DECIMAL(18,4) NOT NULL,
  UNIQUE KEY uq_po_quotation_item (po_id,quotation_item_id),
  CONSTRAINT fk_poi_po FOREIGN KEY (po_id) REFERENCES PurchaseOrder(po_id),
  CONSTRAINT fk_poi_quotation_item FOREIGN KEY (quotation_item_id) REFERENCES Quotation_Item(quotation_item_id),
  CONSTRAINT chk_poi_quantity CHECK (quantity > 0),
  CONSTRAINT chk_poi_price CHECK (agreed_unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE Delivery (
  delivery_id VARCHAR(20) PRIMARY KEY,
  po_id VARCHAR(20) NOT NULL UNIQUE,
  status ENUM('dispatched','out_for_delivery','delivered','delayed') NOT NULL DEFAULT 'dispatched',
  estimated_date DATE NOT NULL,
  actual_date DATE,
  delay_reason TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_delivery_po FOREIGN KEY (po_id) REFERENCES PurchaseOrder(po_id)
) ENGINE=InnoDB;

CREATE TABLE Document (
  document_id VARCHAR(20) PRIMARY KEY,
  project_id VARCHAR(20),
  supplier_id VARCHAR(20),
  po_id VARCHAR(20),
  uploaded_by VARCHAR(20) NOT NULL,
  document_type ENUM('certificate','invoice','safety_sheet','contract') NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_url VARCHAR(1000) NOT NULL,
  expiry_date DATE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_doc_project FOREIGN KEY (project_id) REFERENCES Project(project_id),
  CONSTRAINT fk_doc_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id),
  CONSTRAINT fk_doc_po FOREIGN KEY (po_id) REFERENCES PurchaseOrder(po_id),
  CONSTRAINT fk_doc_user FOREIGN KEY (uploaded_by) REFERENCES `User`(user_id),
  CONSTRAINT chk_doc_link CHECK (project_id IS NOT NULL OR supplier_id IS NOT NULL OR po_id IS NOT NULL)
) ENGINE=InnoDB;


-- STEP 1B: Database-side business rules not expressible as simple foreign keys.
-- MySQL client understands DELIMITER when executed with SOURCE / redirected input.
DELIMITER $$
CREATE TRIGGER trg_project_gc_before_insert BEFORE INSERT ON Project FOR EACH ROW
BEGIN
  IF (SELECT role FROM `User` WHERE user_id=NEW.owner_user_id) <> 'GC' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Project owner must have GC role';
  END IF;
END$$
CREATE TRIGGER trg_project_gc_before_update BEFORE UPDATE ON Project FOR EACH ROW
BEGIN
  IF (SELECT role FROM `User` WHERE user_id=NEW.owner_user_id) <> 'GC' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Project owner must have GC role';
  END IF;
END$$
CREATE TRIGGER trg_supplier_role_before_insert BEFORE INSERT ON Supplier FOR EACH ROW
BEGIN
  IF NEW.user_id IS NOT NULL AND
     (SELECT role FROM `User` WHERE user_id=NEW.user_id) <> 'Supplier' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Linked supplier account must have Supplier role';
  END IF;
END$$
CREATE TRIGGER trg_supplier_role_before_update BEFORE UPDATE ON Supplier FOR EACH ROW
BEGIN
  IF NEW.user_id IS NOT NULL AND
     (SELECT role FROM `User` WHERE user_id=NEW.user_id) <> 'Supplier' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Linked supplier account must have Supplier role';
  END IF;
END$$
CREATE TRIGGER trg_qi_same_rfq_before_insert BEFORE INSERT ON Quotation_Item FOR EACH ROW
BEGIN
  IF (SELECT rfq_id FROM Quotation WHERE quotation_id=NEW.quotation_id) <>
     (SELECT rfq_id FROM RFQ_Item WHERE rfq_item_id=NEW.rfq_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Quotation item must belong to the same RFQ';
  END IF;
END$$
CREATE TRIGGER trg_qi_same_rfq_before_update BEFORE UPDATE ON Quotation_Item FOR EACH ROW
BEGIN
  IF (SELECT rfq_id FROM Quotation WHERE quotation_id=NEW.quotation_id) <>
     (SELECT rfq_id FROM RFQ_Item WHERE rfq_item_id=NEW.rfq_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Quotation item must belong to the same RFQ';
  END IF;
END$$
CREATE TRIGGER trg_poi_same_quote_before_insert BEFORE INSERT ON PO_Item FOR EACH ROW
BEGIN
  IF (SELECT quotation_id FROM PurchaseOrder WHERE po_id=NEW.po_id) <>
     (SELECT quotation_id FROM Quotation_Item WHERE quotation_item_id=NEW.quotation_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PO item must belong to PO quotation';
  END IF;
END$$
CREATE TRIGGER trg_poi_same_quote_before_update BEFORE UPDATE ON PO_Item FOR EACH ROW
BEGIN
  IF (SELECT quotation_id FROM PurchaseOrder WHERE po_id=NEW.po_id) <>
     (SELECT quotation_id FROM Quotation_Item WHERE quotation_item_id=NEW.quotation_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PO item must belong to PO quotation';
  END IF;
END$$
CREATE TRIGGER trg_pm_role_before_insert BEFORE INSERT ON ProjectMember FOR EACH ROW
BEGIN
  IF (SELECT role FROM `User` WHERE user_id=NEW.user_id) <> 'PM' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Project member must have PM role';
  END IF;
END$$
CREATE TRIGGER trg_pm_role_before_update BEFORE UPDATE ON ProjectMember FOR EACH ROW
BEGIN
  IF (SELECT role FROM `User` WHERE user_id=NEW.user_id) <> 'PM' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Project member must have PM role';
  END IF;
END$$
CREATE TRIGGER trg_rfq_owner_before_insert BEFORE INSERT ON RFQ FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM Project p JOIN `User` u ON u.user_id=NEW.created_by
                 WHERE p.project_id=NEW.project_id AND p.owner_user_id=NEW.created_by AND u.role='GC') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RFQ creator must own project as GC';
  END IF;
END$$
CREATE TRIGGER trg_rfq_owner_before_update BEFORE UPDATE ON RFQ FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM Project p JOIN `User` u ON u.user_id=NEW.created_by
                 WHERE p.project_id=NEW.project_id AND p.owner_user_id=NEW.created_by AND u.role='GC') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RFQ creator must own project as GC';
  END IF;
END$$
CREATE TRIGGER trg_po_owner_before_insert BEFORE INSERT ON PurchaseOrder FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM Quotation q JOIN RFQ r ON r.rfq_id=q.rfq_id
    JOIN Project p ON p.project_id=r.project_id
    JOIN `User` u ON u.user_id=NEW.created_by
    WHERE q.quotation_id=NEW.quotation_id AND q.status='accepted'
      AND p.owner_user_id=NEW.created_by AND u.role='GC'
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PO requires accepted quote and project-owning GC'; END IF;
END$$
CREATE TRIGGER trg_po_owner_before_update BEFORE UPDATE ON PurchaseOrder FOR EACH ROW
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM Quotation q JOIN RFQ r ON r.rfq_id=q.rfq_id
    JOIN Project p ON p.project_id=r.project_id
    JOIN `User` u ON u.user_id=NEW.created_by
    WHERE q.quotation_id=NEW.quotation_id AND q.status='accepted'
      AND p.owner_user_id=NEW.created_by AND u.role='GC'
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PO requires accepted quote and project-owning GC'; END IF;
END$$
CREATE TRIGGER trg_poi_quantity_before_insert BEFORE INSERT ON PO_Item FOR EACH ROW
BEGIN
  IF NEW.quantity > (SELECT quantity FROM Quotation_Item WHERE quotation_item_id=NEW.quotation_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PO quantity exceeds quoted quantity';
  END IF;
END$$
CREATE TRIGGER trg_poi_quantity_before_update BEFORE UPDATE ON PO_Item FOR EACH ROW
BEGIN
  IF NEW.quantity > (SELECT quantity FROM Quotation_Item WHERE quotation_item_id=NEW.quotation_item_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='PO quantity exceeds quoted quantity';
  END IF;
END$$
CREATE TRIGGER trg_user_role_before_update BEFORE UPDATE ON `User` FOR EACH ROW
BEGIN
  IF NEW.role <> OLD.role AND (
    EXISTS (SELECT 1 FROM Project WHERE owner_user_id=OLD.user_id)
    OR EXISTS (SELECT 1 FROM ProjectMember WHERE user_id=OLD.user_id)
    OR EXISTS (SELECT 1 FROM Supplier WHERE user_id=OLD.user_id)
    OR EXISTS (SELECT 1 FROM RFQ WHERE created_by=OLD.user_id)
    OR EXISTS (SELECT 1 FROM PurchaseOrder WHERE created_by=OLD.user_id)
  ) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot change role while role-dependent records exist'; END IF;
END$$
DELIMITER ;

-- STEP 2: Historical transaction table (additional to 15 MVP tables)
-- A source transaction is not assumed to be an app PurchaseOrder.
CREATE TABLE HistoricalTransaction (
  transaction_id VARCHAR(20) PRIMARY KEY,
  supplier_id VARCHAR(20) NOT NULL,
  material_id VARCHAR(20) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  price_per_unit DECIMAL(18,4) NOT NULL,
  discount_rate DECIMAL(9,4) NOT NULL,
  reported_total DECIMAL(20,4),
  calculated_total DECIMAL(20,4) GENERATED ALWAYS AS
    (ROUND(quantity * price_per_unit * (1 - discount_rate / 100), 4)) STORED,
  transaction_date DATE,
  notes TEXT,
  CONSTRAINT fk_ht_supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id),
  CONSTRAINT fk_ht_material FOREIGN KEY (material_id) REFERENCES Material(material_id),
  CONSTRAINT chk_ht_quantity CHECK (quantity > 0),
  CONSTRAINT chk_ht_price CHECK (price_per_unit >= 0),
  CONSTRAINT chk_ht_discount CHECK (discount_rate BETWEEN 0 AND 100)
) ENGINE=InnoDB;

-- STEP 3: Raw staging tables. Keep imported records intact.
CREATE TABLE stg_materials (
  staging_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  material_id VARCHAR(20),
  Item TEXT,
  Unit VARCHAR(50),
  PriceAvg VARCHAR(100),
  PriceStdev VARCHAR(100),
  NoSamples VARCHAR(100)
) ENGINE=InnoDB;

CREATE TABLE stg_companies (
  staging_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id VARCHAR(20),
  name VARCHAR(200),
  description TEXT,
  address TEXT,
  phone VARCHAR(100),
  email VARCHAR(200),
  comments TEXT
) ENGINE=InnoDB;

CREATE TABLE stg_transactions (
  staging_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transaction_id VARCHAR(20),
  company_id VARCHAR(20),
  material_id VARCHAR(20),
  quantity VARCHAR(100),
  price_per_unit VARCHAR(100),
  discount_rate VARCHAR(100),
  total_price VARCHAR(100),
  transaction_date VARCHAR(100),
  notes TEXT
) ENGINE=InnoDB;

-- STEP 4: Import files. Paths refer to MySQL server filesystem.
-- Explicit column lists are necessary because staging_id is auto-generated.
LOAD DATA INFILE '/var/lib/mysql-files/materials.tsv'
INTO TABLE stg_materials
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES
(material_id, Item, Unit, PriceAvg, PriceStdev, NoSamples);

LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv'
INTO TABLE stg_companies
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES
(company_id, name, description, address, phone, email, comments);

LOAD DATA INFILE '/var/lib/mysql-files/transactions.tsv'
INTO TABLE stg_transactions
CHARACTER SET utf8mb4
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\r\n'
IGNORE 1 LINES
(transaction_id, company_id, material_id, quantity, price_per_unit,
 discount_rate, total_price, transaction_date, notes);

-- STEP 5: Quality review before transformation.
SELECT 'raw_companies' AS metric, COUNT(*) AS row_count FROM stg_companies
UNION ALL SELECT 'raw_materials', COUNT(*) FROM stg_materials
UNION ALL SELECT 'raw_transactions', COUNT(*) FROM stg_transactions;

-- Duplicate IDs in master datasets must not be silently collapsed.
CREATE TABLE ETL_RejectedMaster (
  source_table VARCHAR(30) NOT NULL,
  staging_id BIGINT NOT NULL,
  source_id VARCHAR(20),
  reason VARCHAR(255) NOT NULL,
  PRIMARY KEY (source_table,staging_id)
) ENGINE=InnoDB;

INSERT INTO ETL_RejectedMaster(source_table,staging_id,source_id,reason)
SELECT 'companies', c.staging_id, c.company_id,
       CASE WHEN c.company_id IS NULL OR TRIM(c.company_id) = '' THEN 'Missing company ID'
            WHEN c.name IS NULL OR TRIM(c.name) = '' THEN 'Missing company name'
            ELSE 'Duplicate company ID' END
FROM stg_companies c
JOIN (SELECT company_id, COUNT(*) AS n FROM stg_companies GROUP BY company_id) d
  ON c.company_id <=> d.company_id
WHERE c.company_id IS NULL OR TRIM(c.company_id) = ''
   OR c.name IS NULL OR TRIM(c.name) = '' OR d.n > 1;

INSERT INTO ETL_RejectedMaster(source_table,staging_id,source_id,reason)
SELECT 'materials', m.staging_id, m.material_id,
       CASE WHEN m.material_id IS NULL OR TRIM(m.material_id) = '' THEN 'Missing material ID'
            WHEN m.Item IS NULL OR TRIM(m.Item) = '' THEN 'Missing material name'
            WHEN m.Unit IS NULL OR TRIM(m.Unit) = '' THEN 'Missing unit'
            ELSE 'Duplicate material ID' END
FROM stg_materials m
JOIN (SELECT material_id, COUNT(*) AS n FROM stg_materials GROUP BY material_id) d
  ON m.material_id <=> d.material_id
WHERE m.material_id IS NULL OR TRIM(m.material_id) = ''
   OR m.Item IS NULL OR TRIM(m.Item) = ''
   OR m.Unit IS NULL OR TRIM(m.Unit) = '' OR d.n > 1;

-- STEP 6: Load valid suppliers/materials. No dummy users or projects.
INSERT INTO Supplier (supplier_id,company_name,description,location,phone,email)
SELECT c.company_id,c.name,c.description,c.address,c.phone,c.email
FROM stg_companies c
LEFT JOIN ETL_RejectedMaster r
  ON r.source_table='companies' AND r.staging_id=c.staging_id
WHERE r.staging_id IS NULL;

INSERT INTO Material (material_id,name,unit)
SELECT m.material_id,m.Item,m.Unit
FROM stg_materials m
LEFT JOIN ETL_RejectedMaster r
  ON r.source_table='materials' AND r.staging_id=m.staging_id
WHERE r.staging_id IS NULL;

-- Keep Day/Hour items: units alone do not prove a row is invalid.
-- No SupplierMaterial rows are invented: files contain no supplier-specific listings.

-- STEP 7: Validate once, then use the same decision for reject and load.
-- This avoids inconsistent CASE/WHERE rules and unsafe casts of raw text.
CREATE TABLE ETL_RejectedTransaction (
  staging_id BIGINT PRIMARY KEY,
  transaction_id VARCHAR(20),
  reason VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

-- Temporary review is recreated each time a fresh script execution begins.
-- Numeric conversion only occurs after strict format/precision validation.
CREATE TEMPORARY TABLE etl_tx_parsed AS
SELECT t.*,
  CASE WHEN TRIM(t.quantity) REGEXP '^[0-9]{1,14}([.][0-9]{1,4})?$'
       THEN CAST(TRIM(t.quantity) AS DECIMAL(18,4)) ELSE NULL END AS valid_quantity,
  CASE WHEN TRIM(t.price_per_unit) REGEXP '^[0-9]{1,14}([.][0-9]{1,4})?$'
       THEN CAST(TRIM(t.price_per_unit) AS DECIMAL(18,4)) ELSE NULL END AS valid_price,
  CASE WHEN TRIM(t.discount_rate) REGEXP '^[0-9]{1,5}([.][0-9]{1,4})?$'
       THEN CAST(TRIM(t.discount_rate) AS DECIMAL(9,4)) ELSE NULL END AS valid_discount,
  CASE WHEN t.total_price IS NULL OR TRIM(t.total_price) = '' THEN NULL
       WHEN TRIM(t.total_price) REGEXP '^[0-9]{1,16}([.][0-9]{1,4})?$'
       THEN CAST(TRIM(t.total_price) AS DECIMAL(20,4)) ELSE NULL END AS valid_reported_total,
  CASE WHEN t.transaction_date IS NULL OR TRIM(t.transaction_date) = '' THEN 1
       WHEN TRIM(t.transaction_date) REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND SUBSTRING(t.transaction_date,1,4) <> '0000'
        AND SUBSTRING(t.transaction_date,6,2) BETWEEN '01' AND '12'
        AND CAST(SUBSTRING(t.transaction_date,9,2) AS UNSIGNED) BETWEEN 1 AND
          CASE WHEN SUBSTRING(t.transaction_date,6,2) IN ('04','06','09','11') THEN 30
               WHEN SUBSTRING(t.transaction_date,6,2) = '02' THEN
                 CASE WHEN MOD(CAST(SUBSTRING(t.transaction_date,1,4) AS UNSIGNED),400)=0
                           OR (MOD(CAST(SUBSTRING(t.transaction_date,1,4) AS UNSIGNED),4)=0
                           AND MOD(CAST(SUBSTRING(t.transaction_date,1,4) AS UNSIGNED),100)<>0)
                      THEN 29 ELSE 28 END
               ELSE 31 END
       THEN 1 ELSE 0 END AS valid_date_flag
FROM stg_transactions t;

CREATE TEMPORARY TABLE etl_tx_review AS
SELECT p.*,
  CASE
    WHEN p.transaction_id IS NULL OR TRIM(p.transaction_id) = '' THEN 'Missing transaction ID'
    WHEN d.n > 1 THEN 'Duplicate transaction ID'
    WHEN s.supplier_id IS NULL THEN 'Unknown or rejected supplier'
    WHEN m.material_id IS NULL THEN 'Unknown or rejected material'
    WHEN p.valid_quantity IS NULL OR p.valid_quantity <= 0 THEN 'Invalid quantity'
    WHEN p.valid_price IS NULL THEN 'Invalid price_per_unit'
    WHEN p.valid_discount IS NULL OR p.valid_discount > 100 THEN 'Invalid discount_rate'
    WHEN p.total_price IS NOT NULL AND TRIM(p.total_price) <> ''
         AND p.valid_reported_total IS NULL THEN 'Invalid reported total'
    WHEN p.valid_date_flag = 0 THEN 'Invalid transaction date'
    -- DECIMAL(20,4) allows at most 16 integer digits.
    WHEN (p.valid_quantity * p.valid_price * (1 - p.valid_discount / 100))
          > 9999999999999999.9999 THEN 'Calculated total exceeds DECIMAL(20,4)'
    ELSE NULL
  END AS rejection_reason
FROM etl_tx_parsed p
JOIN (SELECT transaction_id, COUNT(*) AS n
      FROM stg_transactions GROUP BY transaction_id) d
  ON p.transaction_id <=> d.transaction_id
LEFT JOIN Supplier s ON s.supplier_id = p.company_id
LEFT JOIN Material m ON m.material_id = p.material_id;

INSERT INTO ETL_RejectedTransaction (staging_id, transaction_id, reason)
SELECT staging_id, transaction_id, rejection_reason
FROM etl_tx_review
WHERE rejection_reason IS NOT NULL;

-- Historical source transactions are not application PurchaseOrders.
-- The generated calculated_total uses the validated decimal inputs.
INSERT INTO HistoricalTransaction
  (transaction_id, supplier_id, material_id, quantity, price_per_unit,
   discount_rate, reported_total, transaction_date, notes)
SELECT transaction_id, company_id, material_id,
       valid_quantity, valid_price, valid_discount, valid_reported_total,
       CASE WHEN transaction_date IS NULL OR TRIM(transaction_date) = '' THEN NULL
            ELSE CAST(TRIM(transaction_date) AS DATE) END,
       notes
FROM etl_tx_review
WHERE rejection_reason IS NULL;

DROP TEMPORARY TABLE etl_tx_review;
DROP TEMPORARY TABLE etl_tx_parsed;

-- STEP 8: Verification
SELECT 'Suppliers' AS table_name, COUNT(*) AS row_count FROM Supplier
UNION ALL SELECT 'Materials', COUNT(*) FROM Material
UNION ALL SELECT 'HistoricalTransactions', COUNT(*) FROM HistoricalTransaction
UNION ALL SELECT 'RejectedMasterRows', COUNT(*) FROM ETL_RejectedMaster
UNION ALL SELECT 'RejectedTransactionRows', COUNT(*) FROM ETL_RejectedTransaction;

SELECT reason, COUNT(*) AS rejected_rows
FROM ETL_RejectedTransaction GROUP BY reason ORDER BY rejected_rows DESC;

SELECT COUNT(*) AS transactions_with_total_difference_over_1
FROM HistoricalTransaction
WHERE reported_total IS NOT NULL AND ABS(reported_total-calculated_total)>1;

SELECT s.supplier_id,s.company_name,COUNT(*) AS total_transactions,
       ROUND(SUM(h.calculated_total),2) AS calculated_spend
FROM HistoricalTransaction h JOIN Supplier s ON h.supplier_id=s.supplier_id
GROUP BY s.supplier_id,s.company_name ORDER BY calculated_spend DESC LIMIT 5;

SELECT m.material_id,m.name,COUNT(*) AS times_transacted,
       ROUND(SUM(h.calculated_total),2) AS calculated_revenue
FROM HistoricalTransaction h JOIN Material m ON h.material_id=m.material_id
GROUP BY m.material_id,m.name ORDER BY times_transacted DESC LIMIT 5;

-- ETL reconciliation: difference must be zero.
SELECT (SELECT COUNT(*) FROM stg_transactions) AS raw_rows,
       (SELECT COUNT(*) FROM HistoricalTransaction) AS accepted_rows,
       (SELECT COUNT(*) FROM ETL_RejectedTransaction) AS rejected_rows,
       (SELECT COUNT(*) FROM stg_transactions)
        - (SELECT COUNT(*) FROM HistoricalTransaction)
        - (SELECT COUNT(*) FROM ETL_RejectedTransaction) AS difference;

-- Source file coverage; no artificial application records are generated.
SELECT (SELECT COUNT(*) FROM stg_companies) AS raw_companies,
       (SELECT COUNT(*) FROM Supplier) AS imported_suppliers,
       (SELECT COUNT(*) FROM stg_materials) AS raw_materials,
       (SELECT COUNT(*) FROM Material) AS imported_materials;

-- Additional application/database rules still needed for full production use:
-- PO status transitions, issuing a PO only with items, and restrictions on
-- changing already-referenced parent records (e.g. accepted quotation).

-- Final structural checks (21 tables: 15 MVP + historical + 3 staging + 2 rejects).
SELECT COUNT(*) AS tables_created FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE';
SELECT COUNT(*) AS triggers_created FROM information_schema.triggers
WHERE trigger_schema = DATABASE();
