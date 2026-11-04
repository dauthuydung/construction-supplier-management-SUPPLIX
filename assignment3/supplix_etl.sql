-- ============================================
-- SUPPLIX Database ETL Process
-- Assignment #3
-- Group 4: Dau Thuy Dung, 黃晴
-- ============================================

-- ============================================
-- STEP 1: 建立資料庫
-- ============================================

CREATE DATABASE SUPPLIX;
USE SUPPLIX;

-- ============================================
-- STEP 2: 建立正式資料表
-- ============================================

-- 目的：建立 User 表，儲存所有使用者帳號資訊
CREATE TABLE User (
    user_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('GC', 'Supplier', 'PM') NOT NULL,
    phone VARCHAR(20),
    created_at DATETIME NOT NULL DEFAULT NOW()
);

-- 目的：建立 Project 表，儲存專案資訊
CREATE TABLE Project (
    project_id VARCHAR(20) PRIMARY KEY,
    user_id VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    location VARCHAR(200),
    status ENUM('active', 'completed') NOT NULL DEFAULT 'active',
    start_date DATE,
    end_date DATE,
    CONSTRAINT FK_Project_User FOREIGN KEY (user_id) REFERENCES User(user_id)
);

-- 目的：建立 Supplier 表，儲存供應商資訊
CREATE TABLE Supplier (
    supplier_id VARCHAR(20) PRIMARY KEY,
    user_id VARCHAR(20),
    company_name VARCHAR(200) NOT NULL,
    description TEXT,
    location VARCHAR(200),
    phone VARCHAR(100),
    email VARCHAR(200),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT FK_Supplier_User FOREIGN KEY (user_id) REFERENCES User(user_id)
);

-- 目的：建立 Material 表，儲存建材資訊
CREATE TABLE Material (
    material_id VARCHAR(20) PRIMARY KEY,
    supplier_id VARCHAR(20),
    name TEXT NOT NULL,
    unit VARCHAR(50) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    price_stdev DECIMAL(10,2),
    no_samples INT,
    stock_available BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT FK_Material_Supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
);

-- 目的：建立 RFQ 表，儲存詢價單資訊
CREATE TABLE RFQ (
    rfq_id VARCHAR(20) PRIMARY KEY,
    project_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    deadline DATE NOT NULL,
    status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    created_at DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT FK_RFQ_Project FOREIGN KEY (project_id) REFERENCES Project(project_id),
    CONSTRAINT FK_RFQ_User FOREIGN KEY (user_id) REFERENCES User(user_id)
);

-- 目的：建立 RFQ_Item 表，儲存詢價單明細
CREATE TABLE RFQ_Item (
    rfq_item_id VARCHAR(20) PRIMARY KEY,
    rfq_id VARCHAR(20) NOT NULL,
    material_id VARCHAR(20) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    required_date DATE,
    CONSTRAINT FK_RFQItem_RFQ FOREIGN KEY (rfq_id) REFERENCES RFQ(rfq_id),
    CONSTRAINT FK_RFQItem_Material FOREIGN KEY (material_id) REFERENCES Material(material_id)
);

-- 目的：建立 Quotation 表，儲存報價資訊
CREATE TABLE Quotation (
    quotation_id VARCHAR(20) PRIMARY KEY,
    rfq_id VARCHAR(20) NOT NULL,
    supplier_id VARCHAR(20) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    delivery_date DATE NOT NULL,
    delivery_terms TEXT,
    status ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT FK_Quotation_RFQ FOREIGN KEY (rfq_id) REFERENCES RFQ(rfq_id),
    CONSTRAINT FK_Quotation_Supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id)
);

-- 目的：建立 PurchaseOrder 表，儲存採購單資訊
CREATE TABLE PurchaseOrder (
    po_id VARCHAR(20) PRIMARY KEY,
    project_id VARCHAR(20) NOT NULL,
    quotation_id VARCHAR(20),
    supplier_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    status ENUM('pending', 'accepted', 'in_progress', 'fulfilled') NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(10,2) NOT NULL,
    transaction_date DATE,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT FK_PO_Project FOREIGN KEY (project_id) REFERENCES Project(project_id),
    CONSTRAINT FK_PO_Quotation FOREIGN KEY (quotation_id) REFERENCES Quotation(quotation_id),
    CONSTRAINT FK_PO_Supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id),
    CONSTRAINT FK_PO_User FOREIGN KEY (user_id) REFERENCES User(user_id)
);

