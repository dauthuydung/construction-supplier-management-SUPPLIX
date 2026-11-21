// =====================================
// SUPPLIX - RFQ MANAGEMENT
// =====================================

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Database connection assigned from app.js
router.connection = null;


// =====================================
// HELPER FUNCTIONS
// =====================================

// Convert submitted form values into arrays
function toArray(value) {
    if (value === undefined || value === null) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}


// Validate date format and actual calendar date
function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const [year, month, day] = value.split('-').map(Number);

    if (year < 1000 || year > 9999) {
        return false;
    }

    const date = new Date(Date.UTC(year, month - 1, day));

    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
}


// Validate RFQ information and materials
function validateRFQ(body, rfqIdOverride = null) {
    const rfq_id = rfqIdOverride !== null
        ? String(rfqIdOverride).trim()
        : String(body.rfq_id || '').trim();

    const project_id = String(body.project_id || '').trim();
    const created_by = String(body.created_by || '').trim();
    const deadline = String(body.deadline || '').trim();
    const status = String(body.status || '').trim();

    if (
        !rfq_id ||
        rfq_id.length > 20 ||
        !project_id ||
        project_id.length > 20 ||
        !created_by ||
        created_by.length > 20 ||
        !isValidDate(deadline) ||
        !['draft', 'open', 'closed'].includes(status)
    ) {
        return {
            error: 'Invalid RFQ information. Please check the form.'
        };
    }

    const materialIds = toArray(
        body['material_id[]'] ?? body.material_id
    );

    const quantities = toArray(
        body['quantity[]'] ?? body.quantity
    );

    const requiredDates = toArray(
        body['required_date[]'] ?? body.required_date
    );

    if (
        materialIds.length === 0 ||
        materialIds.length !== quantities.length ||
        materialIds.length !== requiredDates.length
    ) {
        return {
            error: 'Please select at least one material.'
        };
    }

    const items = [];
    const selectedMaterials = new Set();

    for (let i = 0; i < materialIds.length; i++) {
        const material_id = String(materialIds[i] || '').trim();
        const quantity = String(quantities[i] || '').trim();
        const required_date = String(requiredDates[i] || '').trim();

        // Allow integers or up to 4 decimal places
        const validQuantity = /^\d+(\.\d{1,4})?$/.test(quantity);

        if (
            !material_id ||
            material_id.length > 20 ||
            !validQuantity ||
            !Number.isFinite(Number(quantity)) ||
            Number(quantity) <= 0 ||
            Number(quantity) >= 100000000000000 ||
            (
                required_date !== '' &&
                !isValidDate(required_date)
            )
        ) {
            return {
                error:
                    'Invalid material information at row ' +
                    (i + 1) + '.'
            };
        }

        if (selectedMaterials.has(material_id)) {
            return {
                error: 'Duplicate materials are not allowed in one RFQ.'
            };
        }

        selectedMaterials.add(material_id);

        items.push({
            material_id,
            quantity,
            required_date: required_date || null
        });
    }

    return {
        rfq_id,
        project_id,
        created_by,
        deadline,
        status,
        items
    };
}


// Convert MySQL callback into Promise
function query(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }

            resolve(rows);
        });
    });
}


