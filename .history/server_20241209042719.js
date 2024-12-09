const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

// 初始化 Supabase 客户端
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const app = express();
app.use(express.json());

// 路由：获取菜单
app.get('/menu', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*');  // 这里是从 Supabase 数据库的 menu_items 表中获取数据

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // 成功返回菜单数据
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: '服务器错误' });
  }
});

// 启动服务器
const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// 获取餐厅信息
app.get('/restaurant', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*') // 获取餐厅表中的所有数据
        .eq('restaurant_id', 'F13PHS'); // 这里的 'F13PHS' 是餐厅的 ID，你可以根据需要动态获取
  
      if (error) {
        return res.status(400).json({ error: error.message });
      }
  
      res.json(data); // 返回餐厅数据
    } catch (err) {
      res.status(500).json({ error: '服务器错误' });
    }
  });
  