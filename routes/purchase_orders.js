// =====================================
// SUPPLIX - PURCHASE ORDER MANAGEMENT
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
    console.error('PurchaseOrder ' + action + ' error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).send('Purchase Order ID already exists.');
    }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_NO_REFERENCED_ROW') {
        return res.status(400).send('Invalid Project, Supplier, or User selection.');
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

function toArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

function generateItemId() {
    return 'PI_' + crypto.randomBytes(8).toString('hex');
}

function validatePurchaseOrder(body, poIdOverride = null) {
    const po_id = poIdOverride !== null
        ? String(poIdOverride).trim()
        : String(body.po_id || '').trim();

    const project_id     = String(body.project_id || '').trim();
    const quotation_id   = String(body.quotation_id || '').trim();
    const supplier_id    = String(body.supplier_id || '').trim();
    const user_id        = String(body.user_id || '').trim();
    const status         = String(body.status || '').trim();
    const total_amount   = String(body.total_amount || '').trim();
    const transaction_date = String(body.transaction_date || '').trim();
    const notes          = String(body.notes || '').trim();

    if (!po_id || po_id.length > 20) return { error: 'Invalid Purchase Order ID.' };
    if (!project_id || project_id.length > 20) return { error: 'Please select a Project.' };
    if (!supplier_id || supplier_id.length > 20) return { error: 'Please select a Supplier.' };
    if (!user_id || user_id.length > 20) return { error: 'Please select a User.' };
    if (!['pending', 'accepted', 'in_progress', 'fulfilled'].includes(status)) return { error: 'Invalid status.' };
    if (!/^\d+(\.\d{1,2})?$/.test(total_amount) || Number(total_amount) < 0) return { error: 'Invalid total amount.' };
    if (transaction_date !== '' && !isValidDate(transaction_date)) return { error: 'Invalid transaction date.' };

    const materialIds  = toArray(body['material_id[]']  ?? body.material_id);
    const quantities   = toArray(body['quantity[]']     ?? body.quantity);
    const unitPrices   = toArray(body['unit_price[]']   ?? body.unit_price);
    const discounts    = toArray(body['discount_rate[]'] ?? body.discount_rate);
    const subtotals    = toArray(body['subtotal[]']     ?? body.subtotal);

    if (materialIds.length === 0) return { error: 'Please add at least one item.' };

    const items = [];
    for (let i = 0; i < materialIds.length; i++) {
        const material_id  = String(materialIds[i] || '').trim();
        const qty          = String(quantities[i] || '').trim();
        const up           = String(unitPrices[i] || '').trim();
        const disc         = String(discounts[i] || '0').trim();
        const sub          = String(subtotals[i] || '').trim();

        if (!material_id) return { error: 'Invalid material at row ' + (i + 1) };
        if (!/^\d+(\.\d{1,2})?$/.test(qty) || Number(qty) <= 0) return { error: 'Invalid quantity at row ' + (i + 1) };
        if (!/^\d+(\.\d{1,2})?$/.test(up)  || Number(up) < 0)   return { error: 'Invalid unit price at row ' + (i + 1) };
        if (!/^\d+(\.\d{1,2})?$/.test(disc) || Number(disc) < 0 || Number(disc) > 100) return { error: 'Invalid discount at row ' + (i + 1) };
        if (!/^\d+(\.\d{1,2})?$/.test(sub) || Number(sub) < 0)  return { error: 'Invalid subtotal at row ' + (i + 1) };

        items.push({ material_id, quantity: qty, unit_price: up, discount_rate: disc, subtotal: sub });
    }

    return {
        po_id,
        project_id,
        quotation_id: quotation_id || null,
        supplier_id,
        user_id,
        status,
        total_amount,
        transaction_date: transaction_date || null,
        notes: notes || null,
        items
    };
}

// =====================================
// 1. PURCHASE ORDER LIST + SEARCH
// =====================================

