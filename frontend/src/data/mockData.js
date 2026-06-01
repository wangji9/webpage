export const mockSession = {
  loggedIn: false,
  user: null
};

export const mockUsers = {
  user: {
    password: "user123",
    user: { id: "u-1001", name: "注册用户", username: "user", role: "registered" }
  },
  researcher: {
    password: "research123",
    user: { id: "u-2001", name: "研究者用户", username: "researcher", role: "researcher" }
  },
  admin: {
    password: "admin123",
    user: { id: "u-9001", name: "管理员", username: "admin", role: "admin" }
  }
};

export const mockSections = [
  {
    id: "classics",
    title: "中国典籍海外译介",
    intro: "聚焦中国古代经典在海外的传播与接受，整理多语种译本信息、译者活动、版本谱系与研究成果。",
    color: "#0f766e",
    sublibraries: ["《论语》", "《史记》", "《诗经》", "《楚辞》", "《道德经》", "《庄子》", "《孙子兵法》", "《本草纲目》", "《天工开物》"],
    keywords: ["典籍", "译本", "转译", "注释", "汉学"]
  },
  {
    id: "shanghai",
    title: "上海文学海外传播",
    intro: "围绕上海文学在海外的翻译出版与接受研究，呈现上海的城市书写、文学传播与跨文化阐释。",
    color: "#1f7acb",
    sublibraries: ["《上海文学海外译介传播研究》", "海派小说译本", "现代都市书写", "文学期刊与评论"],
    keywords: ["上海", "城市书写", "海派文学", "海外出版"]
  },
  {
    id: "stories",
    title: "多语种中国故事集",
    intro: "整理海外出版或编译的中国故事集，关注中国民间故事、寓言、传说在不同语种中的传播路径。",
    color: "#15a884",
    sublibraries: ["中国民间故事德语译介", "中国民间故事西班牙语译介", "中国民间故事英语译介", "中国民间故事俄语译介", "中国民间故事法语译介", "中国民间故事日语译介"],
    keywords: ["故事集", "民间故事", "主题流变", "多语种"]
  },
  {
    id: "world-lit",
    title: "世界文学的中国叙事",
    intro: "呈现世界文学中的中国书写，考察中国形象在不同文学传统、政治语境和翻译网络中的生成变异。",
    color: "#2468d8",
    sublibraries: ["左翼文学中的中国书写", "华裔文学与中国叙事", "德语文学中的中国形象", "旅行文学中的中国叙事"],
    keywords: ["中国形象", "世界文学", "改写", "跨文化叙事"]
  }
];

export const mockResults = [
  {
    id: "r-001",
    title: "《论语》英译版本谱系与注释策略研究",
    summary: "梳理十八世纪以来《论语》英译本的译者网络、注释范式与知识生产机制。",
    section: "中国典籍海外译介",
    date: "2026-05-18",
    type: "学术论文"
  },
  {
    id: "r-002",
    title: "上海文学海外传播资料库阶段性建设报告",
    summary: "汇总海派文学译本、评论、出版机构与研究动态，形成可持续扩展的数据结构。",
    section: "上海文学海外传播",
    date: "2026-04-26",
    type: "研究中心动态"
  },
  {
    id: "r-003",
    title: "多语种中国民间故事集目录整理",
    summary: "以语种、出版地与故事主题为维度，初步建立故事集条目的检索与比对框架。",
    section: "多语种中国故事集",
    date: "2026-03-30",
    type: "资料目录"
  }
];

