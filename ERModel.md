# SUPPLIX - Normalized ER Diagram (3NF)

## Overview

This document presents the normalized Entity-Relationship (ER) diagram for the SUPPLIX construction material supplier management platform. The data model is normalized to Third Normal Form (3NF) to eliminate data redundancy and ensure data integrity.

## Scope Legend

- 🟢 `[MVP]` — Entity is required for the initial MVP launch
- 🔵 `[FUTURE]` — Entity is planned for future development

## Normalization Notes

The data model follows the three normalization rules:

- **1NF:** Every attribute contains a single value. Multi-valued attributes are separated into their own tables (e.g. `RFQ_Item`, `PO_Item`).
- **2NF:** Every non-key attribute is fully dependent on the primary key. Supplier details are stored in the `Supplier` table, not repeated in `Quotation` or `PurchaseOrder`.
- **3NF:** Every attribute depends directly on the primary key, not through another attribute. For example, `company_name` and `location` are stored in `Supplier`, not in `Material` or `Quotation`.

## Many-to-Many Relationships

The following M:M relationship requires a junction table in physical implementation:

| Relationship | Junction Table | Attributes |
|---|---|---|
| `RFQ` ↔ `Supplier` | `RFQ_Supplier` | `rfq_id`, `supplier_id`, `status`, `invited_at` |

---