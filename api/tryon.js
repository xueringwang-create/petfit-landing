// ══════════════════════════════════════════════════════
// 试穿效果图生成 - 服务器端中转函数
// ──────────────────────────────────────────────────────
// 这版加了一个"商品图清洗"的预处理步骤：
// 真实商品图通常背景杂乱（衣架/模特/户外背景），
// 先让 AI 把服装单独提取到纯白背景上，
// 再拿这张干净的图去跟宠物合成，减少干扰，提升还原准确度
// ══════════════════════════════════════════════════════

async function callVolcanoImageGen(apiKey, prompt, images) {
  const response = await fetch('https://ark.cn-beijing.volces.com/api/v3/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'doubao-seedream-4-5-251128',
      prompt: prompt,
      image: images,
      sequential_image_generation: 'disabled',
      response_format: 'url',
      size: '2K',
      stream: false,
      watermark: false,
      guidance_scale: 7.5
    })
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  const resultUrl = data.data?.[0]?.url || data.data?.[0]?.b64_json;
  if (!resultUrl) {
    throw new Error('未能从返回结果中找到生成的图片：' + JSON.stringify(data).slice(0, 400));
  }
  return resultUrl;
}

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
    const petDataUri = `data:${petMime};base64,${petImage}`;

    let clothRef;
    if (clothImageUrl) {
      clothRef = clothImageUrl;
    } else if (clothImage) {
      clothRef = `data:${clothMime};base64,${clothImage}`;
    } else {
      return res.status(400).json({ error: '缺少服装图片' });
    }

    // ────────────────────────────────────────────────
    // 第一步：清洗商品图
    // 把衣架/模特/背景去掉，只保留服装本身在纯白底上
    // ────────────────────────────────────────────────
    const cleanupPrompt = `提取图中展示的这件服装本身，将其放置在纯白色背景上正面平铺展示，去除衣架、人体模特、配饰道具、户外或场景背景等一切非服装本身的元素。必须完整保留服装的颜色、图案、印花排列、装饰细节（蝴蝶结/蕾丝/纽扣等）、版型结构，不能简化或更改设计细节，只是把它从原背景中干净地提取出来。${clothDesc ? `服装描述参考："${clothDesc}"。` : ''}输出照片级真实效果。`;

    let cleanedClothRef = clothRef;
    try {
      cleanedClothRef = await callVolcanoImageGen(apiKey, cleanupPrompt, [clothRef]);
    } catch (cleanupErr) {
      // 清洗失败不阻断整体流程，退回用原图继续走第二步
      console.warn('商品图清洗失败，使用原图继续:', cleanupErr.message);
      cleanedClothRef = clothRef;
    }

    // ────────────────────────────────────────────────
    // 第二步：用清洗后的服装图 + 宠物图 合成试穿效果
    // ────────────────────────────────────────────────
    const finalPrompt = `这是宠物服装合成任务，共两张图片：图1是宠物原图，图2是已经提取干净的服装平铺图。

【关于服装的还原要求 — 最高优先级，比真实感和美观度都更重要】
必须像素级精确复刻图2这件具体服装的图案和纹理，包括：版型结构、底色与图案的具体颜色搭配、条纹/格纹/印花的排列方式、装饰细节（蝴蝶结/蕾丝/纽扣/拉链/口袋/领子等）、裙摆层数与轮廓、领口袖型。${clothDesc ? `这件服装的文字描述供参考："${clothDesc}"。` : ''}禁止替换成其他种类或风格的服装，禁止简化、省略、模糊化或更改图2中的任何图案纹理与设计细节。最终穿在宠物身上的必须是图2展示的这件衣服本身。

【关于宠物的还原要求】
宠物的脸部、眼睛、毛色、毛发纹理、耳朵形态、姿势动作、所在背景环境、光线效果须与图1完全一致，不得改变，不得添加图1和图2之外的配饰或物品。

【输出要求】
照片级真实效果，避免肢体变形，最终结果是"图1的宠物穿着图2这件具体的服装（图案纹理与图2完全一致）"。`;

    const resultUrl = await callVolcanoImageGen(apiKey, finalPrompt, [petDataUri, cleanedClothRef]);

    return res.status(200).json({ imageUrl: resultUrl, cleanedRef: cleanedClothRef });

  } catch (err) {
    console.error('tryon.js 错误:', err);
    return res.status(500).json({ error: `服务器中转出错：${err.message}` });
  }
}
