// =====================================
// SUPPLIX - PURCHASE ORDER MANAGEMENT
// =====================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

router.connection = null;

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

function handleDatabaseError(res, err, action) {
    console.error('PurchaseOrder ' + action + ' error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).send('Purchase Order ID already exists.');
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).send('Invalid Quotation or User selection.');
    }
    if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
        return res.status(409).send('This record is referenced by other records and cannot be removed.');
    }
    return res.status(500).send('Unable to ' + action + ' Purchase Order. Please try again.');
}

function sendSuccess(req, res) {
    if (req.get('HX-Request')) {
        res.set('HX-Redirect', '/purchase_orders/');
        return res.sendStatus(200);
    }
    return res.redirect('/purchase_orders/');
}

// =====================================
// 1. PURCHASE ORDER LIST + SEARCH
// =====================================

router.get('/', async (req, res) => {
    const search = String(req.query.search || '').trim();

    let sql = `
        SELECT
            po.po_id,
            po.quotation_id,
            po.created_by,
            u.name AS created_by_name,
            q.rfq_id,
            q.supplier_id,
            s.company_name AS supplier_name,
            po.status,
            DATE_FORMAT(po.created_at, '%Y-%m-%d %H:%i') AS created_at
        FROM PurchaseOrder po
        LEFT JOIN ` + '`User`' + ` u ON po.created_by = u.user_id
        LEFT JOIN Quotation q ON po.quotation_id = q.quotation_id
        LEFT JOIN Supplier s ON q.supplier_id = s.supplier_id
    `;

    const params = [];
    if (search !== '') {
        sql += `
            WHERE po.po_id LIKE ?
               OR po.quotation_id LIKE ?
               OR s.company_name LIKE ?
        `;
        params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
    }

    sql += ` ORDER BY po.created_at DESC LIMIT 100`;

    try {
        const purchase_orders = await query(router.connection, sql, params);
        return res.render('purchase_orders/index', {
            layout: false,
            purchase_orders,
            search
        });
    } catch (err) {
        console.error('Error loading Purchase Orders:', err);
        return res.status(500).send('Database error');
    }
});

// =====================================
// 2. CREATE PO - DISPLAY FORM
// =====================================

router.get('/add', async (req, res) => {
    try {
        const quotations = await query(router.connection, `
            SELECT q.quotation_id, q.rfq_id, q.supplier_id, s.company_name
            FROM Quotation q
            JOIN Supplier s ON q.supplier_id = s.supplier_id
            WHERE q.status = 'accepted'
            AND q.quotation_id NOT IN (SELECT quotation_id FROM PurchaseOrder)
            ORDER BY q.quotation_id ASC
        `);

        const users = await query(router.connection,
            'SELECT user_id, name FROM `User` WHERE role = \'GC\' ORDER BY name ASC'
        );

        return res.render('purchase_orders/add', {
            layout: false,
            quotations,
            users
        });
    } catch (err) {
        console.error('Error loading Create PO form:', err);
        return res.status(500).send('Database error');
    }
});

// =====================================
// 3. CREATE PO - SAVE
// =====================================

router.post('/add', async (req, res) => {
    const po_id = String(req.body.po_id || '').trim();
    const quotation_id = String(req.body.quotation_id || '').trim();
    const created_by = String(req.body.created_by || '').trim();
    const status = String(req.body.status || '').trim();

    if (!po_id || po_id.length > 20) return res.status(400).send('Invalid PO ID.');
    if (!quotation_id) return res.status(400).send('Please select a Quotation.');
    if (!created_by) return res.status(400).send('Please select a User.');
    if (!['draft', 'pending', 'accepted', 'rejected', 'in_progress', 'fulfilled'].includes(status)) {
        return res.status(400).send('Invalid status.');
    }

    try {
        await query(router.connection, `
            INSERT INTO PurchaseOrder (po_id, quotation_id, created_by, status)
            VALUES (?, ?, ?, ?)
        `, [po_id, quotation_id, created_by, status]);

        return sendSuccess(req, res);
    } catch (err) {
        return handleDatabaseError(res, err, 'create');
    }
});

// =====================================
// 4. EDIT PO - DISPLAY FORM
// =====================================

