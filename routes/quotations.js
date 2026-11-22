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

function handleDatabaseError(res, err, action) {
    console.error('Quotation ' + action + ' error:', err);

    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).send('Quotation ID already exists.');
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).send('Invalid RFQ or Supplier selection.');
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

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1000 || year > 9999) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}

function validateQuotation(body, quotationIdOverride = null) {
    const quotation_id = quotationIdOverride !== null
        ? String(quotationIdOverride).trim()
        : String(body.quotation_id || '').trim();

    const rfq_id = String(body.rfq_id || '').trim();
    const supplier_id = String(body.supplier_id || '').trim();
    const unit_price = String(body.unit_price || '').trim();
    const quantity = String(body.quantity || '').trim();
    const delivery_date = String(body.delivery_date || '').trim();
    const delivery_terms = String(body.delivery_terms || '').trim();
    const status = String(body.status || '').trim();

    if (!quotation_id || quotation_id.length > 20) {
        return { error: 'Invalid Quotation ID.' };
    }
    if (!rfq_id || rfq_id.length > 20) {
        return { error: 'Please select an RFQ.' };
    }
    if (!supplier_id || supplier_id.length > 20) {
        return { error: 'Please select a Supplier.' };
    }
    if (!/^\d+(\.\d{1,2})?$/.test(unit_price) || Number(unit_price) <= 0) {
        return { error: 'Invalid unit price.' };
    }
    if (!/^\d+(\.\d{1,2})?$/.test(quantity) || Number(quantity) <= 0) {
        return { error: 'Invalid quantity.' };
    }
    if (!isValidDate(delivery_date)) {
        return { error: 'Invalid delivery date.' };
    }
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return { error: 'Invalid status.' };
    }

    return {
        quotation_id,
        rfq_id,
        supplier_id,
        unit_price,
        quantity,
        delivery_date,
        delivery_terms: delivery_terms || null,
        status
    };
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
            s.name AS supplier_name,
            q.unit_price,
            q.quantity,
            DATE_FORMAT(q.delivery_date, '%Y-%m-%d') AS delivery_date,
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
               OR s.name LIKE ?
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
        const rfqs = await query(router.connection,
            `SELECT rfq_id FROM RFQ ORDER BY rfq_id ASC`
        );
        const suppliers = await query(router.connection,
            `SELECT supplier_id, name FROM Supplier ORDER BY name ASC`
        );
        return res.render('quotations/add', {
            layout: false,
            rfqs,
            suppliers
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
    const data = validateQuotation(req.body);
    if (data.error) return res.status(400).send(data.error);

    try {
        await query(router.connection, `
            INSERT INTO Quotation
            (quotation_id, rfq_id, supplier_id, unit_price, quantity, delivery_date, delivery_terms, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.quotation_id,
            data.rfq_id,
            data.supplier_id,
            data.unit_price,
            data.quantity,
            data.delivery_date,
            data.delivery_terms,
            data.status
        ]);
        return sendSuccess(req, res);
    } catch (err) {
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
            SELECT
                quotation_id,
                rfq_id,
                supplier_id,
                unit_price,
                quantity,
                DATE_FORMAT(delivery_date, '%Y-%m-%d') AS delivery_date,
                delivery_terms,
                status
            FROM Quotation
            WHERE quotation_id = ?
        `, [quotationId]);

        if (rows.length === 0) return res.status(404).send('Quotation not found.');

        const quotation = rows[0];
        quotation.statusPending  = quotation.status === 'pending';
        quotation.statusAccepted = quotation.status === 'accepted';
        quotation.statusRejected = quotation.status === 'rejected';

        const rfqs = await query(router.connection,
            `SELECT rfq_id FROM RFQ ORDER BY rfq_id ASC`
        );
        const suppliers = await query(router.connection,
            `SELECT supplier_id, name FROM Supplier ORDER BY name ASC`
        );

        rfqs.forEach(r => { r.selected = r.rfq_id === quotation.rfq_id; });
        suppliers.forEach(s => { s.selected = s.supplier_id === quotation.supplier_id; });

        return res.render('quotations/edit', {
            layout: false,
            quotation,
            rfqs,
            suppliers
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
    const data = validateQuotation(req.body, quotationId);
    if (data.error) return res.status(400).send(data.error);

    try {
        const existing = await query(router.connection,
            `SELECT quotation_id FROM Quotation WHERE quotation_id = ?`,
            [quotationId]
        );
        if (existing.length === 0) return res.status(404).send('Quotation not found.');

        await query(router.connection, `
            UPDATE Quotation
            SET rfq_id = ?, supplier_id = ?, unit_price = ?, quantity = ?,
                delivery_date = ?, delivery_terms = ?, status = ?
            WHERE quotation_id = ?
        `, [
            data.rfq_id,
            data.supplier_id,
            data.unit_price,
            data.quantity,
            data.delivery_date,
            data.delivery_terms,
            data.status,
            quotationId
        ]);
        return sendSuccess(req, res);
    } catch (err) {
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

    try {
        const existing = await query(router.connection,
            `SELECT quotation_id FROM Quotation WHERE quotation_id = ?`,
            [quotationId]
        );
        if (existing.length === 0) return res.status(404).send('Quotation not found.');

        await query(router.connection,
            `DELETE FROM Quotation WHERE quotation_id = ?`,
            [quotationId]
        );

        res.set('HX-Redirect', '/quotations/');
        return res.sendStatus(200);
    } catch (err) {
        return handleDatabaseError(res, err, 'delete');
    }
});

module.exports = router;