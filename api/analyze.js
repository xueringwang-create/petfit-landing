// ══════════════════════════════════════════════════════
// 宠物照片分析 - 服务器端中转函数
// ──────────────────────────────────────────────────────
// 改用火山引擎 Doubao 视觉模型（DeepSeek官方接口已确认不支持图片）
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
    // 火山引擎 Doubao 视觉模型接口
    // 模型ID：doubao-1.5-vision-pro-250328（已在控制台确认开通）
    // ────────────────────────────────────────────────
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-1.5-vision-pro-250328',
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

    if (data.error) {
      return res.status(400).json({ error: `火山引擎接口报错：${data.error.message || JSON.stringify(data.error)}` });
    }
    if (!data.choices || !data.choices[0]) {
      return res.status(400).json({ error: `返回格式异常：${JSON.stringify(data)}` });
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