// Start database transaction
function beginTransaction(connection) {
    return new Promise((resolve, reject) => {
        connection.beginTransaction(err => {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}


// Commit database transaction
function commitTransaction(connection) {
    return new Promise((resolve, reject) => {
        connection.commit(err => {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    });
}


// Roll back database transaction
function rollbackTransaction(connection) {
    return new Promise(resolve => {
        connection.rollback(err => {
            if (err) {
                console.error('Rollback error:', err);
            }

            resolve();
        });
    });
}


// Generate unique RFQ Item ID
function generateItemId() {
    return 'RI_' + crypto.randomBytes(8).toString('hex');
}


// Handle database errors
function handleDatabaseError(res, err, action) {
    console.error('RFQ ' + action + ' error:', err);

    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).send(
            'RFQ ID or another unique record already exists.'
        );
    }

    if (
        err.code === 'ER_NO_REFERENCED_ROW_2' ||
        err.code === 'ER_NO_REFERENCED_ROW'
    ) {
        return res.status(400).send(
            'Invalid project, user, or material selection.'
        );
    }

    if (
        err.code === 'ER_ROW_IS_REFERENCED_2' ||
        err.code === 'ER_ROW_IS_REFERENCED'
    ) {
        return res.status(409).send(
            'This record is referenced by other records and cannot be removed.'
        );
    }

    return res.status(500).send(
        'Unable to ' + action + ' RFQ. Please try again.'
    );
}


// Redirect after successful Create or Edit
function sendSuccess(req, res) {
    if (req.get('HX-Request')) {
        res.set('HX-Redirect', '/rfqs/');
        return res.sendStatus(200);
    }

    return res.redirect('/rfqs/');
}


// =====================================
// 1. RFQ LIST + SEARCH
// =====================================

router.get('/', async (req, res) => {
    const search = String(req.query.search || '').trim();

    // Use a normal JavaScript string for the User table
    // to avoid escaping SQL backticks.
    let sql = `
        SELECT
            r.rfq_id,
            r.project_id,
            p.name AS project_name,
            r.created_by,
            u.name AS created_by_name,
            DATE_FORMAT(r.deadline, '%Y-%m-%d') AS deadline,
            r.status,
            DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i') AS created_at
        FROM RFQ r
        LEFT JOIN Project p
            ON r.project_id = p.project_id
        LEFT JOIN ` + '`User`' + ` u
            ON r.created_by = u.user_id
    `;

    const params = [];

    if (search !== '') {
        sql += `
            WHERE r.rfq_id LIKE ?
               OR r.project_id LIKE ?
               OR p.name LIKE ?
        `;

        params.push(
            '%' + search + '%',
            '%' + search + '%',
            '%' + search + '%'
        );
    }

    sql += `
        ORDER BY r.created_at DESC, r.rfq_id ASC
        LIMIT 100
    `;

    try {
        const rfqs = await query(
            router.connection,
            sql,
            params
        );

        return res.render('rfqs/index', {
            layout: false,
            rfqs,
            search
        });

    } catch (err) {
        console.error('Error loading RFQs:', err);
        return res.status(500).send('Database error');
    }
});


// =====================================
// 2. LOAD FORM OPTIONS
// =====================================

async function loadFormOptions(
    connection,
    includeInactive = false
) {
    const sqlProjects = includeInactive
        ? `
            SELECT project_id, name
            FROM Project
            ORDER BY name ASC
        `
        : `
            SELECT project_id, name
            FROM Project
            WHERE status = 'active'
            ORDER BY name ASC
        `;

    const sqlUsers = [
        'SELECT user_id, name',
        'FROM `User`',
        "WHERE role = 'GC'",
        'ORDER BY name ASC'
    ].join(' ');

    const sqlMaterials = `
        SELECT
            material_id,
            name,
            category,
            unit,
            specification
        FROM Material
        ORDER BY name ASC
    `;

    const projects = await query(connection, sqlProjects);
    const users = await query(connection, sqlUsers);
    const materials = await query(connection, sqlMaterials);

    return {
        projects,
        users,
        materials
    };
}


// =====================================
// 3. CREATE RFQ - DISPLAY FORM
// =====================================

router.get('/add', async (req, res) => {
    try {
        const options = await loadFormOptions(
            router.connection
        );

        return res.render('rfqs/add', {
            layout: false,
            projects: options.projects,
            users: options.users,
            materials: options.materials
        });

    } catch (err) {
        console.error('Error loading Create RFQ form:', err);
        return res.status(500).send('Database error');
    }
});


// =====================================
// 4. CREATE RFQ - SAVE TO DATABASE
// =====================================

router.post('/add', async (req, res) => {
    const data = validateRFQ(req.body);

    if (data.error) {
        return res.status(400).send(data.error);
    }

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        // Insert RFQ header
        const sqlRFQ = `
            INSERT INTO RFQ
            (
                rfq_id,
                project_id,
                created_by,
                deadline,
                status
            )
            VALUES (?, ?, ?, ?, ?)
        `;

        await query(connection, sqlRFQ, [
            data.rfq_id,
            data.project_id,
            data.created_by,
            data.deadline,
            data.status
        ]);

        // Insert RFQ materials
        const sqlItem = `
            INSERT INTO RFQ_Item
            (
                rfq_item_id,
                rfq_id,
                material_id,
                quantity,
                required_date
            )
            VALUES (?, ?, ?, ?, ?)
        `;

        for (const item of data.items) {
            await query(connection, sqlItem, [
                generateItemId(),
                data.rfq_id,
                item.material_id,
                item.quantity,
                item.required_date
            ]);
        }

        await commitTransaction(connection);
        transactionStarted = false;

        return sendSuccess(req, res);

    } catch (err) {
        if (transactionStarted) {
            await rollbackTransaction(connection);
        }

        return handleDatabaseError(res, err, 'create');
    }
});


// =====================================
// 5. EDIT RFQ - DISPLAY FORM
// =====================================

router.get('/edit/:id', async (req, res) => {
    const rfqId = String(req.params.id || '').trim();

    try {
        // Load RFQ header
        const sqlRFQ = `
            SELECT
                rfq_id,
                project_id,
                created_by,
                DATE_FORMAT(deadline, '%Y-%m-%d') AS deadline,
                status
            FROM RFQ
            WHERE rfq_id = ?
        `;

        const rows = await query(
            router.connection,
            sqlRFQ,
            [rfqId]
        );

        if (rows.length === 0) {
            return res.status(404).send('RFQ not found.');
        }

        const rfq = rows[0];

        rfq.isDraft = rfq.status === 'draft';
        rfq.isOpen = rfq.status === 'open';
        rfq.isClosed = rfq.status === 'closed';

        // Load existing RFQ materials
        const sqlItems = `
            SELECT
                rfq_item_id,
                material_id,
                quantity,
                DATE_FORMAT(required_date, '%Y-%m-%d') AS required_date
            FROM RFQ_Item
            WHERE rfq_id = ?
            ORDER BY rfq_item_id ASC
        `;

        const items = await query(
            router.connection,
            sqlItems,
            [rfqId]
        );

        // Load dropdown options
        const options = await loadFormOptions(
            router.connection,
            true
        );

        // Include original creator if no longer GC
        if (
            !options.users.some(
                user => user.user_id === rfq.created_by
            )
        ) {
            const originalUser = await query(
                router.connection,
                'SELECT user_id, name FROM `User` WHERE user_id = ?',
                [rfq.created_by]
            );

            if (originalUser.length > 0) {
                options.users.push(originalUser[0]);
            }
        }

        // Mark selected project
        options.projects.forEach(project => {
            project.selected =
                project.project_id === rfq.project_id;
        });

        // Mark selected user
        options.users.forEach(user => {
            user.selected =
                user.user_id === rfq.created_by;
        });

        // Mark selected material for each item
        items.forEach(item => {
            item.materialOptions = options.materials.map(
                material => ({
                    material_id: material.material_id,
                    name: material.name,
                    unit: material.unit,
                    selected:
                        material.material_id === item.material_id
                })
            );
        });

        return res.render('rfqs/edit', {
            layout: false,

            rfq,

            // Support both template naming conventions
            items,
            rfqItems: items,

            projects: options.projects,
            users: options.users,
            materials: options.materials,

            statusDraft: rfq.isDraft,
            statusOpen: rfq.isOpen,
            statusClosed: rfq.isClosed
        });

    } catch (err) {
        console.error('Error loading Edit RFQ form:', err);
        return res.status(500).send('Database error');
    }
});


// =====================================
// 6. EDIT RFQ - SAVE CHANGES
// =====================================

router.post('/edit/:id', async (req, res) => {
    const rfqId = String(req.params.id || '').trim();

    const data = validateRFQ(
        req.body,
        rfqId
    );

    if (data.error) {
        return res.status(400).send(data.error);
    }

    const connection = router.connection;
    let transactionStarted = false;

    try {
        await beginTransaction(connection);
        transactionStarted = true;

        // Lock RFQ while updating
        const existingRFQ = await query(
            connection,
            `
                SELECT rfq_id
                FROM RFQ
                WHERE rfq_id = ?
                FOR UPDATE
            `,
            [rfqId]
        );

        if (existingRFQ.length === 0) {
            await rollbackTransaction(connection);
            transactionStarted = false;

            return res.status(404).send('RFQ not found.');
        }

        // Update RFQ header
        const sqlUpdate = `
            UPDATE RFQ
            SET
                project_id = ?,
                created_by = ?,
                deadline = ?,
                status = ?
            WHERE rfq_id = ?
        `;

        await query(connection, sqlUpdate, [
            data.project_id,
            data.created_by,
            data.deadline,
            data.status,
            rfqId
        ]);

        // Load and lock existing RFQ items
        const existingItems = await query(
            connection,
            `
                SELECT
                    rfq_item_id,
                    material_id,
                    quantity,
                    required_date
                FROM RFQ_Item
                WHERE rfq_id = ?
                FOR UPDATE
            `,
            [rfqId]
        );

        // Map existing items by material ID
        const existingByMaterial = new Map();

        for (const item of existingItems) {
            existingByMaterial.set(
                item.material_id,
                item
            );
        }

        // Collect submitted material IDs
        const submittedMaterialIds = new Set(
            data.items.map(item => item.material_id)
        );

        // Update existing items or insert new items
        for (const item of data.items) {
            const existing = existingByMaterial.get(
                item.material_id
            );

            if (existing) {
                // Preserve original rfq_item_id
                const sqlUpdateItem = `
                    UPDATE RFQ_Item
                    SET
                        quantity = ?,
                        required_date = ?
                    WHERE rfq_item_id = ?
                      AND rfq_id = ?
                `;

                await query(
                    connection,
                    sqlUpdateItem,
                    [
                        item.quantity,
                        item.required_date,
                        existing.rfq_item_id,
                        rfqId
                    ]
                );

            } else {
                // Insert newly selected material
                const sqlInsertItem = `
                    INSERT INTO RFQ_Item
                    (
                        rfq_item_id,
                        rfq_id,
                        material_id,
                        quantity,
                        required_date
                    )
                    VALUES (?, ?, ?, ?, ?)
                `;

                await query(
                    connection,
                    sqlInsertItem,
                    [
                        generateItemId(),
                        rfqId,
                        item.material_id,
                        item.quantity,
                        item.required_date
                    ]
                );
            }
        }

        // Delete removed materials
        for (const existing of existingItems) {
            if (
                !submittedMaterialIds.has(
                    existing.material_id
                )
            ) {
                await query(
                    connection,
                    `
                        DELETE FROM RFQ_Item
                        WHERE rfq_item_id = ?
                          AND rfq_id = ?
                    `,
                    [
                        existing.rfq_item_id,
                        rfqId
                    ]
                );
            }
        }

        // Commit changes
        await commitTransaction(connection);
        transactionStarted = false;

        return sendSuccess(req, res);

    } catch (err) {
        if (transactionStarted) {
            await rollbackTransaction(connection);
        }

        return handleDatabaseError(res, err, 'update');
    }
});

// =====================================
// 7. DELETE RFQ
// =====================================

router.delete('/delete/:id', async (req, res) => {

    const rfqId = String(req.params.id || '').trim();

    if (!rfqId || rfqId.length > 20) {
        return res.status(400).send('Invalid RFQ ID.');
    }

    const connection = router.connection;
    let transactionStarted = false;

    try {

        await beginTransaction(connection);
        transactionStarted = true;

        // Check and lock RFQ
        const existingRFQ = await query(
            connection,
            `
                SELECT rfq_id
                FROM RFQ
                WHERE rfq_id = ?
                FOR UPDATE
            `,
            [rfqId]
        );

        if (existingRFQ.length === 0) {

            await rollbackTransaction(connection);
            transactionStarted = false;

            return res.status(404).send('RFQ not found.');
        }

        // Delete RFQ materials first
        await query(
            connection,
            `
                DELETE FROM RFQ_Item
                WHERE rfq_id = ?
            `,
            [rfqId]
        );

        // Delete RFQ header
        await query(
            connection,
            `
                DELETE FROM RFQ
                WHERE rfq_id = ?
            `,
            [rfqId]
        );

        // Commit transaction
        await commitTransaction(connection);
        transactionStarted = false;

        // Reload RFQ List
        res.set('HX-Redirect', '/rfqs/');
        return res.sendStatus(200);

    } catch (err) {

        if (transactionStarted) {
            await rollbackTransaction(connection);
        }

        return handleDatabaseError(res, err, 'delete');
    }
});
// =====================================
// 8. EXPORT ROUTER
// =====================================

module.exports = router;