router.get('/', async (req, res) => {
    const search = String(req.query.search || '').trim();

    let sql = `
        SELECT
            po.po_id,
            po.project_id,
            p.name AS project_name,
            po.supplier_id,
            s.name AS supplier_name,
            po.quotation_id,
            po.user_id,
            po.status,
            po.total_amount,
            DATE_FORMAT(po.transaction_date, '%Y-%m-%d') AS transaction_date,
            DATE_FORMAT(po.created_at, '%Y-%m-%d %H:%i') AS created_at
        FROM PurchaseOrder po
        LEFT JOIN Project p ON po.project_id = p.project_id
        LEFT JOIN Supplier s ON po.supplier_id = s.supplier_id
    `;

    const params = [];
    if (search !== '') {
        sql += `
            WHERE po.po_id LIKE ?
               OR po.project_id LIKE ?
               OR s.name LIKE ?
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
        const projects   = await query(router.connection, `SELECT project_id, name FROM Project ORDER BY name ASC`);
        const suppliers  = await query(router.connection, `SELECT supplier_id, name FROM Supplier ORDER BY name ASC`);
        const quotations = await query(router.connection, `SELECT quotation_id FROM Quotation ORDER BY quotation_id ASC`);
        const users      = await query(router.connection, 'SELECT user_id, name FROM `User` ORDER BY name ASC');
        const materials  = await query(router.connection, `SELECT material_id, name, unit FROM Material ORDER BY name ASC`);

        return res.render('purchase_orders/add', {
            layout: false,
            projects,
            suppliers,
            quotations,
            users,
            materials
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
    const data = validatePurchaseOrder(req.body);
    if (data.error) return res.status(400).send(data.error);

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        await query(connection, `
            INSERT INTO PurchaseOrder
            (po_id, project_id, quotation_id, supplier_id, user_id, status, total_amount, transaction_date, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            data.po_id, data.project_id, data.quotation_id,
            data.supplier_id, data.user_id, data.status,
            data.total_amount, data.transaction_date, data.notes
        ]);

        for (const item of data.items) {
            await query(connection, `
                INSERT INTO PO_Item (po_item_id, po_id, material_id, quantity, unit_price, discount_rate, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [generateItemId(), data.po_id, item.material_id, item.quantity, item.unit_price, item.discount_rate, item.subtotal]);
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
// 4. EDIT PO - DISPLAY FORM
// =====================================

router.get('/edit/:id', async (req, res) => {
    const poId = String(req.params.id || '').trim();

    try {
        const rows = await query(router.connection, `
            SELECT
                po_id, project_id, quotation_id, supplier_id, user_id, status,
                total_amount,
                DATE_FORMAT(transaction_date, '%Y-%m-%d') AS transaction_date,
                notes
            FROM PurchaseOrder WHERE po_id = ?
        `, [poId]);

        if (rows.length === 0) return res.status(404).send('Purchase Order not found.');

        const po = rows[0];
        po.statusPending    = po.status === 'pending';
        po.statusAccepted   = po.status === 'accepted';
        po.statusInProgress = po.status === 'in_progress';
        po.statusFulfilled  = po.status === 'fulfilled';

        const items = await query(router.connection, `
            SELECT po_item_id, material_id, quantity, unit_price, discount_rate, subtotal
            FROM PO_Item WHERE po_id = ? ORDER BY po_item_id ASC
        `, [poId]);

        const projects   = await query(router.connection, `SELECT project_id, name FROM Project ORDER BY name ASC`);
        const suppliers  = await query(router.connection, `SELECT supplier_id, name FROM Supplier ORDER BY name ASC`);
        const quotations = await query(router.connection, `SELECT quotation_id FROM Quotation ORDER BY quotation_id ASC`);
        const users      = await query(router.connection, 'SELECT user_id, name FROM `User` ORDER BY name ASC');
        const materials  = await query(router.connection, `SELECT material_id, name, unit FROM Material ORDER BY name ASC`);

        projects.forEach(p  => { p.selected  = p.project_id   === po.project_id; });
        suppliers.forEach(s => { s.selected  = s.supplier_id  === po.supplier_id; });
        quotations.forEach(q => { q.selected = q.quotation_id === po.quotation_id; });
        users.forEach(u     => { u.selected  = u.user_id      === po.user_id; });

        items.forEach(item => {
            item.materialOptions = materials.map(m => ({
                material_id: m.material_id,
                name: m.name,
                unit: m.unit,
                selected: m.material_id === item.material_id
            }));
        });

        return res.render('purchase_orders/edit', {
            layout: false,
            po, items,
            projects, suppliers, quotations, users, materials
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
    const data = validatePurchaseOrder(req.body, poId);
    if (data.error) return res.status(400).send(data.error);

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

        await query(connection, `
            UPDATE PurchaseOrder
            SET project_id = ?, quotation_id = ?, supplier_id = ?, user_id = ?,
                status = ?, total_amount = ?, transaction_date = ?, notes = ?
            WHERE po_id = ?
        `, [
            data.project_id, data.quotation_id, data.supplier_id, data.user_id,
            data.status, data.total_amount, data.transaction_date, data.notes,
            poId
        ]);

        await query(connection, `DELETE FROM PO_Item WHERE po_id = ?`, [poId]);

        for (const item of data.items) {
            await query(connection, `
                INSERT INTO PO_Item (po_item_id, po_id, material_id, quantity, unit_price, discount_rate, subtotal)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [generateItemId(), poId, item.material_id, item.quantity, item.unit_price, item.discount_rate, item.subtotal]);
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