// =====================================================
// SMART RETAIL BACKEND API
// Complete REST API for E-commerce Analytics
// =====================================================

const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cron       = require('node-cron');

const app  = express();
const PORT = 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// =====================================================
// EMAIL CONFIGURATION — update with your Gmail
// =====================================================
// SETUP: Go to Google Account → Security → App Passwords
// Generate a 16-char app password and paste below.

const EMAIL_USER = 'your_gmail@gmail.com';   // ← YOUR Gmail (sender)
const EMAIL_PASS = 'your_app_password_here';  // ← 16-char App Password

// Dynamic — automatically set to whoever logs in. No hardcoding needed.
let OWNER_EMAIL = '';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

async function sendEmail(to, subject, htmlBody) {
  try {
    await transporter.sendMail({
      from: `"Smart Retail 🤖" <${EMAIL_USER}>`,
      to, subject,
      html: htmlBody
    });
    console.log(`📧 Email sent → ${to} | ${subject}`);
    return true;
  } catch (err) {
    console.error('❌ Email failed:', err.message);
    return false;
  }
}

// Shared email template wrapper
function emailTemplate(title, color, body) {
  return `
    <div style="font-family:system-ui,sans-serif;background:#0a0e1a;padding:40px 20px;min-height:100vh">
      <div style="max-width:580px;margin:0 auto;background:#0f172a;border-radius:16px;border:1px solid #1e293b;overflow:hidden">
        <div style="background:linear-gradient(135deg,${color});padding:28px 32px">
          <h1 style="color:white;margin:0;font-size:22px">🤖 Smart Retail Automation</h1>
          <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px">${title}</p>
        </div>
        <div style="padding:28px 32px;color:#e5e7eb">${body}</div>
        <div style="padding:16px 32px;border-top:1px solid #1e293b;font-size:12px;color:#475569">
          Smart Retail Analytics · Automated Alert · ${new Date().toLocaleString()}
        </div>
      </div>
    </div>`;
}

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors()); // Enable pre-flight for all routes
app.use(bodyParser.json()); // Parse JSON request bodies
app.use(bodyParser.urlencoded({ extended: true }));

// =====================================================
// DATABASE CONNECTION
// =====================================================

const db = mysql.createConnection({
    host: 'sql12.freesqldatabase.com',
    user: 'sql12817688',
    password: 'nqN7p4kxXJ',
    database: 'sql12817688',
    port: 3306
});

