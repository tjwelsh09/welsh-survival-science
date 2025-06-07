const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const dotenv = require('dotenv');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Connected to MongoDB Atlas');
})
.catch((err) => {
  console.error('❌ MongoDB connection error:', err);
});

// ✅ User Schema
const userSchema = new mongoose.Schema({
  email: String,
  password: String // In production, hash passwords!
});
const User = mongoose.model('User', userSchema);

// ✅ Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET_KEY || 'survival-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2 // 2 hours
  }
}));

// ✅ Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Auth Routes

app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  console.log("📨 Attempting registration:", email);

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      console.log("⚠️ Email already registered:", email);
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = new User({ email, password });
    await newUser.save();
    console.log("✅ New user saved:", email);

    res.json({ message: 'User registered successfully' });
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user._id;
    req.session.email = user.email;

    res.json({ message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/session', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, email: req.session.email });
  } else {
    res.status(401).json({ loggedIn: false });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

// ✅ Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
  if (!req.session.userId) {
    return res.status(403).json({ error: 'User must be logged in to purchase' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Chemistry for Clean Water Curriculum',
              description: 'Includes slides, survival lab, and student PDF',
            },
            unit_amount: 1000,
          },
          quantity: 1,
        },
      ],
      success_url: 'https://welsh-survival-science.onrender.com/success.html',
      cancel_url: 'https://welsh-survival-science.onrender.com/cancel.html',
      metadata: {
        userEmail: req.session.email
      }
    });

    res.json({ id: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
