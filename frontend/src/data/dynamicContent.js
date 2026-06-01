import { aboutImages } from "./aboutImageManifest.js";

const PERSON_NAMES = [
  "张帆",
  "胡文婷",
  "童欣",
  "尹兰曦",
  "朱伟芳",
  "张天资",
  "张永维",
  "崔钰",
  "余晴",
  "葛桂录",
  "高方",
  "谭渊",
  "刘志强",
  "陈琦",
  "周琼",
  "唐珂",
  "徐林峰",
  "何心怡",
  "刘启君",
  "张丽",
  "唐洁",
  "陈悦",
  "高鸽",
  "陈雨田",
  "徐冠群",
  "段亚男",
  "陈丽竹"
];

export function detailHref(kind, id) {
  return `/#detail/${kind}/${id}`;
}

export function imageUrl(filename) {
  return `/assets/about/image/${encodeURIComponent(filename)}`;
}

export function imageTitle(filename) {
  return filename.replace(/\.(png|jpe?g|webp)$/i, "").replace(/\s+/g, " ").replace(/[，,。.\s]+$/g, "");
}

function isPersonImage(filename) {
  const title = imageTitle(filename);
  return PERSON_NAMES.some((name) => title.includes(name)) && !/[。，“”《》：:]/.test(title);
}

function dynamicType(title) {
  if (/会议|讲座|读书会|驻访/.test(title)) return "学术活动";
  if (/丛书|专著|译著|出版|专栏/.test(title)) return "成果转化";
  if (/课程|人才培养/.test(title)) return "人才培养";
  if (/论文|课题|项目/.test(title)) return "科研进展";
  if (/话语传播|新媒体|官方网站/.test(title)) return "话语传播";
  return "平台动态";
}

function dynamicTopic(title) {
  if (/会议|讲座|读书会|课程|人才培养/.test(title)) return "focus";
  if (/丛书|专著|译著|论文|课题|项目|专栏/.test(title)) return "research";
  if (/话语传播|新媒体|官方网站|社会影响/.test(title)) return "media";
  return "focus";
}

function dynamicRank(filename) {
  const title = imageTitle(filename);
  const priorities = [
    "2024年，研究中心主办",
    "举办“国别区域",
    "开展“思想",
    "中国文学海外译介研究丛书",
    "研究中心博士后出版",
    "研究中心依托教育部",
    "研究中心在综合性",
    "研究中心成员受邀",
    "研究中心成员参加",
    "2024年，研究中心成员开设",
    "话语传播",
    "人才培养",
    "项目",
    "论文",
    "专著"
  ];
  const index = priorities.findIndex((keyword) => title.includes(keyword));
  return index === -1 ? 99 : index;
}

export const dynamicItems = aboutImages
  .filter((filename) => !isPersonImage(filename))
  .sort((a, b) => dynamicRank(a) - dynamicRank(b))
  .map((filename, index) => {
    const title = imageTitle(filename);
    return {
      id: encodeURIComponent(filename),
      filename,
      title,
      type: dynamicType(title),
      topic: dynamicTopic(title),
      image: imageUrl(filename),
      date: "2024",
      summary: title
    };
  });

export function findDynamicItem(id) {
  const decoded = decodeURIComponent(id || "");
  return dynamicItems.find((item) => item.id === id || item.filename === decoded || item.id === encodeURIComponent(decoded));
}

export const topicContent = {
  focus: {
    title: "专题聚焦",
    type: "专题栏目",
    summary: "围绕中心讲座、读书会、课程建设与人才培养，呈现中国故事和世界文学研究的关键现场。"
  },
  research: {
    title: "综合研究",
    type: "研究栏目",
    summary: "整合课题、论文、丛书、专栏与出版成果，集中展示跨语种、跨区域学术研究进展。"
  },
  media: {
    title: "媒体关注",
    type: "传播栏目",
    summary: "汇集官方网站、新媒体矩阵与社会传播成果，展示研究中心的公共影响力。"
  }
};
