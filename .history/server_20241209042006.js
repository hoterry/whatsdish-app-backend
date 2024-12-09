const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// 加載環境變數
dotenv.config();

// 初始化 Supabase 客戶端
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app = express();
app.use(express.json());

// 路由：獲取菜單
app.get('/menu', async (req, res) => {
  const { data, error } = await supabase
    .from('menu_items')
    .select('*');

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data);
});

// 啟動服務器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
