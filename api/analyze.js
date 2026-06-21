// ══════════════════════════════════════════════════════
// 宠物照片分析 - 服务器端中转函数
// ──────────────────────────────────────────────────────
// 使用火山引擎 Doubao-Seed-1.6-vision 模型
// 注意：这个模型用的是新版 Responses API 格式
// 跟 tryon.js 共用同一个火山引擎 API Key
// ══════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  const { image, mime, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: '缺少火山引擎 API Key，请先在网站右上角配置' });
  }
  if (!image) {
    return res.status(400).json({ error: '缺少图片数据' });
  }

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
    // 火山引擎 Doubao-Seed-1.6-vision（新版 Responses API）
    // 模型ID：doubao-seed-1-6-vision-250815
    // 地址：/api/v3/responses（不是 chat/completions）
    // ────────────────────────────────────────────────
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-seed-1-6-vision-250815',
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_image', image_url: `data:${mime};base64,${image}` },
              { type: 'input_text', text: PROMPT }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: `火山引擎接口报错：${data.error.message || JSON.stringify(data.error)}` });
    }

    // ────────────────────────────────────────────────
    // Responses API 的返回结构跟 chat/completions 不一样
    // 尝试几种可能的路径来取出文字内容
    // 如果都取不到，把完整原始返回传回前端方便排查
    // ────────────────────────────────────────────────
    let rawText = null;

    if (data.output_text) {
      rawText = data.output_text;
    } else if (Array.isArray(data.output)) {
      const msg = data.output.find(o => o.type === 'message' || o.role === 'assistant');
      if (msg && Array.isArray(msg.content)) {
        const textPart = msg.content.find(c => c.type === 'output_text' || c.text);
        rawText = textPart?.text || textPart?.output_text;
      }
    } else if (data.choices?.[0]?.message?.content) {
      rawText = data.choices[0].message.content;
    }

    if (!rawText) {
      return res.status(400).json({
        error: '无法从返回结果中提取文字内容，返回结构与预期不同',
        raw: JSON.stringify(data).slice(0, 800)
      });
    }

    rawText = rawText.replace(/```json|```/g, '').trim();

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
