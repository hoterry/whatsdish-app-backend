const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const cors = require('cors');
const axios = require('axios');
const bodyParser = require('body-parser');

dotenv.config();

const isDev = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT || 5000;

const SUPABASE_URL = isDev ? process.env.DEV_SUPABASE_URL : process.env.PROD_SUPABASE_URL;
const SUPABASE_ANON_KEY = isDev ? process.env.DEV_SUPABASE_ANON_KEY : process.env.PROD_SUPABASE_ANON_KEY;
const WHATS_DISH_BASE_URL = isDev ? process.env.DEV_WHATS_DISH_BASE_URL : process.env.PROD_WHATS_DISH_BASE_URL;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ ERROR: Missing Supabase credentials!');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


const app = express();
app.use(express.json());
app.use(cors());

console.log(`Server is starting...`);
console.log(`Environment: ${isDev ? 'development' : 'production'}`);

if (isDev) {
  console.log('[DEV MODE] Full API configuration:');
  console.log(`- SUPABASE_URL: ${SUPABASE_URL}`);
  console.log(`- WHATS_DISH_BASE_URL: ${WHATS_DISH_BASE_URL}`);
}

function log(message) {
  if (isDev) {
    console.log(message);
  }
}

app.get('/menu', async (req, res) => {
  try {
    const { restaurant_id } = req.query;
    if (!restaurant_id) {
      return res.status(400).json({ error: 'Missing restaurant_id parameter' });
    }
    
    if (isDev) console.log(`[DEV LOG] Fetching menu for restaurant_id: ${restaurant_id}`);

    const { data, error } = await supabase
      .from('menu_items')
      .select(`*,modifier_groups (*,modifier_items (id,name,name_zh,price)),option_groups (*,options (id, name,name_zh,price))`)
      .eq('restaurant_id', restaurant_id);
    
    if (error) {
      if (isDev) console.error(`[DEV ERROR] Supabase Error: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }

    if (isDev) console.log(`[DEV LOG] Menu Data:`, data);
    res.status(200).json(data);
  } catch (err) {
    if (isDev) console.error(`[DEV ERROR] Server Error: ${err.message}`);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.get('/restaurant', async (req, res) => {
  try {
    if (isDev) console.log(`[DEV LOG] Fetching all restaurants`);
    const { data, error } = await supabase.from('restaurants').select('*');
    
    if (error) {
      if (isDev) console.error(`[DEV ERROR] Supabase Error: ${error.message}`);
      return res.status(400).json({ error: error.message });
    }

    if (isDev) console.log(`[DEV LOG] Restaurant Data:`, data);
    res.json(data);
  } catch (err) {
    if (isDev) console.error(`[DEV ERROR] Server error: ${err.message}`);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/send-code', async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  if (isDev) console.log(`[DEV LOG] Sending verification code to: ${phoneNumber}`);

  try {
    await axios.post(`${WHATS_DISH_BASE_URL}/api/auth/login-with-sms-trigger`, {
      to: phoneNumber,
    });
    res.status(200).json({ message: 'Verification code sent!' });
  } catch (err) {
    if (isDev) console.error(`[DEV ERROR] Failed to send verification code: ${err.message}`);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

app.post('/api/verify-code', async (req, res) => {
  const phoneNumber = req.body.phoneNumber || req.body.phone;
  const code = req.body.code;
  
  if (!phoneNumber || !code) {
    return res.status(400).json({ error: 'Phone number and code are required.' });
  }

  if (isDev) console.log(`[DEV LOG] Verifying code for: ${phoneNumber}, Code: ${code}`);

  try {
    const ipResponse = await axios.get('https://checkip.amazonaws.com/');
    const userIp = ipResponse.data.trim();
    
    if (isDev) console.log(`[DEV LOG] Detected user IP: ${userIp}`);

    const response = await axios.post(`${WHATS_DISH_BASE_URL}/api/auth/login-with-sms-verify`, {
      to: phoneNumber,
      code: code,
      Ip: userIp,
      lang: 'en',
    });
    
    if (response?.data?.result?.token) {
      if (isDev) console.log(`[DEV LOG] Verification success, Token received.`);
      res.status(200).json({ message: 'Login successful!', token: response.data.result.token });
    } else {
      if (isDev) console.error(`[DEV ERROR] Failed to retrieve token.`);
      res.status(400).json({ error: 'Failed to retrieve token.' });
    }
  } catch (err) {
    if (isDev) console.error(`[DEV ERROR] Invalid verification code: ${err.message}`);
    res.status(400).json({ error: 'Invalid verification code' });
  }
});

app.get('/api/profile', async (req, res) => {
  try {
    const token = req.headers.authorization;
    if (!token) {
      if (isDev) console.log('[DEV ERROR] Missing token');
      return res.status(401).json({ error: 'Missing token' });
    }

    if (isDev) console.log('[DEV LOG] Token received:', token);

    const response = await axios.get(`${WHATS_DISH_BASE_URL}/api/rn/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (isDev) console.log('[DEV LOG] Profile Data:', response.data);
    res.status(200).json(response.data);
  } catch (err) {
    if (isDev) console.error('[DEV ERROR] Failed to fetch profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.get('/api/user/profile', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      if (isDev) console.log('[DEV ERROR] Token is required');
      return res.status(401).json({ message: 'Token is required' });
    }

    if (isDev) console.log('[DEV LOG] Token received:', token);

    const response = await fetch(`${WHATS_DISH_BASE_URL}/api/rn/profile`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (isDev) console.log('[DEV LOG] Profile Data:', data);

    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.json(data);
  } catch (error) {
    if (isDev) console.error('[DEV ERROR] Internal server error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/fetch-menu', async (req, res) => {
  try {
    const restaurantId = req.query.restaurantId;
    if (!restaurantId) {
      if (isDev) console.log('[DEV ERROR] Missing restaurantId parameter');
      return res.status(400).json({ error: 'Missing restaurantId parameter' });
    }

    if (isDev) console.log('[DEV LOG] Fetching menu for restaurantId:', restaurantId);

    const token = await getToken();
    if (!token) {
      if (isDev) console.log('[DEV ERROR] Unauthorized: Missing token');
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const apiUrl = `${WHATS_DISH_BASE_URL}/api/rn/merchants/${restaurantId}`;
    if (isDev) console.log('[DEV LOG] API URL:', apiUrl);

    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    if (isDev) console.log('[DEV LOG] Menu Data:', data);
    res.json(data);
  } catch (error) {
    if (isDev) console.error('[DEV ERROR] Error fetching menu:', error);
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
