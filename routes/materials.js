
const express = require('express');
const router = express.Router();

// Database connection from app.js
router.connection = null;

// =====================================
// MATERIAL LIST + SEARCH
// =====================================

router.get('/', (req, res) => {

    // Get search keyword
    const search = (req.query.search || '').trim();

    let sql = `
        SELECT
            material_id,
            name,
            category,
            unit,
            specification
        FROM Material
    `;

    const params = [];

    // Search by Material ID or Material Name
    if (search !== '') {
        sql += `
            WHERE material_id LIKE ?
               OR name LIKE ?
        `;

        params.push(`%${search}%`, `%${search}%`);
    }

    // Sort materials alphabetically
    sql += `
        ORDER BY name ASC
        LIMIT 100
    `;

    router.connection.query(sql, params, (err, materials) => {

        if (err) {
            console.error('Error loading materials:', err);
            return res.status(500).send('Database error');
        }

        res.render('materials/index', {
            layout: false,
            materials: materials,
            search: search
        });
    });
});


// =====================================
// ADD MATERIAL - DISPLAY FORM
// =====================================

router.get('/add', (req, res) => {
    res.render('materials/add', {
        layout: false
    });
});

// =====================================
// ADD MATERIAL - SAVE TO MYSQL
// =====================================

router.post('/add', (req, res) => {

    const material_id = (req.body.material_id || '').trim();
    const name = (req.body.name || '').trim();
    const category = (req.body.category || '').trim();
    const unit = (req.body.unit || '').trim();
    const specification = (req.body.specification || '').trim();

    // Validate required fields
    if (!material_id || !name || !unit) {
        return res.status(400).send(
            '<div class="alert alert-danger">Material ID, Name and Unit are required.</div>'
        );
    }

    if (material_id.length > 20 ||
        category.length > 100 ||
        unit.length > 50) {
        return res.status(400).send(
            '<div class="alert alert-danger">One or more fields exceed the allowed length.</div>'
        );
    }

    const sql = `
        INSERT INTO Material
        (material_id, name, category, unit, specification)
        VALUES (?, ?, ?, ?, ?)
    `;

    const values = [
        material_id,
        name,
        category || null,
        unit,
        specification || null
    ];

    router.connection.query(sql, values, (err) => {

        if (err) {
            console.error('Error adding material:', err);

            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).send(
                    '<div class="alert alert-danger">Material ID already exists.</div>'
                );
            }

            return res.status(500).send(
                '<div class="alert alert-danger">Unable to save material.</div>'
            );
        }

        // Return to material list
        res.set('HX-Location', '/materials/');
        res.redirect(303, '/materials/');
    });
});

// =====================================
// EDIT MATERIAL - DISPLAY FORM
// =====================================

router.get('/edit/:id', (req, res) => {

    const materialId = req.params.id;

    const sql = `
        SELECT material_id, name, category, unit, specification
        FROM Material
        WHERE material_id = ?
    `;

    router.connection.query(sql, [materialId], (err, results) => {

        if (err) {
            console.error('Error loading material:', err);
            return res.status(500).send('Database error');
        }

        if (results.length === 0) {
            return res.status(404).send('Material not found');
        }

        res.render('materials/edit', {
            layout: false,
            material: results[0]
        });
    });
});

// =====================================
// EDIT MATERIAL - UPDATE MYSQL
// =====================================

router.post('/edit/:id', (req, res) => {

    const materialId = req.params.id;
    const name = (req.body.name || '').trim();
    const category = (req.body.category || '').trim();
    const unit = (req.body.unit || '').trim();
    const specification = (req.body.specification || '').trim();

    if (!name || !unit) {
        return res.status(400).send(
            '<div class="alert alert-danger">Material Name and Unit are required.</div>'
        );
    }

    if (category.length > 100 || unit.length > 50) {
        return res.status(400).send(
            '<div class="alert alert-danger">Category or Unit exceeds the allowed length.</div>'
        );
    }

    const sql = `
        UPDATE Material
        SET name = ?,
            category = ?,
            unit = ?,
            specification = ?
        WHERE material_id = ?
    `;

    const values = [
        name,
        category || null,
        unit,
        specification || null,
        materialId
    ];

    router.connection.query(sql, values, (err, result) => {

        if (err) {
            console.error('Error updating material:', err);
            return res.status(500).send(
                '<div class="alert alert-danger">Unable to update material.</div>'
            );
        }

        if (result.affectedRows === 0) {
            return res.status(404).send('Material not found');
        }

        res.set('HX-Location', '/materials/');
        return res.redirect(303, '/materials/');
    });
});


// =====================================
// DELETE MATERIAL
// =====================================

router.post('/delete/:id', (req, res) => {

    const materialId = req.params.id;

    const sql = `
        DELETE FROM Material
        WHERE material_id = ?
    `;

    router.connection.query(sql, [materialId], (err, result) => {

        if (err) {
            console.error('Error deleting material:', err);

            // Material is referenced by another table
            if (err.code === 'ER_ROW_IS_REFERENCED_2') {
                return res.status(409).send(`
                    <div class="alert alert-warning">
                        Cannot delete this material because
                        it is being used by other records.
                    </div>
                `);
            }

            return res.status(500).send(`
                <div class="alert alert-danger">
                    Unable to delete material.
                </div>
            `);
        }

        if (result.affectedRows === 0) {
            return res.status(404).send(`
                <div class="alert alert-warning">
                    Material not found.
                </div>
            `);
        }

        // Reload Materials page after successful deletion
        res.set('HX-Location', '/materials/');
        return res.status(200).send('');
    });
});

module.exports = router;