router.get('/edit/:id', async (req, res) => {
    const poId = String(req.params.id || '').trim();

    try {
        const rows = await query(router.connection, `
            SELECT po_id, quotation_id, created_by, status,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
            FROM PurchaseOrder WHERE po_id = ?
        `, [poId]);

        if (rows.length === 0) return res.status(404).send('Purchase Order not found.');

        const po = rows[0];
        po.statusDraft      = po.status === 'draft';
        po.statusPending    = po.status === 'pending';
        po.statusAccepted   = po.status === 'accepted';
        po.statusRejected   = po.status === 'rejected';
        po.statusInProgress = po.status === 'in_progress';
        po.statusFulfilled  = po.status === 'fulfilled';

        const quotations = await query(router.connection, `
            SELECT q.quotation_id, q.rfq_id, q.supplier_id, s.company_name
            FROM Quotation q
            JOIN Supplier s ON q.supplier_id = s.supplier_id
            WHERE q.status = 'accepted'
            ORDER BY q.quotation_id ASC
        `);

        const users = await query(router.connection,
            'SELECT user_id, name FROM `User` WHERE role = \'GC\' ORDER BY name ASC'
        );

        quotations.forEach(q => { q.selected = q.quotation_id === po.quotation_id; });
        users.forEach(u => { u.selected = u.user_id === po.created_by; });

        const poItems = await query(router.connection, `
            SELECT
                poi.po_item_id,
                poi.quotation_item_id,
                poi.quantity,
                poi.agreed_unit_price,
                m.name AS material_name,
                m.unit AS material_unit
            FROM PO_Item poi
            JOIN Quotation_Item qi ON poi.quotation_item_id = qi.quotation_item_id
            JOIN RFQ_Item ri ON qi.rfq_item_id = ri.rfq_item_id
            JOIN Material m ON ri.material_id = m.material_id
            WHERE poi.po_id = ?
        `, [poId]);

        return res.render('purchase_orders/edit', {
            layout: false,
            po,
            poItems,
            quotations,
            users
        });
    } catch (err) {
        console.error('Error loading Edit PO form:', err);
        return res.status(500).send('Database error');
    }
});

// =====================================
// 5. EDIT PO - SAVE
// =====================================

router.post('/edit/:id', async (req, res) => {
    const poId = String(req.params.id || '').trim();
    const status = String(req.body.status || '').trim();

    if (!['draft', 'pending', 'accepted', 'rejected', 'in_progress', 'fulfilled'].includes(status)) {
        return res.status(400).send('Invalid status.');
    }

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        const existing = await query(connection,
            `SELECT po_id FROM PurchaseOrder WHERE po_id = ? FOR UPDATE`,
            [poId]
        );
        if (existing.length === 0) {
            await rollbackTransaction(connection);
            return res.status(404).send('Purchase Order not found.');
        }

        await query(connection,
            `UPDATE PurchaseOrder SET status = ? WHERE po_id = ?`,
            [status, poId]
        );

        await commitTransaction(connection);
        transactionStarted = false;
        return sendSuccess(req, res);
    } catch (err) {
        if (transactionStarted) await rollbackTransaction(connection);
        return handleDatabaseError(res, err, 'update');
    }
});

// =====================================
// 6. DELETE PO
// =====================================

router.delete('/delete/:id', async (req, res) => {
    const poId = String(req.params.id || '').trim();
    if (!poId || poId.length > 20) return res.status(400).send('Invalid PO ID.');

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        const existing = await query(connection,
            `SELECT po_id FROM PurchaseOrder WHERE po_id = ? FOR UPDATE`,
            [poId]
        );
        if (existing.length === 0) {
            await rollbackTransaction(connection);
            return res.status(404).send('Purchase Order not found.');
        }

        await query(connection, `DELETE FROM PO_Item WHERE po_id = ?`, [poId]);
        await query(connection, `DELETE FROM PurchaseOrder WHERE po_id = ?`, [poId]);

        await commitTransaction(connection);
        transactionStarted = false;

        res.set('HX-Redirect', '/purchase_orders/');
        return res.sendStatus(200);
    } catch (err) {
        if (transactionStarted) await rollbackTransaction(connection);
        return handleDatabaseError(res, err, 'delete');
    }
});

module.exports = router;