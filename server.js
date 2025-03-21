const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');
const { URL } = require('url');

// Load environment variables
dotenv.config();

// Environment configuration
const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 5000;
const SUPABASE_URL = isDev ? process.env.DEV_SUPABASE_URL : process.env.PROD_SUPABASE_URL;
const SUPABASE_ANON_KEY = isDev ? process.env.DEV_SUPABASE_ANON_KEY : process.env.PROD_SUPABASE_ANON_KEY;
const WHATS_DISH_BASE_URL = isDev ? process.env.DEV_WHATS_DISH_BASE_URL : process.env.PROD_WHATS_DISH_BASE_URL;

// Validate required environment variables
const requiredEnvVars = [
  { name: 'SUPABASE_URL', value: SUPABASE_URL },
  { name: 'SUPABASE_ANON_KEY', value: SUPABASE_ANON_KEY },
  { name: 'WHATS_DISH_BASE_URL', value: WHATS_DISH_BASE_URL }
];

const missingVars = requiredEnvVars.filter(v => !v.value);
if (missingVars.length > 0) {
  console.error('ERROR: Missing required environment variables!');
  missingVars.forEach(v => console.error(`- ${v.name} is missing`));
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  log(`- SUPABASE_URL: ${SUPABASE_URL}`);
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
app.get('/menu', async (req, res, next) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) {
      return res.status(400).json({ error: 'Missing restaurant_id parameter' });
    }
    
    log(`Fetching menu for restaurant_id: ${restaurant_id}`);

    const { data, error } = await supabase
      .from('menu_items')
      .select(`*,modifier_groups (*,modifier_items (id,name,name_zh,price)),option_groups (*,options (id, name,name_zh,price))`)
      .eq('restaurant_id', restaurant_id);
    
    if (error) {
      logError(`Supabase Error: ${error.message}`, error);
      return res.status(500).json({ error: error.message });
    }

    log(`Menu Data fetched successfully for restaurant_id: ${restaurant_id}`);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

app.get('/restaurant', async (req, res, next) => {
  try {
    log('Fetching all restaurants');
    const { data, error } = await supabase.from('restaurants').select('*');
    
    if (error) {
      logError(`Supabase Error: ${error.message}`, error);
      return res.status(400).json({ error: error.message });
    }

    log('Restaurant Data fetched successfully');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

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

app.post('/api/send-code', async (req, res, next) => {
  try {
    const phoneNumber = req.body.phoneNumber || req.body.phone;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    log(`Sending verification code to: ${phoneNumber}`);

    const response = await axios.post(`${WHATS_DISH_BASE_URL}/api/auth/login-with-sms-trigger`, {
      to: phoneNumber
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    log('Verification code sent successfully');
    res.status(200).json({ message: 'Verification code sent!' });
  } catch (err) {
    logError(`Failed to send verification code: ${err.message}`, err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

app.post('/api/verify-code', async (req, res, next) => {
  try {
    const phoneNumber = req.body.phoneNumber || req.body.phone;
    const code = req.body.code;
    
    if (!phoneNumber || !code) {
      return res.status(400).json({ error: 'Phone number and code are required.' });
    }

    log(`Verifying code for: ${phoneNumber}, Code: ${code}`);

    // Get user IP address
    let userIp;
    try {
      const ipResponse = await axios.get('https://checkip.amazonaws.com/');
      userIp = ipResponse.data.trim();
      log(`Detected user IP: ${userIp}`);
    } catch (ipError) {
      logError('Failed to get IP address', ipError);
      userIp = req.ip || '127.0.0.1'; // Fallback to request IP or localhost
      log(`Using fallback IP: ${userIp}`);
    }

    const response = await axios.post(`${WHATS_DISH_BASE_URL}/api/auth/login-with-sms-verify`, {
      to: phoneNumber,
      code: code,
      Ip: userIp,
      lang: 'en',
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (response?.data?.result?.token) {
      log('Verification success, Token received');
      res.status(200).json({ 
        message: 'Login successful!', 
        token: response.data.result.token 
      });
    } else {
      logError('Failed to retrieve token');
      res.status(400).json({ error: 'Failed to retrieve token.' });
    }
  } catch (err) {
    logError(`Invalid verification code: ${err.message}`, err);
    res.status(400).json({ error: 'Invalid verification code' });
  }
});

// Helper function to handle API requests with authentication
async function makeAuthenticatedRequest(url, method, token, body = null) {
  try {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    if (body && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.message || 'API request failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    throw error;
  }
}

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