// ══════════════════════════════════════════════════════
// 试穿效果图生成 - 服务器端中转函数
// ──────────────────────────────────────────────────────
// 使用火山引擎 Doubao-Seedream-4.5 图生图接口
// 真实接口格式（已通过控制台确认）：
//   POST https://ark.cn-beijing.volces.com/api/v3/images/generations
//   model: doubao-seedream-4-5-251128
//   image: [图1的URL, 图2的URL]   ← 数组，放两张参考图
//   prompt: "将图1的服装换为图2的服装"
// ══════════════════════════════════════════════════════

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '只支持 POST 请求' });
  }

  const { petImage, petMime, clothImage, clothMime, clothImageUrl, clothName, apiKey } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: '缺少火山引擎 API Key，请先在网站右上角配置' });
  }
  if (!petImage) {
    return res.status(400).json({ error: '缺少宠物照片' });
  }

  try {
    // 图1：宠物照片，用户上传的，本地只有 base64
    // 用 data URI 格式传给接口（data:image/jpeg;base64,xxxx）
    const petDataUri = `data:${petMime};base64,${petImage}`;

    // 图2：衣服照片，两种来源：
    // 1. 用户自己上传的（快速试穿模式）→ 已经是 base64
    // 2. 从商品库选的（AI推荐模式）→ 是真实图片URL，直接用
    let clothRef;
    if (clothImageUrl) {
      clothRef = clothImageUrl;
    } else if (clothImage) {
      clothRef = `data:${clothMime};base64,${clothImage}`;
    } else {
      return res.status(400).json({ error: '缺少服装图片' });
    }

    const prompt = `将图1中宠物的服装换成图2展示的${clothName || '这件服装'}，保持图1中宠物的样貌、毛色、姿态、背景完全不变，只修改它身上穿的衣服，衣服的颜色和图案参考图2。生成照片级真实效果。`;

    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-seedream-4-5-251128',
        prompt: prompt,
        image: [petDataUri, clothRef],
        sequential_image_generation: 'disabled',
        response_format: 'url',
        size: '2K',
        stream: false,
        watermark: false
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: `火山引擎接口报错：${data.error.message || JSON.stringify(data.error)}` });
    }

    // 标准返回格式应该是 { data: [ { url: "..." } ] }
    const resultUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;

    if (!resultUrl) {
      return res.status(400).json({
        error: '未能从返回结果中找到生成的图片',
        raw: JSON.stringify(data).slice(0, 500)
      });
    }

    return res.status(200).json({ imageUrl: resultUrl });

  } catch (err) {
    console.error('tryon.js 错误:', err);
    return res.status(500).json({ error: `服务器中转出错：${err.message}` });
  }
}
