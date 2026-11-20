const express = require('express'); 
const db = require('mysql2');  
 
const app = express();  
 
const {engine} = require('express-handlebars'); 
app.engine('hbs',engine({ 
    extname:'.hbs', 
    defaultLayout:false, 
    partialsDir:'views' 
})); 
app.set('view engine', 'hbs'); 
app.set('views', './views'); 
 
app.use(express.urlencoded({ extended: true })); 
app.use(express.static("public"));  
app.use(express.static("node_modules/htmx.org/dist")); 
app.use(express.static("node_modules/bootstrap/dist/css")); 
app.use(express.static("node_modules/bootstrap/dist/js")); 
app.use(express.static("node_modules/bootstrap-icons/font")); 
const configs = require('./config'); 
const connection = db.createConnection(configs.db); 
 
connection.connect( (err) => { 
  if(err) { 
    console.log("Error connecting to database: ", err); 
    process.exit(); 
  } 
  else { 
    console.log("Connected to database"); 
  } 
}); 
 
app.get('/', (req, res) => { 
      if( req.get("HX-Request") ) { 
    res.send( 
      '<div class="text-center">' + 
      '<i class="bi bi-cup-hot" style="font-size: 50vh;"></i>' + 
      '</div>' 
    ); 
  } 
  else { 
  res.render('index', { 
    title: 'Welcome to McDonald e-management',     
  }); 
  }
});

app.get(/.*/, (req, res, next) => { 
  if( req.get("HX-Request") ) { 
    next();  
  } 
  else { 
    res.render('index', { 
      title: 'Welcome to McDonald e-management',     
      where: req.url 
    });  
  } 
});

const suppliers = require('./routes/suppliers');
suppliers.connection = connection;
app.use('/suppliers', suppliers);

app.listen(80, function () { 
  console.log('Web server listening on port 80!'); 
});