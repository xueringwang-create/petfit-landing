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

  const { petImage, petMime, clothImage, clothMime, clothImageUrl, clothName, clothDesc, apiKey } = req.body;

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

    const prompt = `这是宠物服装合成任务，共两张图片：图1是宠物原图，图2是要试穿的服装商品图。

【关于服装的还原要求 — 最高优先级，比真实感和美观度都更重要】
必须像素级精确复刻图2这件具体服装的图案和纹理，包括：版型结构、底色与图案的具体颜色搭配、条纹/格纹/印花的排列方式、装饰细节（蝴蝶结/蕾丝/纽扣/拉链/口袋/领子等）、裙摆层数与轮廓、领口袖型。${clothDesc ? `这件服装的文字描述供参考："${clothDesc}"。` : ''}禁止替换成其他种类或风格的服装，禁止简化、省略、模糊化或更改图2中的任何图案纹理与设计细节，禁止只保留大致色调而丢失具体图案。最终穿在宠物身上的必须是图2展示的这件衣服本身，而不是相似风格的另一件衣服。

【关于宠物的还原要求】
宠物的脸部、眼睛、毛色、毛发纹理、耳朵形态、姿势动作、所在背景环境、光线效果须与图1完全一致，不得改变，不得添加图1和图2之外的配饰或物品。

【输出要求】
照片级真实效果，避免肢体变形，最终结果是"图1的宠物穿着图2这件具体的服装（图案纹理与图2完全一致）"。`;

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
        watermark: false,
        // 提高这个数值让生成结果更贴近参考图，减少模型自由发挥
        // 如果接口报错说数值超出范围，把这个数字调小（比如10）
        guidance_scale: 12
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
