
const express = require('express');
const db = require('mysql2');
const { engine } = require('express-handlebars');

const app = express();

// =====================================
// 1. HANDLEBARS CONFIGURATION
// =====================================

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: false,
    partialsDir: 'views'
}));

app.set('view engine', 'hbs');
app.set('views', './views');

// =====================================
// 2. MIDDLEWARE
// =====================================

// Read HTML form data
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static('public'));

app.use(express.static('node_modules/htmx.org/dist'));

app.use(express.static('node_modules/bootstrap/dist/css'));

app.use(express.static('node_modules/bootstrap/dist/js'));

app.use(express.static('node_modules/bootstrap-icons/font'));

// =====================================
// 3. MYSQL DATABASE CONNECTION
// =====================================

const configs = require('./config');

const connection = db.createConnection(configs.db);

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }

    console.log('Connected to database');
});

// =====================================
// 4. HOME PAGE - SUPPLIX DASHBOARD
// =====================================

app.get('/', (req, res) => {

    // HTMX request: load home content
    if (req.get('HX-Request')) {

        return res.send(`
            <div class="text-center py-5">

                <i class="bi bi-building"
                   style="font-size:80px;color:#2563eb;">
                </i>

                <h3 class="mt-3 fw-bold">
                    Welcome to SUPPLIX
                </h3>

                <p class="text-muted">
                    Construction Supplier Management System
                </p>

                <a href="/suppliers/"
                   class="btn btn-primary mt-3">
                    Manage Suppliers
                </a>

                <a href="/materials/"
                   class="btn btn-outline-primary mt-3 ms-2">
                    Manage Materials
                </a>

            </div>
        `);
    }

    // Normal browser request
    res.render('index', {
        title: 'SUPPLIX - Construction Supplier Management System'
    });
});

// =====================================
// 5. PAGE LAYOUT HANDLING
// =====================================

// Normal request: render the main dashboard layout.
// HTMX request: continue to the appropriate router.

app.get(/.*/, (req, res, next) => {

    if (req.get('HX-Request')) {
        return next();
    }

    res.render('index', {
        title: 'SUPPLIX - Construction Supplier Management System',
        where: req.url
    });

});

// =====================================
// 6. SUPPLIER MANAGEMENT ROUTES
// =====================================

const suppliers = require('./routes/suppliers');

suppliers.connection = connection;

app.use('/suppliers', suppliers);

// =====================================
// 7. MATERIAL MANAGEMENT ROUTES
// =====================================

const materials = require('./routes/materials');

materials.connection = connection;

app.use('/materials', materials);

// =====================================
// 8. RFQ MANAGEMENT ROUTES
// =====================================
const rfqs = require('./routes/rfqs');
rfqs.connection = connection;
app.use('/rfqs', rfqs);

// =====================================
// 9. START WEB SERVER
// =====================================

const PORT = 80;

// =====================================
// 9. QUOTATION MANAGEMENT ROUTES
// =====================================

const quotations = require('./routes/quotations');
quotations.connection = connection;
app.use('/quotations', quotations);

// =====================================
// 10. PURCHASE ORDER MANAGEMENT ROUTES
// =====================================

const purchase_orders = require('./routes/purchase_orders');
purchase_orders.connection = connection;
app.use('/purchase_orders', purchase_orders);

app.listen(PORT, () => {
    console.log(`SUPPLIX web server listening on port ${PORT}!`);
});