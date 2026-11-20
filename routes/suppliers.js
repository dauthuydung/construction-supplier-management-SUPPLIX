
const express = require('express');
const router = express.Router();


router.get('/', (req, res) => {

    const search = (req.query.search || '').trim();

    const SQL = `
        SELECT supplier_id, company_name, description,
               location, phone, email, is_verified
        FROM Supplier
        WHERE company_name LIKE ?
        ORDER BY company_name
        LIMIT 100
    `;

    const values = [`%${search}%`];

    router.connection.query(SQL, values, (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err.message);
        }

        res.render('suppliers/index', {
            suppliers: data,
            search: search
        });
    });
});


const crypto = require('crypto');

// Display Add Supplier form
router.get('/add', (req, res) => {
    res.render('suppliers/add');
});

// Save new supplier to MySQL
router.post('/add', (req, res) => {
    const {
        company_name,
        description,
        location,
        phone,
        email
    } = req.body;

    if (!company_name || !company_name.trim()) {
        return res.status(400).send('Company name is required.');
    }

    const supplier_id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);

    const SQL = `
        INSERT INTO Supplier
        (supplier_id, company_name, description,
         location, phone, email, is_verified)
        VALUES (?, ?, ?, ?, ?, ?, 0)
    `;

    const values = [
        supplier_id,
        company_name.trim(),
        description || null,
        location || null,
        phone || null,
        email || null
    ];

    router.connection.query(SQL, values, (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err.message);
        }

        res.redirect('/suppliers');
    });
});


/* =====================================
   EDIT SUPPLIER - DISPLAY FORM
===================================== */

router.get('/edit/:id', (req, res) => {

    const supplierId = req.params.id;

    const SQL = `
        SELECT supplier_id, company_name, description,
               location, phone, email, is_verified
        FROM Supplier
        WHERE supplier_id = ?
    `;

    router.connection.query(SQL, [supplierId], (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err.message);
        }

        if (data.length === 0) {
            return res.status(404).send('Supplier not found.');
        }

        res.render('suppliers/edit', {
            supplier: data[0]
        });
    });
});


/* =====================================
   EDIT SUPPLIER - SAVE CHANGES
===================================== */

router.post('/edit/:id', (req, res) => {

    const supplierId = req.params.id;

    const {
        company_name,
        description,
        location,
        phone,
        email,
        is_verified
    } = req.body;

    if (!company_name || !company_name.trim()) {
        return res.status(400).send('Company name is required.');
    }

    const SQL = `
        UPDATE Supplier
        SET company_name = ?,
            description = ?,
            location = ?,
            phone = ?,
            email = ?,
            is_verified = ?
        WHERE supplier_id = ?
    `;

    const values = [
        company_name.trim(),
        description || null,
        location || null,
        phone || null,
        email || null,
        is_verified === '1' ? 1 : 0,
        supplierId
    ];

    router.connection.query(SQL, values, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err.message);
        }

        if (result.affectedRows === 0) {
            return res.status(404).send('Supplier not found.');
        }

        res.redirect('/suppliers?search=' +
            encodeURIComponent(company_name.trim()));
    });
});


/* =====================================
   DELETE SUPPLIER
===================================== */

router.post('/delete/:id', (req, res) => {

    const supplierId = req.params.id;

    const SQL = `
        DELETE FROM Supplier
        WHERE supplier_id = ?
    `;

    router.connection.query(SQL, [supplierId], (err, result) => {

        if (err) {
            console.error(err);

            if (err.code === 'ER_ROW_IS_REFERENCED_2' ||
                err.code === 'ER_ROW_IS_REFERENCED') {
                return res.status(409).send(
                    'Cannot delete this supplier because it is linked to other records.'
                );
            }

            return res.status(500).send(
                'Database error: ' + err.message
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).send(
                'Supplier not found.'
            );
        }

        res.redirect('/suppliers');
    });
});

module.exports = router;