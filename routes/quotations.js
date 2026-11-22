// =====================================
// SUPPLIX - QUOTATION MANAGEMENT
// =====================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.connection = null;

// =====================================
// HELPER FUNCTIONS
// =====================================

function query(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

function beginTransaction(connection) {
    return new Promise((resolve, reject) => {
        connection.beginTransaction(err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function commitTransaction(connection) {
    return new Promise((resolve, reject) => {
        connection.commit(err => {
            if (err) return reject(err);
            resolve();
        });
    });
}

function rollbackTransaction(connection) {
    return new Promise(resolve => {
        connection.rollback(err => {
            if (err) console.error('Rollback error:', err);
            resolve();
        });
    });
}

function generateId(prefix) {
    return prefix + crypto.randomBytes(6).toString('hex');
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function toArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function handleDatabaseError(res, err, action) {
    console.error('Quotation ' + action + ' error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).send('Quotation ID already exists.');
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).send('Invalid RFQ or Supplier. Make sure the supplier is invited to this RFQ first.');
    }
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
        return res.status(409).send('This record is referenced by other records and cannot be removed.');
    }
    return res.status(500).send('Unable to ' + action + ' Quotation. Please try again.');
}

function sendSuccess(req, res) {
    if (req.get('HX-Request')) {
        res.set('HX-Redirect', '/quotations/');
        return res.sendStatus(200);
    }
    return res.redirect('/quotations/');
}

// =====================================
// 1. QUOTATION LIST + SEARCH
// =====================================

router.get('/', async (req, res) => {
    const search = String(req.query.search || '').trim();

    let sql = `
        SELECT
            q.quotation_id,
            q.rfq_id,
            q.supplier_id,
            s.company_name AS supplier_name,
            q.delivery_terms,
            q.status,
            DATE_FORMAT(q.created_at, '%Y-%m-%d %H:%i') AS created_at
        FROM Quotation q
        LEFT JOIN Supplier s ON q.supplier_id = s.supplier_id
    `;

    const params = [];
    if (search !== '') {
        sql += `
            WHERE q.quotation_id LIKE ?
               OR q.rfq_id LIKE ?
               OR s.company_name LIKE ?
        `;
        params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }

    sql += ` ORDER BY q.created_at DESC LIMIT 100`;

    try {
        const quotations = await query(router.connection, sql, params);
        return res.render('quotations/index', {
            layout: false,
            quotations,
            search
        });
    } catch (err) {
        console.error('Error loading Quotations:', err);
        return res.status(500).send('Database error');
    }
});

// =====================================
// 2. CREATE QUOTATION - DISPLAY FORM
// =====================================

router.get('/add', async (req, res) => {
    try {
        const rfqSuppliers = await query(router.connection, `
            SELECT
                rs.rfq_id,
                rs.supplier_id,
                s.company_name,
                r.project_id
            FROM RFQ_Supplier rs
            JOIN Supplier s ON rs.supplier_id = s.supplier_id
            JOIN RFQ r ON rs.rfq_id = r.rfq_id
            ORDER BY rs.rfq_id ASC
        `);

        const rfqItems = await query(router.connection, `
            SELECT
                ri.rfq_item_id,
                ri.rfq_id,
                ri.material_id,
                m.name AS material_name,
                ri.quantity,
                m.unit
            FROM RFQ_Item ri
            JOIN Material m ON ri.material_id = m.material_id
            ORDER BY ri.rfq_id ASC
        `);

        return res.render('quotations/add', {
            layout: false,
            rfqSuppliers,
            rfqItems: JSON.stringify(rfqItems)
        });
    } catch (err) {
        console.error('Error loading Create Quotation form:', err);
        return res.status(500).send('Database error');
    }
});

// =====================================
// 3. CREATE QUOTATION - SAVE
// =====================================

router.post('/add', async (req, res) => {
    const quotation_id = String(req.body.quotation_id || '').trim();
    const rfq_id = String(req.body.rfq_id || '').trim();
    const supplier_id = String(req.body.supplier_id || '').trim();
    const delivery_terms = String(req.body.delivery_terms || '').trim();
    const status = String(req.body.status || '').trim();

    if (!quotation_id || quotation_id.length > 20) {
        return res.status(400).send('Invalid Quotation ID.');
    }
    if (!rfq_id || !supplier_id) {
        return res.status(400).send('Please select RFQ and Supplier.');
    }
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).send('Invalid status.');
    }

    const rfqItemIds = toArray(req.body['rfq_item_id[]'] ?? req.body.rfq_item_id);
    const unitPrices = toArray(req.body['unit_price[]'] ?? req.body.unit_price);
    const quantities = toArray(req.body['quantity[]'] ?? req.body.quantity);
    const deliveryDates = toArray(req.body['delivery_date[]'] ?? req.body.delivery_date);

    if (rfqItemIds.length === 0) {
        return res.status(400).send('Please add at least one item.');
    }

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        await query(connection, `
            INSERT INTO Quotation (quotation_id, rfq_id, supplier_id, delivery_terms, status)
            VALUES (?, ?, ?, ?, ?)
        `, [quotation_id, rfq_id, supplier_id, delivery_terms || null, status]);

        for (let i = 0; i < rfqItemIds.length; i++) {
            const rfq_item_id = String(rfqItemIds[i] || '').trim();
            const unit_price = String(unitPrices[i] || '').trim();
            const quantity = String(quantities[i] || '').trim();
            const delivery_date = String(deliveryDates[i] || '').trim();

            if (!rfq_item_id || !unit_price || !quantity || !isValidDate(delivery_date)) {
                await rollbackTransaction(connection);
                return res.status(400).send('Invalid item data at row ' + (i + 1));
            }

            await query(connection, `
                INSERT INTO Quotation_Item
                (quotation_item_id, quotation_id, rfq_item_id, unit_price, quantity, delivery_date)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [generateId('QI_'), quotation_id, rfq_item_id, unit_price, quantity, delivery_date]);
        }

        await commitTransaction(connection);
        transactionStarted = false;
        return sendSuccess(req, res);
    } catch (err) {
        if (transactionStarted) await rollbackTransaction(connection);
        return handleDatabaseError(res, err, 'create');
    }
});

// =====================================
// 4. EDIT QUOTATION - DISPLAY FORM
// =====================================

router.get('/edit/:id', async (req, res) => {
    const quotationId = String(req.params.id || '').trim();

    try {
        const rows = await query(router.connection, `
            SELECT quotation_id, rfq_id, supplier_id, delivery_terms, status
            FROM Quotation WHERE quotation_id = ?
        `, [quotationId]);

        if (rows.length === 0) return res.status(404).send('Quotation not found.');

        const quotation = rows[0];
        quotation.statusPending  = quotation.status === 'pending';
        quotation.statusAccepted = quotation.status === 'accepted';
        quotation.statusRejected = quotation.status === 'rejected';

        const items = await query(router.connection, `
            SELECT
                qi.quotation_item_id,
                qi.rfq_item_id,
                qi.unit_price,
                qi.quantity,
                DATE_FORMAT(qi.delivery_date, '%Y-%m-%d') AS delivery_date,
                m.name AS material_name,
                m.unit AS material_unit
            FROM Quotation_Item qi
            JOIN RFQ_Item ri ON qi.rfq_item_id = ri.rfq_item_id
            JOIN Material m ON ri.material_id = m.material_id
            WHERE qi.quotation_id = ?
            ORDER BY qi.quotation_item_id ASC
        `, [quotationId]);

        const rfqSuppliers = await query(router.connection, `
            SELECT rs.rfq_id, rs.supplier_id, s.company_name
            FROM RFQ_Supplier rs
            JOIN Supplier s ON rs.supplier_id = s.supplier_id
            ORDER BY rs.rfq_id ASC
        `);

        rfqSuppliers.forEach(rs => {
            rs.selected = rs.rfq_id === quotation.rfq_id && rs.supplier_id === quotation.supplier_id;
        });

        return res.render('quotations/edit', {
            layout: false,
            quotation,
            items,
            rfqSuppliers
        });
    } catch (err) {
        console.error('Error loading Edit Quotation form:', err);
        return res.status(500).send('Database error');
    }
});

// =====================================
// 5. EDIT QUOTATION - SAVE
// =====================================

router.post('/edit/:id', async (req, res) => {
    const quotationId = String(req.params.id || '').trim();
    const delivery_terms = String(req.body.delivery_terms || '').trim();
    const status = String(req.body.status || '').trim();

    if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return res.status(400).send('Invalid status.');
    }

    const quotation_item_ids = toArray(req.body['quotation_item_id[]'] ?? req.body.quotation_item_id);
    const unitPrices = toArray(req.body['unit_price[]'] ?? req.body.unit_price);
    const quantities = toArray(req.body['quantity[]'] ?? req.body.quantity);
    const deliveryDates = toArray(req.body['delivery_date[]'] ?? req.body.delivery_date);

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        const existing = await query(connection,
            `SELECT quotation_id FROM Quotation WHERE quotation_id = ? FOR UPDATE`,
            [quotationId]
        );
        if (existing.length === 0) {
            await rollbackTransaction(connection);
            return res.status(404).send('Quotation not found.');
        }

        await query(connection, `
            UPDATE Quotation SET delivery_terms = ?, status = ?
            WHERE quotation_id = ?
        `, [delivery_terms || null, status, quotationId]);

        for (let i = 0; i < quotation_item_ids.length; i++) {
            const qiId = String(quotation_item_ids[i] || '').trim();
            const unit_price = String(unitPrices[i] || '').trim();
            const quantity = String(quantities[i] || '').trim();
            const delivery_date = String(deliveryDates[i] || '').trim();

            if (!qiId || !unit_price || !quantity || !isValidDate(delivery_date)) {
                await rollbackTransaction(connection);
                return res.status(400).send('Invalid item data at row ' + (i + 1));
            }

            await query(connection, `
                UPDATE Quotation_Item
                SET unit_price = ?, quantity = ?, delivery_date = ?
                WHERE quotation_item_id = ? AND quotation_id = ?
            `, [unit_price, quantity, delivery_date, qiId, quotationId]);
        }

        await commitTransaction(connection);
        transactionStarted = false;
        return sendSuccess(req, res);
    } catch (err) {
        if (transactionStarted) await rollbackTransaction(connection);
        return handleDatabaseError(res, err, 'update');
    }
});

// =====================================
// 6. DELETE QUOTATION
// =====================================

router.delete('/delete/:id', async (req, res) => {
    const quotationId = String(req.params.id || '').trim();
    if (!quotationId || quotationId.length > 20) {
        return res.status(400).send('Invalid Quotation ID.');
    }

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        const existing = await query(connection,
            `SELECT quotation_id FROM Quotation WHERE quotation_id = ? FOR UPDATE`,
            [quotationId]
        );
        if (existing.length === 0) {
            await rollbackTransaction(connection);
            return res.status(404).send('Quotation not found.');
        }

        await query(connection,
            `DELETE FROM Quotation_Item WHERE quotation_id = ?`,
            [quotationId]
        );
        await query(connection,
            `DELETE FROM Quotation WHERE quotation_id = ?`,
            [quotationId]
        );

        await commitTransaction(connection);
        transactionStarted = false;

        res.set('HX-Redirect', '/quotations/');
        return res.sendStatus(200);
    } catch (err) {
        if (transactionStarted) await rollbackTransaction(connection);
        return handleDatabaseError(res, err, 'delete');
    }
});

module.exports = router;