const express = require('express');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config(); // 加載環境變數

const app = express();
const port = process.env.PORT || 5000;

// 初始化 Supabase 客戶端
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(express.json()); // 解析 JSON 請求

// API 路由
app.get('/', (req, res) => {
  res.send('Welcome to the Restaurant Backend!');
});

// 启动服务器
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