-- 目的：建立 PO_Item 表，儲存採購單明細
CREATE TABLE PO_Item (
    po_item_id VARCHAR(20) PRIMARY KEY,
    po_id VARCHAR(20) NOT NULL,
    material_id VARCHAR(20) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
    subtotal DECIMAL(10,2) NOT NULL,
    CONSTRAINT FK_POItem_PO FOREIGN KEY (po_id) REFERENCES PurchaseOrder(po_id),
    CONSTRAINT FK_POItem_Material FOREIGN KEY (material_id) REFERENCES Material(material_id)
);

-- 目的：建立 Delivery 表，儲存配送資訊
CREATE TABLE Delivery (
    delivery_id VARCHAR(20) PRIMARY KEY,
    po_id VARCHAR(20) NOT NULL,
    status ENUM('dispatched', 'out_for_delivery', 'delivered', 'delayed') NOT NULL DEFAULT 'dispatched',
    estimated_date DATE NOT NULL,
    actual_date DATE,
    delay_reason TEXT,
    updated_at DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT FK_Delivery_PO FOREIGN KEY (po_id) REFERENCES PurchaseOrder(po_id)
);

-- 目的：建立 Document 表，儲存文件資訊
CREATE TABLE Document (
    document_id VARCHAR(20) PRIMARY KEY,
    project_id VARCHAR(20),
    supplier_id VARCHAR(20),
    po_id VARCHAR(20),
    uploaded_by VARCHAR(20),
    document_type ENUM('certificate', 'invoice', 'safety_sheet', 'contract') NOT NULL,
    file_name VARCHAR(200) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    expiry_date DATE,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    CONSTRAINT FK_Document_Project FOREIGN KEY (project_id) REFERENCES Project(project_id),
    CONSTRAINT FK_Document_Supplier FOREIGN KEY (supplier_id) REFERENCES Supplier(supplier_id),
    CONSTRAINT FK_Document_PO FOREIGN KEY (po_id) REFERENCES PurchaseOrder(po_id),
    CONSTRAINT FK_Document_User FOREIGN KEY (uploaded_by) REFERENCES User(user_id)
);

-- ============================================
-- STEP 3: 建立暫存表（Staging Tables）
-- ============================================

-- 目的：建立 stg_materials 暫存表，載入原始 materials.tsv 資料
CREATE TABLE stg_materials (
    material_id VARCHAR(20),
    Item TEXT,
    Unit VARCHAR(50),
    PriceAvg FLOAT,
    PriceStdev FLOAT,
    NoSamples INT
);

-- 目的：建立 stg_companies 暫存表，載入原始 companies.tsv 資料
CREATE TABLE stg_companies (
    company_id VARCHAR(20),
    name VARCHAR(200),
    description TEXT,
    address TEXT,
    phone VARCHAR(100),
    email VARCHAR(200),
    comments TEXT
);

-- 目的：建立 stg_transactions 暫存表，載入原始 transactions.tsv 資料
CREATE TABLE stg_transactions (
    transaction_id VARCHAR(20),
    company_id VARCHAR(20),
    material_id VARCHAR(20),
    quantity FLOAT,
    price_per_unit FLOAT,
    discount_rate FLOAT,
    total_price FLOAT,
    transaction_date DATE,
    notes TEXT
);

-- ============================================
-- STEP 4: 載入原始資料到暫存表
-- ============================================

-- 目的：從 materials.tsv 載入 458 筆建材資料
LOAD DATA INFILE '/var/lib/mysql-files/materials.tsv'
INTO TABLE stg_materials
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- 目的：從 companies.tsv 載入 500 筆供應商資料
LOAD DATA INFILE '/var/lib/mysql-files/companies.tsv'
INTO TABLE stg_companies
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- 目的：從 transactions.tsv 載入 51,947 筆交易資料
LOAD DATA INFILE '/var/lib/mysql-files/transactions.tsv'
INTO TABLE stg_transactions
FIELDS TERMINATED BY '\t'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- ============================================
-- STEP 5: 資料品質檢查（找出錯誤）
-- ============================================

-- 錯誤1：找出 transactions 中 company_id 不存在於 companies 的資料（2,615筆）
SELECT COUNT(*) 
FROM stg_transactions t
LEFT JOIN stg_companies c ON t.company_id = c.company_id
WHERE c.company_id IS NULL;

-- 錯誤2：找出 transactions 中 material_id 不存在於 materials 的資料（2,643筆）
SELECT COUNT(*) 
FROM stg_transactions t
LEFT JOIN stg_materials m ON t.material_id = m.material_id
WHERE m.material_id IS NULL;

-- 錯誤3：找出 total_price 計算錯誤的資料（19,400筆）
-- 正確公式：total_price = quantity * price_per_unit * (1 - discount_rate/100)
SELECT COUNT(*)
FROM stg_transactions
WHERE ABS(total_price - (quantity * price_per_unit * (1 - discount_rate/100))) > 1;

