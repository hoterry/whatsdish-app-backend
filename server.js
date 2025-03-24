const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');
const { URL } = require('url');

// Load environment variables
dotenv.config();

// Environment configuration
const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 5000;
const WHATS_DISH_BASE_URL = isDev ? process.env.DEV_WHATS_DISH_BASE_URL : process.env.PROD_WHATS_DISH_BASE_URL;

// Validate required environment variables
const requiredEnvVars = [
  { name: 'WHATS_DISH_BASE_URL', value: WHATS_DISH_BASE_URL }
];

const missingVars = requiredEnvVars.filter(v => !v.value);
if (missingVars.length > 0) {
  console.error('ERROR: Missing required environment variables!');
  missingVars.forEach(v => console.error(`- ${v.name} is missing`));
  process.exit(1);
}

// Initialize Express app
const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Logging helpers
function log(message, data) {
  if (isDev) {
    if (data) {
      console.log(`[DEV LOG] ${message}`, data);
    } else {
      console.log(`[DEV LOG] ${message}`);
    }
  }
}

function logError(message, error) {
  if (isDev) {
    console.error(`[DEV ERROR] ${message}`, error);
  }
}

// Security helper for masking tokens in logs
function maskToken(token) {
  if (!token) return 'undefined';
  return token.length > 8 ? 
    `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : 
    '****';
}

// Startup message
console.log(`Server is starting...`);
console.log(`Environment: ${isDev ? 'development' : 'production'}`);

if (isDev) {
  log('Full API configuration:');
  log(`- WHATS_DISH_BASE_URL: ${WHATS_DISH_BASE_URL}`);
}

// Error handling middleware
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  logError(`${req.method} ${req.path} - ${err.message}`, err);
  res.status(statusCode).json({ error: err.message });
};

// Helper function to validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Routes
app.get('/api/restaurants', async (req, res, next) => {
  try {
    log('Fetching restaurant data from WhatsDish API');
    
    const response = await axios.get(`${WHATS_DISH_BASE_URL}/api/rn/merchants`, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.status !== 200) {
      return res.status(response.status).json({ error: 'Failed to fetch restaurants' });
    }

    log('Fetched restaurant data successfully');
    res.json(response.data);
  } catch (err) {
    logError('Error fetching restaurant data', err);
    res.status(500).json({ error: 'Internal server error while fetching restaurant data' });
  }
});

app.post('/api/send-code', async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.body.phone;

  if (!phoneNumber) {
    console.error('[ERROR] Phone number missing in request body:', req.body);
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  console.log('[INFO] Received request to send verification code');
  console.log('[INFO] Phone Number:', phoneNumber);

  try {
    const result = await axios.post(`${WHATS_DISH_BASE_URL}/api/auth/login-with-sms-trigger`, {
      to: phoneNumber,
    });

    console.log('[SUCCESS] Verification code sent successfully:', result.data);
    res.status(200).json({ message: 'Verification code sent!' });
  } catch (err) {
    console.error('[ERROR] Failed to send verification code:', err.message);
    if (err.response) {
      console.error('[ERROR] Response Status:', err.response.status);
      console.error('[ERROR] Response Data:', err.response.data);
    }
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

app.post('/api/verify-code', async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  const code = req.body.code;

  if (!phoneNumber || !code) {
    console.error('[ERROR] Missing phone or code in request body:', req.body);
    return res.status(400).json({ error: 'Phone number and code are required.' });
  }

  console.log('[INFO] Starting verification...');
  console.log('[INFO] Phone:', phoneNumber, 'Code:', code);

  try {
    const ipResponse = await axios.get('https://checkip.amazonaws.com/');
    const userIp = ipResponse.data.trim();

    console.log('[INFO] User IP detected:', userIp);

    const response = await axios.post(`${WHATS_DISH_BASE_URL}/api/auth/login-with-sms-verify`, {
      to: phoneNumber,
      code: code,
      Ip: userIp,
      lang: 'en',
    });

    console.log('[INFO] Response from login-with-sms-verify:', response.data);

    if (response?.data?.result?.token) {
      console.log('[SUCCESS] Verification successful. Token received.');
      res.status(200).json({ message: 'Login successful!', token: response.data.result.token });
    } else {
      console.error('[ERROR] Token not found in response:', response.data);
      res.status(400).json({ error: 'Failed to retrieve token.' });
    }
  } catch (err) {
    console.error('[ERROR] Verification failed:', err.message);
    if (err.response) {
      console.error('[ERROR] Response Status:', err.response.status);
      console.error('[ERROR] Response Data:', err.response.data);
    }
    res.status(400).json({ error: 'Invalid verification code' });
  }
});


app.get('/api/user/profile', async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      logError('Token is required');
      return res.status(401).json({ error: 'Token is required' });
    }

    log(`Token received: ${maskToken(token)}`);

    try {
      const url = `${WHATS_DISH_BASE_URL}/api/rn/profile`;
      const data = await makeAuthenticatedRequest(url, 'GET', token);
      log('Profile Data fetched successfully');
      res.json(data);
    } catch (error) {
      const statusCode = error.status || 500;
      logError(`Error fetching profile: ${error.message}`, error);
      res.status(statusCode).json({ error: error.message || 'Error fetching profile' });
    }
  } catch (err) {
    next(err);
  }
});

app.get('/fetch-menu', async (req, res, next) => {
  try {
    const restaurantId = req.query.restaurantId;
    if (!restaurantId) {
      logError('Missing restaurantId parameter');
      return res.status(400).json({ error: 'Missing restaurantId parameter' });
    }

    log(`Fetching menu for restaurantId: ${restaurantId}`);

    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      logError('Unauthorized: Missing token');
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    log(`Token received: ${maskToken(token)}`);

    const apiUrl = `${WHATS_DISH_BASE_URL}/api/rn/merchants/${restaurantId}`;
    log(`API URL: ${apiUrl}`);

    try {
      const data = await makeAuthenticatedRequest(apiUrl, 'GET', token);
      log(`Menu Data fetched successfully for restaurantId: ${restaurantId}`);
      res.json(data);
    } catch (error) {
      const statusCode = error.status || 500;
      logError(`Error fetching menu: ${error.message}`, error);
      res.status(statusCode).json({ error: error.message || 'Error fetching menu' });
    }
  } catch (err) {
    next(err);
  }
});

app.get('/api/profile/payment-methods', async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      logError('Token is required');
      return res.status(401).json({ error: 'Token is required' });
    }

    log(`Token received: ${maskToken(token)}`);

    try {
      const url = `${WHATS_DISH_BASE_URL}/api/profile/payment-methods`;
      const data = await makeAuthenticatedRequest(url, 'GET', token);
      log('Payment Methods Data fetched successfully');
      res.json(data);
    } catch (error) {
      const statusCode = error.status || 500;
      logError(`Error fetching payment methods: ${error.message}`, error);
      res.status(statusCode).json({ error: error.message || 'Error fetching payment methods' });
    }
  } catch (err) {
    next(err);
  }
});

app.post('/api/payments/m/cof', async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const cardInfo = req.body;

    if (!token) {
      return res.status(401).json({ error: 'Token is required' });
    }

    if (!cardInfo) {
      return res.status(400).json({ error: 'Card information is required' });
    }

    log(`Adding new payment method, token: ${maskToken(token)}`);

    try {
      const url = `${WHATS_DISH_BASE_URL}/api/payments/m/cof`;
      const data = await makeAuthenticatedRequest(url, 'POST', token, cardInfo);
      log('Payment method added successfully');
      res.json(data);
    } catch (error) {
      const statusCode = error.status || 500;
      logError(`Error adding payment method: ${error.message}`, error);
      res.status(statusCode).json({ error: error.message || 'Error adding payment method' });
    }
  } catch (err) {
    next(err);
  }
});

app.delete('/api/profile/payment-methods/:cardId', async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const { cardId } = req.params;

    if (!token) {
      return res.status(401).json({ error: 'Token is required' });
    }

    log(`Deleting payment method with ID: ${cardId}, token: ${maskToken(token)}`);

    try {
      const url = `${WHATS_DISH_BASE_URL}/api/profile/payment-methods/${cardId}`;
      const data = await makeAuthenticatedRequest(url, 'DELETE', token);
      log('Payment method deleted successfully');
      res.json(data);
    } catch (error) {
      const statusCode = error.status || 500;
      logError(`Error deleting payment method: ${error.message}`, error);
      res.status(statusCode).json({ error: error.message || 'Error deleting payment method' });
    }
  } catch (err) {
    next(err);
  }
});

app.get('/api/restaurants/:restaurantId', async (req, res, next) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const { restaurantId } = req.params;

    if (!token) {
      return res.status(401).json({ error: 'Token is required' });
    }

    log(`Restaurant ID received: ${restaurantId}, token: ${maskToken(token)}`);

    try {
      const url = `${WHATS_DISH_BASE_URL}/api/rn/merchants/${restaurantId}`;
      const data = await makeAuthenticatedRequest(url, 'GET', token);
      log(`Restaurant details fetched successfully for ID: ${restaurantId}`);
      res.json(data);
    } catch (error) {
      const statusCode = error.status || 500;
      logError(`Error fetching restaurant details: ${error.message}`, error);
      res.status(statusCode).json({ error: error.message || 'Error fetching restaurant details' });
    }
  } catch (err) {
    next(err);
  }
});

// Apply error handler middleware
app.use(errorHandler);

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Application specific logging, throwing an error, or other logic here
  // In production, you might want to gracefully restart the server
  if (!isDev) {
    process.exit(1);
  }
});