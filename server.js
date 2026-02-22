const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB (smart_agriculture)'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------
// Rate Limiting Memory Map
// ---------------------------------------------------------
const chatCooldowns = new Map();
const COOLDOWN_TIME_MS = 5000; // 5 seconds

// ---------------------------------------------------------
// User Schema & Model
// ---------------------------------------------------------

// ---------------------------------------------------------
// Prediction Schema & Model
// ---------------------------------------------------------
const predictionSchema = new mongoose.Schema({
  crop: String,
  area: Number,
  expYield: Number,
  weather: String,
  stage: String,
  predictedLossPercent: Number,
  date: { type: Date, default: Date.now }
});

const Prediction = mongoose.model('Prediction', predictionSchema);
const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  state: { type: String },
  district: { type: String }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// ---------------------------------------------------------
// API Routes
// ---------------------------------------------------------

// Health check route
app.get('/', (req, res) => {
  res.send('🌿 Apex Coders Smart Agriculture Backend is running perfectly!');
});

// 1. SIGNUP ENDPOINT
app.post('/api/signup', async (req, res) => {
  try {
    const { fullName, username, password, state, district } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Username already exists. Please choose another.' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({ fullName, username, password: hashedPassword, state, district });
    await newUser.save();
    res.status(201).json({ success: true, message: 'Account created successfully!' });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ success: false, message: 'Server error during signup.' });
  }
});

// 2. LOGIN ENDPOINT
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`Login attempt for username: "${username}"`); 
    const user = await User.findOne({ username });
    if (!user) {
      console.log('Result: User not found in database.'); 
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      console.log('Result: Password did not match.'); 
      return res.status(401).json({ success: false, message: 'Invalid credentials.' });
    }
    console.log('Result: Login successful!'); 
    res.status(200).json({ success: true, message: 'Login successful!' });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// 3. AI CHAT ENDPOINT (Powered by Real Gemini API with Cooldown)
// 3. AI CHAT ENDPOINT (NOW WITH ML INTEGRATION & COOLDOWN)
app.post('/api/chat', async (req, res) => {
    try {
        // --- START OF COOLDOWN LOGIC ---
        const userIp = req.ip;
        const currentTime = Date.now();
        const lastRequestTime = chatCooldowns.get(userIp);

        if (lastRequestTime && (currentTime - lastRequestTime) < COOLDOWN_TIME_MS) {
            return res.status(429).json({
                success: false,
                response: "Please wait 5 seconds between messages to avoid overloading the assistant."
            });
        }
        chatCooldowns.set(userIp, currentTime);
        // --- END OF COOLDOWN LOGIC ---

        const { message, username } = req.body;
        const lowerMsg = message.toLowerCase();

        // 1. IF THE USER ASKS FOR A CROP RECOMMENDATION -> CALL PYTHON ML
        if (lowerMsg.includes('plant') || lowerMsg.includes('crop') || lowerMsg.includes('recommend')) {
            console.log("🌱 Routing chat to Python ML Engine...");
            
            const pythonMlUrl = 'http://localhost:5002/recommend'; 
            const mlResponse = await fetch(pythonMlUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ weather: "normal" }) 
            });
            
            const mlData = await mlResponse.json();
            
            if (mlData.success) {
                return res.status(200).json({ 
                    success: true, 
                    response: `**🧠 ML Engine Analysis:**\n${mlData.message}` 
                });
            }
        }

        // 2. SAFE FALLBACK (Bypassing Gemini completely to fix the crash)
        return res.status(200).json({ 
            success: true, 
            response: "I am your AI Farm Assistant! Try asking me: 'What crops should I plant?' to see my Machine Learning engine in action!" 
        });

    } catch (error) {
        console.error('Chat Error:', error);
        res.status(500).json({ success: false, message: 'Server error during chat.' });
    }
});
 // 4. REAL ML CROP LOSS PREDICTION ENDPOINT (WITH DATABASE SAVING)
app.post('/api/predict-loss', async (req, res) => {
  try {
    const { crop, area, expYield, weather, stage } = req.body;
    
    // Connect to your Python ML Microservice
    const pythonMlUrl = 'http://localhost:5002/predict'; 
    const mlResponse = await fetch(pythonMlUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crop, area, expYield, weather, stage })
    });

    if (!mlResponse.ok) {
      throw new Error(`Python API responded with status: ${mlResponse.status}`);
    }

    // Get the real prediction back from Python
    const mlData = await mlResponse.json();

    // ---------------------------------------------------------
    // NEW: SAVE THE PREDICTION TO MONGODB
    // ---------------------------------------------------------
    const newPrediction = new Prediction({
      crop: crop,
      area: area,
      expYield: expYield,
      weather: weather,
      stage: stage,
      predictedLossPercent: mlData.predicted_loss_percentage
    });
    
    await newPrediction.save();
    console.log("💾 Successfully saved prediction to smart_agriculture database!");
    // ---------------------------------------------------------

    res.status(200).json({ 
      success: true, 
      lossPercent: mlData.predicted_loss_percentage, 
      message: "Prediction successfully generated by Python and saved to DB!" 
    });

  } catch (error) {
    console.error('ML Prediction Error:', error);
    res.status(500).json({ success: false, message: 'Failed to connect to ML Microservice.' });
  }
});
// ---------------------------------------------------------
// Start Server
// ---------------------------------------------------------
const PORT = process.env.PORT || 5001; 
app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});