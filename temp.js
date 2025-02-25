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


app.get('/api/profile/payment-methods', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
      if (isDev) console.log('[DEV ERROR] Token is required');
      return res.status(401).json({ message: 'Token is required' });
    }

    const response = await fetch(`${WHATS_DISH_BASE_URL}/api/profile/payment-methods`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    if (isDev) console.log('[DEV LOG] Payment Methods Data:', data);

    return res.json(data);
  } catch (error) {
    if (isDev) console.error('[DEV ERROR] Internal server error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/payments/m/cof', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const cardInfo = req.body;

    if (!token) {
      return res.status(401).json({ message: 'Token is required' });
    }

    if (!cardInfo) {
      return res.status(400).json({ message: 'Card information is required' });
    }

    const response = await fetch(`${WHATS_DISH_BASE_URL}/api/payments/m/cof`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(cardInfo),
    });

    const newCard = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(newCard);
    }

    return res.json(newCard);
  } catch (error) {
    console.error('Error saving card:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.delete('/api/profile/payment-methods/:cardId', async (req, res) => {
  try {
    const token = req.headers['authorization']?.split(' ')[1];
    const { cardId } = req.params;

    if (!token) {
      return res.status(401).json({ message: 'Token is required' });
    }

    const response = await fetch(`${WHATS_DISH_BASE_URL}/api/profile/payment-methods/${cardId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(result);
    }

    return res.json(result);
  } catch (error) {
    console.error('Error removing card:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