export const modelProviders = [
  {
    id: "gpt",
    name: "OpenAI GPT",
  models: ["gpt-5.2", "gpt-5.3-codex", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-openai-compact", "gpt-5.5"],
    status: "API 可接入",
    note: "适合综合问答、长文本归纳与跨语种比较。"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    status: "API 可接入",
    note: "适合多模态材料、地图解释与结构化摘要。"
  },
  {
    id: "glm",
    name: "智谱 GLM",
    models: ["glm-4-plus", "glm-4-air"],
    status: "API 可接入",
    note: "适合中文知识库检索、术语统一与中文报告生成。"
  },
  {
    id: "qwen",
    name: "通义千问",
    models: ["qwen-max", "qwen-plus"],
    status: "API 可接入",
    note: "适合中文语料抽取、表格化输出与批处理。"
  }
];

const baseKnowledgeItems = [
  {
    id: "kb-001",
    status: "通过",
    sectionId: "classics",
    resourceType: "外文译本",
    canonicalTitle: "天工开物",
    translatedTitle: "Procédés Chinois pour la fabrication de l'encre",
    author: "宋应星",
    translator: "Stanislas Julien（儒莲）",
    language: "法语",
    country: "法国",
    city: "巴黎",
    publisher: "Imprimerie Royale",
    year: 1833,
    uploadedAt: "2026-01-16 05:28",
    uploader: "方心怡",
    summary: "早期法语汉学材料中关于中国工艺知识的重要译介条目，保留了技术术语、器物称名与欧洲读者注释。",
    tags: ["工艺知识", "早期汉学", "法语译介"],
    evidence: ["标题页影印件", "译者序", "术语索引"],
    coordinates: { from: [116.4, 39.9], to: [2.35, 48.86] },
    graphNodeIds: ["n-work-tiangkong", "n-trans-julien", "n-city-paris"]
  },
  {
    id: "kb-002",
    status: "通过",
    sectionId: "classics",
    resourceType: "中国故事变异名",
    canonicalTitle: "论语",
    translatedTitle: "Lao-ci' TAO TÖ KING（老子：道德经）",
    author: "孔子 / 老子",
    translator: "Paul Carus",
    language: "英语",
    country: "美国",
    city: "芝加哥",
    publisher: "Open Court",
    year: 1898,
    uploadedAt: "2025-08-19 11:45",
    uploader: "方心怡",
    summary: "以宗教比较和哲学阐释为核心的英译材料，可用于比较儒道典籍在英语世界中的知识分类方式。",
    tags: ["典籍比较", "英语译介", "思想史"],
    evidence: ["版本说明", "注释条目", "馆藏链接"],
    coordinates: { from: [116.4, 39.9], to: [-87.62, 41.88] },
    graphNodeIds: ["n-work-analects", "n-work-daodejing", "n-city-chicago"]
  },
  {
    id: "kb-003",
    status: "通过",
    sectionId: "stories",
    resourceType: "外文故事集",
    canonicalTitle: "白蛇传",
    translatedTitle: "Die wundersame Geschichte von der Donner-Gipfelpagode",
    author: "佚名 / 民间故事",
    translator: "Rainer Schwarz",
    language: "德语",
    country: "德国",
    city: "柏林",
    publisher: "Kinderbuchverlag",
    year: 1967,
    uploadedAt: "2025-07-10 20:49",
    uploader: "方心怡",
    summary: "白蛇传在德语儿童文学语境中的再讲述版本，保留雷峰塔母题并弱化宗教训诫色彩。",
    tags: ["民间故事", "儿童文学", "母题改写"],
    evidence: ["目录页", "插图页", "故事结尾"],
    coordinates: { from: [120.16, 30.25], to: [13.4, 52.52] },
    graphNodeIds: ["n-work-baishe", "n-trans-schwarz", "n-city-berlin"]
  },
  {
    id: "kb-004",
    status: "待审核",
    sectionId: "stories",
    resourceType: "外文翻译本",
    canonicalTitle: "中国民间故事选",
    translatedTitle: "Contes populaires chinois",
    author: "多位民间讲述者",
    translator: "Marie-Louise Tenèze",
    language: "法语",
    country: "法国",
    city: "里昂",
    publisher: "Éditions du Rhône",
    year: 1982,
    uploadedAt: "2026-03-02 14:12",
    uploader: "研究者用户",
    summary: "围绕孝义、机智人物与异类婚恋三个母题组织的法语故事集，适合做母题聚类和跨语种对读。",
    tags: ["母题聚类", "法语", "故事集"],
    evidence: ["馆藏记录", "译后记"],
    coordinates: { from: [104.06, 30.67], to: [4.84, 45.76] },
    graphNodeIds: ["n-work-folktales", "n-city-lyon"]
  },
  {
    id: "kb-005",
    status: "通过",
    sectionId: "shanghai",
    resourceType: "研究论文",
    canonicalTitle: "海派小说",
    translatedTitle: "Shanghai Modern: Urban Fiction in Translation",
    author: "研究中心课题组",
    translator: "资料编目",
    language: "中文",
    country: "中国",
    city: "上海",
    publisher: "上海外国语大学",
    year: 2026,
    uploadedAt: "2026-04-26 09:18",
    uploader: "管理员",
    summary: "梳理海派小说进入英语世界后的城市意象、女性书写和商业出版路径。",
    tags: ["上海文学", "城市书写", "英语传播"],
    evidence: ["参考文献", "译本目录", "评论摘录"],
    coordinates: { from: [121.47, 31.23], to: [-0.13, 51.51] },
    graphNodeIds: ["n-theme-shanghai", "n-city-shanghai", "n-city-london"]
  },
  {
    id: "kb-006",
    status: "通过",
    sectionId: "world-lit",
    resourceType: "专著章节",
    canonicalTitle: "左翼文学中的中国书写",
    translatedTitle: "China as Revolutionary Imagination",
    author: "Anna Seghers / 国际左翼作家",
    translator: "资料编目",
    language: "德语",
    country: "德国",
    city: "柏林",
    publisher: "Akademie Verlag",
    year: 1934,
    uploadedAt: "2026-02-11 16:22",
    uploader: "研究者用户",
    summary: "世界文学中的中国形象常与革命、苦难叙事和国际主义想象相连，可与中国故事集传播路径交叉分析。",
    tags: ["世界文学", "中国形象", "左翼文学"],
    evidence: ["章节摘要", "人物索引"],
    coordinates: { from: [116.4, 39.9], to: [13.4, 52.52] },
    graphNodeIds: ["n-theme-left", "n-city-berlin"]
  },
  {
    id: "kb-007",
    status: "通过",
    sectionId: "classics",
    resourceType: "外文译本",
    canonicalTitle: "论语",
    translatedTitle: "The Analects of Confucius",
    author: "孔子及其弟子",
    translator: "James Legge（理雅各）",
    language: "英语",
    country: "英国",
    city: "伦敦",
    publisher: "Trübner & Co.",
    year: 1861,
    uploadedAt: "2025-07-10 16:22",
    uploader: "方心怡",
    summary: "理雅各译本以注释、索引和训诂说明建立起英语世界理解《论语》的重要框架。",
    tags: ["理雅各", "注释策略", "英语译本"],
    evidence: ["序言", "注释样例", "索引"],
    coordinates: { from: [116.4, 39.9], to: [-0.13, 51.51] },
    graphNodeIds: ["n-work-analects", "n-trans-legge", "n-city-london"]
  },
  {
    id: "kb-008",
    status: "通过",
    sectionId: "world-lit",
    resourceType: "评论文献",
    canonicalTitle: "中国形象",
    translatedTitle: "The Chinese Garden in Modernist Travel Writing",
    author: "Virginia Woolf 研究资料",
    translator: "资料编目",
    language: "英语",
    country: "英国",
    city: "剑桥",
    publisher: "Cambridge Archive",
    year: 1925,
    uploadedAt: "2026-01-05 10:05",
    uploader: "研究者用户",
    summary: "旅行文学与现代主义文本中的中国园林意象，用于观测中国叙事在世界文学中的符号化。",
    tags: ["旅行文学", "中国园林", "现代主义"],
    evidence: ["档案摘录", "评论索引"],
    coordinates: { from: [120.16, 30.25], to: [0.12, 52.2] },
    graphNodeIds: ["n-theme-garden", "n-city-cambridge"]
  }
];

const generatedTargets = [
  ["classics", "外文译本", "论语", "Confucius Sinarum Philosophus", "Philippe Couplet", "拉丁语", "法国", "巴黎", "Daniel Horthemels", 1687, [2.35, 48.86], ["n-work-analects", "n-city-paris"]],
  ["classics", "外文译本", "道德经", "Le Livre de la voie et de la vertu", "Stanislas Julien", "法语", "法国", "巴黎", "Imprimerie Royale", 1842, [2.35, 48.86], ["n-work-daodejing", "n-city-paris"]],
  ["classics", "外文译本", "诗经", "The She King", "James Legge", "英语", "英国", "伦敦", "Trübner & Co.", 1871, [-0.13, 51.51], ["n-work-analects", "n-city-london"]],
  ["classics", "外文译本", "庄子", "Das wahre Buch vom südlichen Blütenland", "Richard Wilhelm", "德语", "德国", "耶拿", "Diederichs", 1912, [11.59, 50.93], ["n-work-daodejing", "n-city-berlin"]],
  ["classics", "外文译本", "史记", "Records of the Grand Historian", "Burton Watson", "英语", "美国", "纽约", "Columbia University Press", 1961, [-74.01, 40.71], ["n-work-analects", "n-city-chicago"]],
  ["stories", "外文故事集", "白蛇传", "The White Snake", "D. C. Lau", "英语", "英国", "伦敦", "Penguin", 1978, [-0.13, 51.51], ["n-work-baishe", "n-city-london"]],
  ["stories", "外文故事集", "聊斋志异", "Contes étranges du studio du loisir", "André Lévy", "法语", "法国", "巴黎", "Gallimard", 1985, [2.35, 48.86], ["n-work-folktales", "n-city-paris"]],
  ["stories", "外文故事集", "中国民间故事选", "Cuentos populares chinos", "Alicia Relinque", "西班牙语", "西班牙", "马德里", "Siruela", 1998, [-3.7, 40.42], ["n-work-folktales", "n-city-lyon"]],
  ["stories", "外文故事集", "孟姜女", "Meng Jiangnü", "Helwig Schmidt-Glintzer", "德语", "德国", "慕尼黑", "Hanser", 2005, [11.58, 48.14], ["n-work-folktales", "n-city-berlin"]],
  ["stories", "外文故事集", "中国神话", "Miti cinesi", "Paolo Santangelo", "意大利语", "意大利", "罗马", "Laterza", 2012, [12.5, 41.9], ["n-work-folktales", "n-city-lyon"]],
  ["shanghai", "研究论文", "海派小说", "Shanghai Fiction and Modernity", "Leo Ou-fan Lee", "英语", "美国", "剑桥", "Harvard University Press", 1999, [-71.11, 42.37], ["n-theme-shanghai", "n-city-london"]],
  ["shanghai", "评论文献", "上海书写", "Écrire Shanghai", "Isabelle Rabut", "法语", "法国", "巴黎", "CNRS", 2004, [2.35, 48.86], ["n-theme-shanghai", "n-city-paris"]],
  ["shanghai", "外文译本", "子夜", "Minuit", "Traducteur collectif", "法语", "法国", "巴黎", "Éditions You-Feng", 2008, [2.35, 48.86], ["n-theme-shanghai", "n-city-paris"]],
  ["shanghai", "外文译本", "长恨歌", "The Song of Everlasting Sorrow", "Michael Berry", "英语", "美国", "纽约", "Columbia University Press", 2008, [-74.01, 40.71], ["n-theme-shanghai", "n-city-chicago"]],
  ["world-lit", "专著章节", "中国形象", "China in German Literature", "Adrian Hsia", "英语", "加拿大", "多伦多", "University of Toronto Press", 1988, [-79.38, 43.65], ["n-theme-left", "n-city-cambridge"]],
  ["world-lit", "评论文献", "中国园林意象", "Le jardin chinois", "Muriel Détrie", "法语", "法国", "巴黎", "PUF", 1997, [2.35, 48.86], ["n-theme-garden", "n-city-paris"]],
  ["world-lit", "专著章节", "东方想象", "Oriental Imaginaries", "David Porter", "英语", "美国", "洛杉矶", "Stanford University Press", 2001, [-118.24, 34.05], ["n-theme-garden", "n-city-cambridge"]],
  ["world-lit", "评论文献", "旅行文学中的中国", "China im Reisebericht", "Sabine Dabringhaus", "德语", "德国", "柏林", "De Gruyter", 2016, [13.4, 52.52], ["n-theme-left", "n-city-berlin"]]
];

function generatedKnowledgeItems() {
  const years = [1600, 1687, 1720, 1765, 1804, 1833, 1842, 1861, 1871, 1898, 1912, 1925, 1934, 1940, 1956, 1961, 1967, 1978, 1982, 1985, 1991, 1998, 2001, 2005, 2008, 2012, 2016, 2020, 2023, 2026];
  return Array.from({ length: 72 }, (_, index) => {
    const seed = generatedTargets[index % generatedTargets.length];
    const year = years[index % years.length] + Math.floor(index / years.length);
    const [sectionId, resourceType, canonicalTitle, translatedTitle, translator, language, country, city, publisher, , to, graphNodeIds] = seed;
    const id = `kb-gen-${String(index + 1).padStart(3, "0")}`;
    return {
      id,
      status: index % 9 === 0 ? "待审核" : "通过",
      sectionId,
      resourceType,
      canonicalTitle,
      translatedTitle: `${translatedTitle}${index > generatedTargets.length ? ` · ${year}` : ""}`,
      author: sectionId === "classics" ? "中国典籍作者" : sectionId === "shanghai" ? "上海文学资料" : "跨文化资料",
      translator,
      language,
      country,
      city,
      publisher,
      year,
      uploadedAt: `2026-${String((index % 12) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")} 09:${String(index % 60).padStart(2, "0")}`,
      uploader: index % 3 === 0 ? "管理员" : index % 3 === 1 ? "方心怡" : "研究者用户",
      summary: `${canonicalTitle}相关资料在${year}年前后进入${city}的${language}知识网络，可用于观察译介、出版和接受的时间流变。`,
      tags: [resourceType, language, country],
      evidence: ["馆藏记录", "目录页", "题名页"],
      coordinates: { from: sectionId === "shanghai" ? [121.47, 31.23] : canonicalTitle === "白蛇传" ? [120.16, 30.25] : [116.4, 39.9], to },
      graphNodeIds
    };
  });
}

export const mockKnowledgeItems = [...baseKnowledgeItems, ...generatedKnowledgeItems()];

export const mockMapFlows = mockKnowledgeItems.map((item) => ({
  id: item.id,
  title: item.translatedTitle,
  sectionId: item.sectionId,
  resourceType: item.resourceType,
  language: item.language,
  year: item.year,
  from: item.coordinates.from,
  to: item.coordinates.to,
  fromLabel: item.sectionId === "shanghai" ? "上海" : item.canonicalTitle === "白蛇传" ? "杭州" : "中国",
  toLabel: `${item.city} · ${item.country}`,
  weight: item.status === "通过" ? 1 : 0.55
}));

export function buildSmartAnswer({ question = "", sectionId = "classics", model = "gpt-4.1", provider = "gpt", retrievalMode = "graph-rag", recordId = "" } = {}) {
  const normalized = question.toLowerCase();
  const section = mockSections.find((item) => item.id === sectionId) || mockSections[0];
  const baseItems = mockKnowledgeItems.filter((item) => item.sectionId === section.id);
  const explicitItem = mockKnowledgeItems.find((item) => item.id === recordId);
  const keywordItem = mockKnowledgeItems.find((item) => normalized.includes(item.canonicalTitle.toLowerCase()) || normalized.includes(item.translatedTitle.toLowerCase()));
  const targetItems = explicitItem ? [explicitItem, ...baseItems.filter((item) => item.id !== explicitItem.id).slice(0, 2)] : keywordItem ? [keywordItem, ...baseItems.filter((item) => item.id !== keywordItem.id).slice(0, 2)] : baseItems.slice(0, 4);
  const wantsMap = /地图|传播|路线|国家|出版地|地理|map|route/.test(normalized);
  const wantsGraph = /图谱|关系|网络|关联|graph|graphrag|路径/.test(normalized) || retrievalMode === "graph-rag";
  const wantsStats = /统计|数量|趋势|top|分布/.test(normalized);
  const providerName = modelProviders.find((item) => item.id === provider)?.name || "OpenAI GPT";
  const citations = targetItems.map((item) => `${item.resourceType}｜${item.translatedTitle}｜${item.city}，${item.year}`);
  const visualType = wantsStats ? "stats" : wantsMap && !wantsGraph ? "map" : wantsGraph && wantsMap ? "mixed" : wantsGraph ? "graph" : "text";

  return {
    answer: `已使用 ${providerName} / ${model}，按 ${retrievalMode === "graph-rag" ? "GraphRAG" : "RAG"} 流程检索「${section.title}」。系统先从上传条目中召回 ${targetItems.length} 条资料，再抽取作品、译者、出版地、语种与时间关系。就“${question || section.title}”而言，当前最关键的线索是：${targetItems.map((item) => `${item.canonicalTitle}在${item.year}年前后经${item.city}形成${item.language}传播节点`).join("；")}。`,
    citations,
    retrieval: {
      provider,
      providerName,
      model,
      mode: retrievalMode,
      confidence: wantsGraph ? 0.86 : 0.78,
      steps: ["语义召回", "元数据过滤", "实体消歧", retrievalMode === "graph-rag" ? "子图扩展" : "证据重排", "回答生成"]
    },
    visuals: {
      type: visualType,
      records: targetItems.map((item) => item.id),
      graph: {
        focusNodeIds: [...new Set(targetItems.flatMap((item) => item.graphNodeIds))],
        title: wantsGraph ? `${section.title}关联子图` : ""
      },
      map: {
        flows: mockMapFlows.filter((flow) => targetItems.some((item) => item.id === flow.id)),
        title: wantsMap ? `${section.title}传播地图` : ""
      }
    }
  };
}

export const mockGraph = {
  nodes: [
    { id: "n-work-tiangkong", label: "天工开物", type: "规范故事名", section: "classics", year: 1637, lang: "中文", x: 0.17, y: 0.28, size: 20 },
    { id: "n-trans-julien", label: "Stanislas Julien", type: "作者/译者", section: "classics", year: 1833, lang: "法语", x: 0.34, y: 0.2, size: 16 },
    { id: "n-city-paris", label: "巴黎", type: "出版地", section: "classics", year: 1833, lang: "法语", x: 0.52, y: 0.22, size: 17 },
    { id: "n-work-analects", label: "论语", type: "规范故事名", section: "classics", year: 1861, lang: "英语", x: 0.22, y: 0.5, size: 21 },
    { id: "n-trans-legge", label: "James Legge", type: "作者/译者", section: "classics", year: 1861, lang: "英语", x: 0.39, y: 0.56, size: 16 },
    { id: "n-work-daodejing", label: "道德经", type: "参照文本", section: "classics", year: 1898, lang: "英语", x: 0.2, y: 0.72, size: 16 },
    { id: "n-city-chicago", label: "芝加哥", type: "出版地", section: "classics", year: 1898, lang: "英语", x: 0.45, y: 0.75, size: 15 },
    { id: "n-city-london", label: "伦敦", type: "出版地", section: "shanghai", year: 1940, lang: "英语", x: 0.68, y: 0.36, size: 18 },
    { id: "n-theme-shanghai", label: "海派小说", type: "主题", section: "shanghai", year: 1935, lang: "中文", x: 0.78, y: 0.22, size: 22 },
    { id: "n-city-shanghai", label: "上海", type: "出版地", section: "shanghai", year: 2026, lang: "中文", x: 0.86, y: 0.42, size: 17 },
    { id: "n-work-baishe", label: "白蛇传", type: "规范故事名", section: "stories", year: 1967, lang: "德语", x: 0.58, y: 0.55, size: 23 },
    { id: "n-trans-schwarz", label: "Rainer Schwarz", type: "作者/译者", section: "stories", year: 1967, lang: "德语", x: 0.76, y: 0.64, size: 16 },
    { id: "n-city-berlin", label: "柏林", type: "出版地", section: "stories", year: 1967, lang: "德语", x: 0.88, y: 0.68, size: 18 },
    { id: "n-work-folktales", label: "中国民间故事选", type: "外文故事集", section: "stories", year: 1982, lang: "法语", x: 0.62, y: 0.82, size: 17 },
    { id: "n-city-lyon", label: "里昂", type: "出版地", section: "stories", year: 1982, lang: "法语", x: 0.8, y: 0.88, size: 14 },
    { id: "n-theme-left", label: "左翼文学中的中国", type: "主题", section: "world-lit", year: 1934, lang: "德语", x: 0.34, y: 0.86, size: 18 },
    { id: "n-theme-garden", label: "中国园林意象", type: "主题", section: "world-lit", year: 1925, lang: "英语", x: 0.54, y: 0.9, size: 16 },
    { id: "n-city-cambridge", label: "剑桥", type: "出版地", section: "world-lit", year: 1925, lang: "英语", x: 0.68, y: 0.88, size: 14 }
  ],
  edges: [
    { from: "n-work-tiangkong", to: "n-trans-julien", relation: "翻译", note: "工艺知识通过汉学译者进入法语世界" },
    { from: "n-trans-julien", to: "n-city-paris", relation: "出版", note: "巴黎形成早期欧洲知识流通节点" },
    { from: "n-work-analects", to: "n-trans-legge", relation: "翻译", note: "注释策略塑造英语世界的儒学理解" },
    { from: "n-trans-legge", to: "n-city-london", relation: "出版", note: "伦敦出版网络承接传教士汉学材料" },
    { from: "n-work-analects", to: "n-work-daodejing", relation: "互文参照", note: "儒道典籍在比较宗教语境中被共同阐释" },
    { from: "n-work-daodejing", to: "n-city-chicago", relation: "再阐释", note: "芝加哥出版节点连接比较宗教与东方哲学" },
    { from: "n-theme-shanghai", to: "n-city-shanghai", relation: "资料生成", note: "本地研究与上传数据形成源头节点" },
    { from: "n-theme-shanghai", to: "n-city-london", relation: "海外传播", note: "海派文学进入英语出版与评论网络" },
    { from: "n-work-baishe", to: "n-trans-schwarz", relation: "改写", note: "民间传说在儿童文学中发生叙事调适" },
    { from: "n-trans-schwarz", to: "n-city-berlin", relation: "出版", note: "柏林节点聚集德语故事集与世界文学材料" },
    { from: "n-work-folktales", to: "n-city-lyon", relation: "编译", note: "法语故事集按母题组织中国民间材料" },
    { from: "n-work-baishe", to: "n-work-folktales", relation: "母题关联", note: "异类婚恋、救赎、塔禁等母题可跨文本追踪" },
    { from: "n-theme-left", to: "n-city-berlin", relation: "思想传播", note: "左翼中国叙事与德语出版网络关联" },
    { from: "n-theme-garden", to: "n-city-cambridge", relation: "档案记录", note: "中国园林意象进入现代主义旅行文学研究" },
    { from: "n-theme-left", to: "n-work-baishe", relation: "形象比较", note: "世界文学中国形象与民间故事传播可进行跨库比较" }
  ]
};