-- 錯誤4：找出 materials 中混入的人力/機械資料（59筆）
SELECT COUNT(*) 
FROM stg_materials 
WHERE Unit IN ('Day', 'Hour');

-- ============================================
-- STEP 6: 資料清理
-- ============================================

-- 目的：刪除 company_id 無效的 transactions（2,615筆）
DELETE FROM stg_transactions
WHERE company_id NOT IN (
    SELECT company_id FROM stg_companies
);

-- 目的：刪除 material_id 無效的 transactions（2,497筆）
DELETE FROM stg_transactions
WHERE material_id NOT IN (
    SELECT material_id FROM stg_materials
);

-- 目的：修正 total_price 計算錯誤（17,545筆）
UPDATE stg_transactions
SET total_price = ROUND(quantity * price_per_unit * (1 - discount_rate/100), 2)
WHERE ABS(total_price - (quantity * price_per_unit * (1 - discount_rate/100))) > 1;

-- 目的：將人力/機械資料從 stg_materials 移至 stg_labor
CREATE TABLE stg_labor (
    material_id VARCHAR(20),
    Item TEXT,
    Unit VARCHAR(50),
    PriceAvg FLOAT,
    PriceStdev FLOAT,
    NoSamples INT
);

INSERT INTO stg_labor
SELECT * FROM stg_materials
WHERE Unit IN ('Day', 'Hour');

DELETE FROM stg_materials
WHERE Unit IN ('Day', 'Hour');

-- ============================================
-- STEP 7: ETL 進正式資料表
-- ============================================

-- 目的：新增預設 User 和 Project（供歷史交易資料使用）
INSERT INTO User (user_id, name, email, password_hash, role)
VALUES ('U001', 'Default GC', 'gc@supplix.com', 'hashed_password', 'GC');

INSERT INTO Project (project_id, user_id, name, status)
VALUES ('P001', 'U001', 'Default Project', 'active');

-- 目的：將 500 筆供應商資料載入 Supplier 表
INSERT INTO Supplier (supplier_id, company_name, description, location, phone, email)
SELECT company_id, name, description, address, phone, email
FROM stg_companies;

-- 目的：將 458 筆建材資料載入 Material 表
INSERT INTO Material (material_id, name, unit, unit_price, price_stdev, no_samples)
SELECT material_id, Item, Unit, PriceAvg, PriceStdev, NoSamples
FROM stg_materials;

-- 目的：將有效交易資料載入 PurchaseOrder 表
INSERT INTO PurchaseOrder (po_id, project_id, supplier_id, user_id, total_amount, transaction_date, notes, status)
SELECT t.transaction_id, 'P001', t.company_id, 'U001', t.total_price, t.transaction_date, t.notes, 'fulfilled'
FROM stg_transactions t;

-- 目的：將有效交易明細載入 PO_Item 表
INSERT INTO PO_Item (po_item_id, po_id, material_id, quantity, unit_price, discount_rate, subtotal)
SELECT t.transaction_id, t.transaction_id, t.material_id, t.quantity, t.price_per_unit, t.discount_rate, t.total_price
FROM stg_transactions t;

-- 目的：刪除 Material 表中的人力/機械資料
DELETE FROM PO_Item
WHERE material_id IN (SELECT material_id FROM stg_labor);

DELETE FROM PurchaseOrder
WHERE po_id NOT IN (SELECT po_item_id FROM PO_Item);

DELETE FROM Material
WHERE unit IN ('Day', 'Hour');

-- ============================================
-- STEP 8: 驗證資料
-- ============================================

-- 目的：確認所有正式資料表的筆數
SELECT 'Supplier' AS TableName, COUNT(*) AS Count FROM Supplier
UNION ALL
SELECT 'Material', COUNT(*) FROM Material
UNION ALL
SELECT 'PurchaseOrder', COUNT(*) FROM PurchaseOrder
UNION ALL
SELECT 'PO_Item', COUNT(*) FROM PO_Item;

-- 目的：查詢交易金額最高的前5名供應商
SELECT s.company_name, COUNT(po.po_id) AS total_orders, 
       ROUND(SUM(po.total_amount), 2) AS total_amount
FROM PurchaseOrder po
JOIN Supplier s ON po.supplier_id = s.supplier_id
GROUP BY s.company_name
ORDER BY total_amount DESC
LIMIT 5;

-- 目的：查詢最常被購買的前5種建材
SELECT m.name, COUNT(pi.po_item_id) AS times_ordered,
       ROUND(SUM(pi.subtotal), 2) AS total_revenue
FROM PO_Item pi
JOIN Material m ON pi.material_id = m.material_id
GROUP BY m.name
ORDER BY times_ordered DESC
LIMIT 5;