// ══════════════════════════════════════════════════════
// 试穿效果图生成 - 服务器端中转函数
// ──────────────────────────────────────────────────────
// 这个文件运行在 Vercel 的服务器上，不是浏览器里
// 所以不会有"跨域 Failed to fetch"的问题
//
// 调用方式：前端 POST 请求到 /api/tryon
// 这个函数收到请求后，代替浏览器去联系火山引擎接口
//
// 输入：宠物照片 + 衣服照片（两张真实图片）
// 输出：宠物穿上这件衣服的合成效果图
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
    // ────────────────────────────────────────────────
    // 衣服图片来源有两种情况：
    // 1. 用户自己上传的衣服照片 → clothImage 已经是 base64
    // 2. 从商品库选的商品 → 只有图片 URL，需要服务器先下载转成 base64
    //    （服务器对服务器请求，不存在跨域限制，比浏览器里转更可靠）
    // ────────────────────────────────────────────────
    let finalClothImage = clothImage;
    let finalClothMime = clothMime || 'image/jpeg';

    if (!finalClothImage && clothImageUrl) {
      const imgRes = await fetch(clothImageUrl);
      if (!imgRes.ok) {
        return res.status(400).json({ error: '无法下载商品图片，链接可能已失效' });
      }
      const buffer = await imgRes.arrayBuffer();
      finalClothImage = Buffer.from(buffer).toString('base64');
      finalClothMime = imgRes.headers.get('content-type') || 'image/jpeg';
    }

    if (!finalClothImage) {
      return res.status(400).json({ error: '缺少服装图片' });
    }

    // 编辑指令：保留宠物本身特征，参考衣服真实样式来合成
    const editPrompt = `这是两张图片：第一张是一只宠物，第二张是一件${clothName || '服装'}。
请生成一张新图片：保持第一张图片中宠物的样貌、毛色、姿态、背景完全不变，
只是给它穿上第二张图片中那件衣服，衣服的颜色、图案、款式要尽量还原第二张图片。
不要改变宠物的身份特征，只修改它身上穿的衣服。生成照片级真实效果。`;

    // ────────────────────────────────────────────────
    // 火山引擎 Doubao-Seedream 图片生成接口
    // 文档：https://www.volcengine.com/docs/82379
    // 如果模型ID不对，去火山方舟控制台「在线推理」里
    // 找到 Doubao-Seedream 的接入点ID，替换下面的 model 值
    // ────────────────────────────────────────────────
    const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'doubao-seedream-4-5',  // ← 去火山方舟控制台确认你账号里实际的图片生成模型ID，改这里
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${petMime};base64,${petImage}` } },
              { type: 'image_url', image_url: { url: `data:${finalClothMime};base64,${finalClothImage}` } },
              { type: 'text', text: editPrompt }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(400).json({ error: `火山引擎接口报错：${data.error.message || JSON.stringify(data.error)}` });
    }

    // 尝试从返回结果中找到图片数据（不同模型返回格式可能不同）
    let resultImageUrl = null;

    if (data.choices && data.choices[0] && data.choices[0].message) {
      const content = data.choices[0].message.content;
      // 情况一：返回的是图片 URL 文本
      if (typeof content === 'string' && content.startsWith('http')) {
        resultImageUrl = content;
      }
      // 情况二：返回的是结构化的图片数据
      if (Array.isArray(content)) {
        const imgPart = content.find(p => p.image_url || p.type === 'image_url');
        if (imgPart) resultImageUrl = imgPart.image_url?.url || imgPart.url;
      }
    }
    // 情况三：火山引擎专用图片生成接口格式
    if (!resultImageUrl && data.data && data.data[0]) {
      resultImageUrl = data.data[0].url || `data:image/png;base64,${data.data[0].b64_json}`;
    }

    if (!resultImageUrl) {
      return res.status(400).json({
        error: '未能从返回结果中找到生成的图片，返回格式可能与预期不同',
        raw: JSON.stringify(data).slice(0, 500)
      });
    }

    return res.status(200).json({ imageUrl: resultImageUrl });

  } catch (err) {
    console.error('tryon.js 错误:', err);
    return res.status(500).json({ error: `服务器中转出错：${err.message}` });
  }
}