// Connect to database
db.connect((err) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        process.exit(1);
    }
    console.log('✅ Connected to MySQL Database: smart_retail');

    // Create users table if not exists (matching existing schema)
    db.query(`
        CREATE TABLE IF NOT EXISTS users (
            user_id INT PRIMARY KEY AUTO_INCREMENT,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role ENUM('admin', 'manager', 'user') DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) console.error('❌ Users table error:', err.message);
        else console.log('✅ Users table ready');
    });
});

// =====================================================
// AUTH — Register & Login (DB-backed)
// =====================================================

// Check if email exists
app.post('/api/auth/check-email', (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ exists: false });
    db.query('SELECT user_id FROM users WHERE email = ?', [email], (err, rows) => {
        if (err) return res.json({ exists: false });
        res.json({ exists: rows.length > 0 });
    });
});

// Register new user
app.post('/api/auth/register', (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ success: false, message: 'All fields required' });

    const userRole = 'admin'; // All signups are owner/admin

    db.query('SELECT user_id FROM users WHERE email = ?', [email], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: 'DB error' });
        if (rows.length > 0)
            return res.status(409).json({ success: false, message: 'Email already registered' });

        db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, password, userRole],
            (err, result) => {
                if (err) return res.status(500).json({ success: false, message: 'Registration failed' });
                console.log(`✅ New ${userRole} registered: ${email}`);
                res.json({ success: true, message: 'Account created successfully', userId: result.insertId, role: userRole });
            }
        );
    });
});

// Login user
app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ success: false, message: 'Email and password required' });

    db.query('SELECT * FROM users WHERE email = ? AND password = ?',
        [email, password],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: 'DB error' });
            if (rows.length === 0)
                return res.status(401).json({ success: false, message: 'Invalid email or password' });

            const user = rows[0];
            console.log(`✅ ${user.role} logged in: ${email}`);
            OWNER_EMAIL = email;
            res.json({ success: true, name: user.name, email: user.email, id: user.user_id, role: user.role });
        }
    );
});

// =====================================================
// ROOT ENDPOINT
// =====================================================

app.get('/', (req, res) => {
    res.json({
        message: '🚀 Smart Retail API is running!',
        version: '1.0.0',
        endpoints: {
            stats: '/api/stats/all',
            products: '/api/products',
            customers: '/api/customers',
            orders: '/api/orders',
            sales: '/api/sales/daily'
        }
    });
});

// =====================================================
// STATISTICS ENDPOINTS
// =====================================================

// Get all dashboard statistics
app.get('/api/stats/all', (req, res) => {
    const queries = {
        revenue: 'SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE status = "completed"',
        orders: 'SELECT COUNT(*) as total FROM orders',
        completed_orders: 'SELECT COUNT(*) as total FROM orders WHERE status = "completed"',
        pending_orders: 'SELECT COUNT(*) as total FROM orders WHERE status = "pending"',
        customers: 'SELECT COUNT(*) as total FROM customers',
        vip_customers: 'SELECT COUNT(*) as total FROM customers WHERE customer_type = "vip"',
        regular_customers: 'SELECT COUNT(*) as total FROM customers WHERE customer_type = "regular"',
        products: 'SELECT COUNT(*) as total FROM products',
        in_stock: 'SELECT COUNT(*) as total FROM products WHERE stock_quantity >= reorder_level',
        low_stock: 'SELECT COUNT(*) as total FROM products WHERE stock_quantity < reorder_level'
    };

    Promise.all([
        new Promise((resolve, reject) => {
            db.query(queries.revenue, (err, results) => {
                if (err) reject(err);
                else resolve({ revenue: parseFloat(results[0].total) });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.orders, (err, results) => {
                if (err) reject(err);
                else resolve({ orders: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.completed_orders, (err, results) => {
                if (err) reject(err);
                else resolve({ completed_orders: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.pending_orders, (err, results) => {
                if (err) reject(err);
                else resolve({ pending_orders: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.customers, (err, results) => {
                if (err) reject(err);
                else resolve({ customers: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.vip_customers, (err, results) => {
                if (err) reject(err);
                else resolve({ vip_customers: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.regular_customers, (err, results) => {
                if (err) reject(err);
                else resolve({ regular_customers: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.products, (err, results) => {
                if (err) reject(err);
                else resolve({ products: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.in_stock, (err, results) => {
                if (err) reject(err);
                else resolve({ in_stock: results[0].total });
            });
        }),
        new Promise((resolve, reject) => {
            db.query(queries.low_stock, (err, results) => {
                if (err) reject(err);
                else resolve({ low_stock: results[0].total });
            });
        })
    ])
    .then(results => {
        const stats = Object.assign({}, ...results);
        res.json(stats);
    })
    .catch(error => {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    });
});

// Get revenue statistics
app.get('/api/stats/revenue', (req, res) => {
    const query = 'SELECT COALESCE(SUM(total_amount), 0) as total_revenue FROM orders WHERE status = "completed"';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ revenue: parseFloat(results[0].total_revenue) });
    });
});

// =====================================================
// PRODUCTS ENDPOINTS
// =====================================================

// Get all products
app.get('/api/products', (req, res) => {
    const query = 'SELECT * FROM products ORDER BY created_at DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get top selling products  ← MUST be before /api/products/:id
app.get('/api/products/top', (req, res) => {
    const query = `
        SELECT p.product_id, p.name, p.category, p.price,
               SUM(oi.quantity) as units_sold,
               SUM(oi.subtotal) as revenue
        FROM products p
        JOIN order_items oi ON p.product_id = oi.product_id
        JOIN orders o ON oi.order_id = o.order_id
        WHERE o.status = 'completed'
        GROUP BY p.product_id, p.name, p.category, p.price
        ORDER BY revenue DESC
        LIMIT 5
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get low stock products
app.get('/api/products/low-stock', (req, res) => {
    const query = 'SELECT * FROM products WHERE stock_quantity < reorder_level ORDER BY stock_quantity ASC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get single product by ID  ← AFTER all named /products/xxx routes
app.get('/api/products/:id', (req, res) => {
    const query = 'SELECT * FROM products WHERE product_id = ?';
    db.query(query, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(results[0]);
    });
});

// Add new product
app.post('/api/products', (req, res) => {
    const { name, category, price, stock_quantity, description } = req.body;
    const query = 'INSERT INTO products (name, category, price, stock_quantity, description) VALUES (?, ?, ?, ?, ?)';
    
    db.query(query, [name, category, price, stock_quantity, description], (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ 
            message: 'Product created successfully',
            product_id: results.insertId 
        });
    });
});

