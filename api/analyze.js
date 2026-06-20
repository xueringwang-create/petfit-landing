// ══════════════════════════════════════════════════════
// 宠物照片分析 - 服务器端中转函数
// ──────────────────────────────────────────────────────
// 这个文件运行在 Vercel 的服务器上，不是浏览器里
// 所以不会有"跨域 Failed to fetch"的问题
//
// 调用方式：前端 POST 请求到 /api/analyze
// 这个函数收到请求后，代替浏览器去联系 DeepSeek 官方接口
// ══════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  const { image, mime, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: '缺少 DeepSeek API Key，请先在网站右上角配置' });
  }
  if (!image) {
    return res.status(400).json({ error: '缺少图片数据' });
  }

  // 宠物分析提示词：涵盖品种、体型、毛发、性格等维度
  const PROMPT = `你是专业宠物穿搭顾问。分析图片中的宠物，只返回JSON不要其他内容：
{
  "emoji":"代表该动物的emoji",
  "animal":"动物类型中文",
  "breed":"品种中文，不确定写混种",
  "bodySize":"小型/中型/大型",
  "weightRange":"估算体重如3-5kg",
  "bodyShape":"圆润/标准/修长",
  "legType":"短腿/标准腿/长腿",
  "furLength":"短毛/中长毛/长毛",
  "furTexture":"光滑/蓬松/卷曲/粗硬",
  "furColor":"毛发颜色和花纹描述",
  "personality":"性格一词",
  "styles":["最适合的2个风格，从可爱/潮流/优雅/户外/节日中选"],
  "styleReason":"推荐理由，30字以内",
  "sizeRecommend":"推荐尺码如S或S-M",
  "avoidTips":"穿搭禁忌，20字以内",
  "praise":"夸它的有趣一句话，温暖可爱，15字以内",
  "stylingTip":"核心穿搭建议，针对其体型和毛发，30字以内"
}`;

  try {
    // ────────────────────────────────────────────────
    // DeepSeek 官方接口地址（不是火山引擎）
    // 文档：https://platform.deepseek.com/docs
    // 如果这个模型不支持图片输入，这里会收到明确报错
    // 届时把 model 改成你账号里实际可用的视觉模型名称
    // ────────────────────────────────────────────────
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-vl',  // ← 如果报错"模型不存在"，去 platform.deepseek.com 看你账号里实际的视觉模型名称，改这里
        max_tokens: 1000,
        temperature: 0.3,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mime};base64,${image}` } },
              { type: 'text', text: PROMPT }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    // 把 DeepSeek 返回的原始错误直接传回前端，方便排查
    if (data.error) {
      return res.status(400).json({ error: `DeepSeek 接口报错：${data.error.message || JSON.stringify(data.error)}` });
    }
    if (!data.choices || !data.choices[0]) {
      return res.status(400).json({ error: `DeepSeek 返回格式异常：${JSON.stringify(data)}` });
    }

    const rawText = data.choices[0].message.content.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return res.status(400).json({ error: 'AI 返回的内容无法解析为 JSON', raw: rawText });
    }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('analyze.js 错误:', err);
    return res.status(500).json({ error: `服务器中转出错：${err.message}` });
  }
}