// Update product by ID
app.put('/api/products/:id', (req, res) => {
    const { name, category, price, stock_quantity, reorder_level, description } = req.body;
    const query = `
        UPDATE products
        SET name = ?, category = ?, price = ?, stock_quantity = ?, reorder_level = ?, description = ?
        WHERE product_id = ?
    `;
    db.query(query, [name, category, price, stock_quantity, reorder_level || 10, description, req.params.id], (err, results) => {
        if (err) {
            console.error('Error updating product:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: 'Product updated successfully' });
    });
});

// Delete product by ID
app.delete('/api/products/:id', (req, res) => {
    const query = 'DELETE FROM products WHERE product_id = ?';
    db.query(query, [req.params.id], (err, results) => {
        if (err) {
            console.error('Error deleting product:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ message: 'Product deleted successfully' });
    });
});

// =====================================================
// CUSTOMERS ENDPOINTS
// =====================================================

// Get all customers
app.get('/api/customers', (req, res) => {
    const query = 'SELECT * FROM customers ORDER BY created_at DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get top customers by spending
app.get('/api/customers/top', (req, res) => {
    const query = 'SELECT * FROM customers ORDER BY total_spent DESC LIMIT 10';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// =====================================================
// ORDERS ENDPOINTS
// =====================================================

// Get all orders with customer details
app.get('/api/orders', (req, res) => {
    const query = `
        SELECT o.*, c.name as customer_name, c.email as customer_email
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        ORDER BY o.order_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get recent orders — sorted by order_id ascending (1,2,3...)
app.get('/api/orders/recent', (req, res) => {
    const query = `
        SELECT o.*, c.name as customer_name
        FROM orders o
        JOIN customers c ON o.customer_id = c.customer_id
        ORDER BY o.order_id ASC
        LIMIT 10
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Update order status
app.patch('/api/orders/:id/status', (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'shipped', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    const query = 'UPDATE orders SET status = ? WHERE order_id = ?';
    db.query(query, [status, req.params.id], (err, results) => {
        if (err) {
            console.error('Error updating order status:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.json({ message: 'Order status updated', status });
    });
});

// Create new order
app.post('/api/orders', (req, res) => {
    const { customer_id, total_amount, status, payment_method, payment_status } = req.body;
    const query = 'INSERT INTO orders (customer_id, total_amount, status, payment_method, payment_status) VALUES (?, ?, ?, ?, ?)';
    
    db.query(query, [customer_id, total_amount, status, payment_method, payment_status], (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.status(201).json({ 
            message: 'Order created successfully',
            order_id: results.insertId 
        });
    });
});
// =====================================================
// PLACE ORDER WITH AUTO CUSTOMER CREATION
// =====================================================

app.post('/api/orders/new', (req, res) => {
    const { customer_name, customer_email, customer_phone, payment_method, total_amount } = req.body;

    const findCustomer = 'SELECT customer_id FROM customers WHERE email = ?';
    db.query(findCustomer, [customer_email], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        if (results.length > 0) {
            createOrder(results[0].customer_id, total_amount, payment_method, res);
        } else {
            const insertCustomer = `
                INSERT INTO customers (name, email, phone, customer_type)
                VALUES (?, ?, ?, 'new')
            `;
            db.query(insertCustomer, [customer_name, customer_email, customer_phone], (err2, result2) => {
                if (err2) return res.status(500).json({ error: err2.message });
                createOrder(result2.insertId, total_amount, payment_method, res);
            });
        }
    });
});

function createOrder(customer_id, total_amount, payment_method, res) {
    const query = `
        INSERT INTO orders
        (customer_id, total_amount, status, payment_method, payment_status, order_date)
        VALUES (?, ?, 'pending', ?, 'unpaid', NOW())
    `;
    db.query(query, [customer_id, total_amount, payment_method], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
            success: true,
            order_id: result.insertId,
            message: 'Order placed successfully!'
        });
    });
}

// =====================================================
// SALES ANALYTICS ENDPOINTS
// =====================================================

// Get daily sales (last 7 days) — all orders
app.get('/api/sales/daily', (req, res) => {
    const query = `
        SELECT 
            DATE(order_date) as date,
            COUNT(*) as orders,
            SUM(total_amount) as revenue
        FROM orders
        WHERE order_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        GROUP BY DATE(order_date)
        ORDER BY date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get weekly sales
app.get('/api/sales/weekly', (req, res) => {
    const query = `
        SELECT 
            WEEK(order_date) as week,
            COUNT(*) as orders,
            SUM(total_amount) as revenue
        FROM orders
        WHERE order_date >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
        AND status = 'completed'
        GROUP BY WEEK(order_date)
        ORDER BY week DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get monthly sales
app.get('/api/sales/monthly', (req, res) => {
    const query = `
        SELECT 
            MONTH(order_date) as month,
            YEAR(order_date) as year,
            COUNT(*) as orders,
            SUM(total_amount) as revenue
        FROM orders
        WHERE order_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND status = 'completed'
        GROUP BY YEAR(order_date), MONTH(order_date)
        ORDER BY year DESC, month DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// =====================================================
// ALERTS ENDPOINTS
// =====================================================

// Get all alerts
app.get('/api/alerts', (req, res) => {
    const query = 'SELECT * FROM alerts ORDER BY created_at DESC LIMIT 20';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get unread alerts count
app.get('/api/alerts/count', (req, res) => {
    const query = 'SELECT COUNT(*) as unread FROM alerts WHERE is_read = FALSE';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({ unread: results[0].unread });
    });
});

// =====================================================
// AUTOMATION ENDPOINTS
// =====================================================

// Get automation rules
app.get('/api/automation/rules', (req, res) => {
    const query = 'SELECT * FROM automation_rules ORDER BY created_at DESC';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Check for low stock items
app.get('/api/automation/check-low-stock', (req, res) => {
    const query = 'SELECT * FROM products WHERE stock_quantity < reorder_level';
    
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json({
            low_stock_items: results.length,
            products: results
        });
    });
});

// =====================================================
// DANGER ZONE ENDPOINTS
// =====================================================

// Clear all orders
app.delete('/api/danger/clear-orders', (req, res) => {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_ORDERS') {
        return res.status(400).json({ error: 'Confirmation phrase incorrect' });
    }
    db.query('DELETE FROM order_items', (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM orders', (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            console.log('🗑️ All orders cleared');
            res.json({ success: true, message: 'All orders deleted' });
        });
    });
});

// Clear all customers
app.delete('/api/danger/clear-customers', (req, res) => {
    const { confirm } = req.body;
    if (confirm !== 'DELETE_ALL_CUSTOMERS') {
        return res.status(400).json({ error: 'Confirmation phrase incorrect' });
    }
    // Clear orders first (foreign key), then customers
    db.query('DELETE FROM order_items', () => {
        db.query('DELETE FROM orders', () => {
            db.query('DELETE FROM customers', (err) => {
                if (err) return res.status(500).json({ error: err.message });
                console.log('🗑️ All customers cleared');
                res.json({ success: true, message: 'All customers deleted' });
            });
        });
    });
});

// =====================================================
// NOTIFICATION ENDPOINTS
// =====================================================

// Called on every login — sets who gets the alert emails
app.post('/api/automation/set-owner', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    OWNER_EMAIL = email;
    console.log(`👤 Owner email set to: ${OWNER_EMAIL}`);
    res.json({ success: true, owner_email: OWNER_EMAIL });
});

// Get current owner email (so frontend can display it)
app.get('/api/automation/owner', (req, res) => {
    res.json({ owner_email: OWNER_EMAIL });
});

// New user signup → notify owner by email
app.post('/api/notify/new-signup', async (req, res) => {
    const { new_user_name, new_user_email } = req.body;

    // Use dynamic owner email — whoever logged in last
    const notifyEmail = OWNER_EMAIL;

    if (!notifyEmail) {
        console.warn('⚠️  No owner email set — owner must login first');
        return res.status(400).json({
            sent: false,
            message: 'Owner not logged in yet — no email to notify'
        });
    }

    console.log(`📧 Sending signup notification to owner: ${notifyEmail}`);

    const time = new Date().toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const html = emailTemplate('👤 New User Registered', '#3b82f6,#8b5cf6', `
        <h2 style="color:#3b82f6;margin-top:0">🎉 New User Just Signed Up!</h2>
        <p style="color:#94a3b8;margin-bottom:20px">
            Someone just created an account on your Smart Retail platform.
        </p>
        <div style="background:#0a0e1a;border-radius:12px;padding:20px;border:1px solid #1e293b;margin-bottom:20px">
            <table style="width:100%;border-collapse:collapse">
                <tr>
                    <td style="padding:10px 0;color:#64748b;font-size:13px;width:38%">👤 Name</td>
                    <td style="padding:10px 0;color:#e5e7eb;font-weight:700">${new_user_name || 'Not provided'}</td>
                </tr>
                <tr style="border-top:1px solid #1e293b">
                    <td style="padding:10px 0;color:#64748b;font-size:13px">📧 Email</td>
                    <td style="padding:10px 0;color:#60a5fa;font-weight:700">${new_user_email}</td>
                </tr>
                <tr style="border-top:1px solid #1e293b">
                    <td style="padding:10px 0;color:#64748b;font-size:13px">🕐 Signed Up At</td>
                    <td style="padding:10px 0;color:#e5e7eb">${time}</td>
                </tr>
                <tr style="border-top:1px solid #1e293b">
                    <td style="padding:10px 0;color:#64748b;font-size:13px">🔔 Notified To</td>
                    <td style="padding:10px 0;color:#22c55e">${notifyEmail}</td>
                </tr>
            </table>
        </div>
        <p style="color:#94a3b8;font-size:13px;line-height:1.8">
            This customer has been added to your database automatically.<br>
            View them in the <strong style="color:#3b82f6">Customers</strong> section of your dashboard.
        </p>
    `);

    const sent = await sendEmail(
        notifyEmail,
        `🔔 New Signup — ${new_user_name || new_user_email} just joined Smart Retail`,
        html
    );

    res.json({
        sent,
        notified_to: notifyEmail,
        message: sent
            ? `✅ Email sent to ${notifyEmail}`
            : '❌ Email failed — check Gmail App Password in backend_api.js'
    });
});

// =====================================================
// FORGOT PASSWORD — Send reset email to user
// =====================================================
app.post('/api/notify/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ sent: false, message: 'Email required' });

    // Check if user exists
    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, rows) => {
        if (err || rows.length === 0)
            return res.json({ sent: false, message: 'No account found with this email' });

        const user = rows[0];
        // Generate random 8-char temp password
        const tempPass = Math.random().toString(36).slice(-4).toUpperCase() +
                         Math.random().toString(36).slice(-4).toUpperCase();

        // Update password in DB
        db.query('UPDATE users SET password = ? WHERE email = ?', [tempPass, email], async (err2) => {
            if (err2) return res.json({ sent: false, message: 'Could not reset password' });

            const html = emailTemplate('🔐 Password Reset', '#ef4444,#f59e0b', `
                <h2 style="color:#ef4444;margin-top:0">🔐 Your Temporary Password</h2>
                <p style="color:#94a3b8;margin-bottom:20px">
                    Hi <strong style="color:#e5e7eb">${user.name}</strong>, here is your temporary password:
                </p>
                <div style="background:#0a0e1a;border-radius:12px;padding:24px;border:1px solid #ef4444;margin-bottom:20px;text-align:center">
                    <p style="color:#64748b;font-size:13px;margin-bottom:8px">Your temporary password:</p>
                    <p style="color:#f59e0b;font-size:32px;font-weight:700;letter-spacing:6px">${tempPass}</p>
                    <p style="color:#64748b;font-size:12px;margin-top:12px">⚠️ Please change your password after login in Settings</p>
                </div>
                <p style="color:#64748b;font-size:12px;text-align:center">
                    If you did not request this, please contact your administrator.
                </p>
            `);

            try {
                await transporter.sendMail({
                    from: `"Smart Retail 🤖" <${EMAIL_USER}>`,
                    to: email,
                    subject: '🔐 Your Temporary Password — Smart Retail',
                    html
                });
                console.log(`📧 Temp password sent to: ${email}`);
                res.json({ sent: true });
            } catch (mailErr) {
                console.error('❌ Email error:', mailErr.message);
                // Email failed but password was reset in DB — show temp pass on screen
                res.json({ sent: false, tempPass, message: 'Email failed. Use this temporary password:' });
            }
        });
    });
});

// =====================================================
// CRON JOBS — Scheduled Automation
// =====================================================

// Every hour — check low stock and email if any found
cron.schedule('0 * * * *', () => {
  console.log('⏰ CRON: Running hourly low-stock check...');
  const query = 'SELECT * FROM products WHERE stock_quantity < reorder_level';
  db.query(query, async (err, products) => {
    if (err || products.length === 0) return;
    console.log(`📦 CRON: ${products.length} low-stock items found — sending email`);
    // Reuse the email logic
    fetch(`http://localhost:${PORT}/api/automation/low-stock-alert`, { method: 'POST' })
      .catch(() => {});
  });
});

// Every day at 8:00 AM — send daily sales report
cron.schedule('0 8 * * *', () => {
  console.log('⏰ CRON: Sending daily sales report...');
  fetch(`http://localhost:${PORT}/api/automation/daily-report`, { method: 'POST' })
    .catch(() => {});
});

console.log('✅ Automation cron jobs scheduled (hourly low-stock + daily 8AM report)');

// =====================================================
// ERROR HANDLING
// =====================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        message: `Cannot ${req.method} ${req.path}`,
        availableEndpoints: [
            'GET /',
            'GET /api/stats/all',
            'GET /api/products',
            'GET /api/customers',
            'GET /api/orders',
            'GET /api/sales/daily'
        ]
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        error: 'Internal server error',
        message: err.message 
    });
});

// =====================================================
// START SERVER
// =====================================================

app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('🚀 Smart Retail API Server Running');
    console.log('═══════════════════════════════════════════');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log('');
    console.log('Available Endpoints:');
    console.log('  GET    /api/stats/all         - Dashboard statistics');
    console.log('  GET    /api/products          - All products');
    console.log('  POST   /api/products          - Add product');
    console.log('  PUT    /api/products/:id      - ✅ Update product');
    console.log('  DELETE /api/products/:id      - ✅ Delete product');
    console.log('  GET    /api/customers         - All customers');
    console.log('  GET    /api/orders            - All orders');
    console.log('  GET    /api/sales/daily       - Daily sales data');
    console.log('');
    console.log('✅ v2.0 — Edit & Delete endpoints active');
    console.log('Press Ctrl+C to stop server');
    console.log('═══════════════════════════════════════════');
    console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down server...');
    db.end();
    process.exit(0);
});