import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { aboutImages } from "../data/aboutImageManifest.js";

const TEXT_URL = "/assets/about/pasted-text.txt";
const SCHOLAR_XLSX_URL = "/assets/学者.xlsx";

const SECTION_HEADINGS = [
  "研究中心简介",
  "年度工作报告",
  "学术委员会",
  "专家学者（本院学者）",
  "专家学者（特聘专家）",
  "专家学者（双聘研究员）",
  "专家学者（兼职研究员）",
  "联系我们"
];

const METRICS = [
  { value: "17+", label: "在研课题" },
  { value: "22", label: "论文成果" },
  { value: "8", label: "A&HCI / CSSCI" },
  { value: "3", label: "国内会议" },
  { value: "10000+", label: "数据条目" },
  { value: "39", label: "覆盖语种" },
  { value: "60", label: "国家和地区" },
  { value: "300+", label: "协作团队" }
];

const TEAM_CATEGORIES = ["本院学者", "特聘专家", "双聘研究员", "兼职研究员"];

const OVERVIEW_IMAGES = [
  "论文.png",
  "论文1.png",
  "项目.png",
  "研究中心在综合性人文期刊《中国故事》开设固定专栏“中国故事的世界传播”。.png"
];

const TEAM = [
  {
    name: "张帆",
    slug: "zhang-fan",
    category: "本院学者",
    role: "二级教授 / 博士生导师 / 中心主任",
    organization: "上海外国语大学",
    focus: ["德语文学", "比较文学", "世界文学"],
    intro: "长期从事中国话语、世界文学与中国文学海外传播研究。",
    image: "张帆.jpg"
  },
  {
    name: "胡文婷",
    slug: "hu-wenting",
    category: "本院学者",
    role: "副教授",
    organization: "上海外国语大学",
    focus: ["海外汉学", "译介研究", "比较文学"],
    intro: "关注中国文学跨语种译介、海外汉学与比较文学研究。",
    image: "胡文婷.jpg"
  },
  {
    name: "童欣",
    slug: "tong-xin",
    category: "本院学者",
    role: "助理研究员",
    organization: "上海外国语大学",
    focus: ["记忆研究", "中国故事传播", "数字人文"],
    intro: "围绕文本记忆、跨文化传播与数字人文方法开展研究。",
    image: "童欣.jpg"
  },
  {
    name: "尹兰曦",
    slug: "yin-lanxi",
    category: "本院学者",
    role: "博士后",
    organization: "上海外国语大学",
    focus: ["莎士比亚戏剧", "修辞学", "批评话语"],
    intro: "研究莎士比亚戏剧、修辞观嬗变与中国莎士比亚批评话语。",
    image: "尹兰曦.jpg"
  },
  {
    name: "朱伟芳",
    slug: "zhu-weifang",
    category: "特聘专家",
    role: "特聘专家",
    organization: "中国话语与世界文学研究中心",
    focus: ["世界文学", "跨文化阐释"],
    intro: "参与中心世界文学与跨文化阐释方向研究。",
    image: "朱伟芳.jpg"
  },
  {
    name: "张天资",
    slug: "zhang-tianzi",
    category: "特聘专家",
    role: "特聘专家",
    organization: "中国话语与世界文学研究中心",
    focus: ["比较文学", "译介传播"],
    intro: "关注比较文学视野下的文本传播与话语转化。",
    image: "张天资.jpg"
  },
  {
    name: "张永维",
    slug: "zhang-yongwei",
    category: "双聘研究员",
    role: "双聘研究员",
    organization: "中国话语与世界文学研究中心",
    focus: ["外国文学", "区域国别研究"],
    intro: "参与外国文学与区域国别研究方向建设。",
    image: "张永维.jpg"
  },
  {
    name: "崔钰",
    slug: "cui-yu",
    category: "兼职研究员",
    role: "兼职研究员",
    organization: "中国话语与世界文学研究中心",
    focus: ["文学传播", "文化记忆"],
    intro: "研究文学传播、文化记忆与中国叙事的跨文化流动。",
    image: "崔钰.png"
  },
  {
    name: "余晴",
    slug: "yu-qing",
    category: "兼职研究员",
    role: "兼职研究员",
    organization: "中国话语与世界文学研究中心",
    focus: ["世界文学", "中国叙事"],
    intro: "关注世界文学中的中国叙事与跨语境阐释。",
    image: "余晴.jpg"
  }
];

const SLUG_BY_NAME = {
  张帆: "zhang-fan",
  胡文婷: "hu-wenting",
  童欣: "tong-xin",
  尹兰曦: "yin-lanxi",
  朱伟芳: "zhu-weifang",
  张天资: "zhang-tianzi",
  张永维: "zhang-yongwei",
  崔钰: "cui-yu",
  余晴: "yu-qing",
  葛桂录: "ge-guilu",
  高方: "gao-fang",
  谭渊: "tan-yuan",
  刘志强: "liu-zhiqiang",
  陈琦: "chen-qi",
  周琼: "zhou-qiong",
  唐珂: "tang-ke",
  刘启君: "liu-qijun"
};

const CATEGORY_BY_NAME = {
  张帆: "本院学者",
  胡文婷: "本院学者",
  童欣: "本院学者",
  尹兰曦: "本院学者",
  朱伟芳: "本院学者",
  张天资: "本院学者",
  张永维: "本院学者",
  崔钰: "本院学者",
  余晴: "本院学者",
  葛桂录: "特聘专家",
  高方: "特聘专家",
  谭渊: "特聘专家",
  刘志强: "特聘专家",
  陈琦: "双聘研究员",
  周琼: "兼职研究员",
  唐珂: "兼职研究员",
  刘启君: "兼职研究员"
};

const PERSON_DETAILS = {
  "zhang-fan": {
    basic:
      "张帆（1977.9-），二级教授、博士生导师、博士后合作导师。上海外国语大学文学研究院院长、中国话语与世界文学研究中心主任；上外德语系、上海全球治理与区域国别研究院双聘教授。",
    direction: "现从事德语文学研究、比较文学与世界文学研究。",
    profile: [
      "教育部哲学社会科学研究重大课题攻关项目首席专家，入选国家“万人计划”哲学社会科学领军人才、中宣部文化名家暨“四个一批”人才、国家“万人计划”青年拔尖人才、教育部“新世纪优秀人才”、上海市“曙光学者”“浦江人才”“晨光学者”。入选2020年中国哲学社会科学研究最有影响力学者榜单。",
      "兼任国家教材委外语学科专家委员会委员、中国德语文学学会理事、中国比较文学学会理事、上海市外国文学学会理事、上海市比较文学学会理事、上海市松江区人大代表、国家社科基金项目评审专家、教育部人文社科研究项目评审专家、教育部长江学者通讯评审专家等。在德国洪堡大学、柏林自由大学、慕尼黑大学、海德堡大学、弗莱堡大学、拜罗伊特大学等留学、访学和客座讲学。"
    ],
    achievements: {
      projects: [
        "主持教育部哲学社会科学研究重大课题攻关项目。",
        "主持3项国家社科基金项目及省部级等项目十余项。",
        "主持国家级一流本科课程、上海市教委重点课程。"
      ],
      books: [
        "出版学术专著3部，译著11部。",
        "主编“中国话语与世界文学研究”“中国文学海外译介研究”“德语文学经典研究”“德语上海小说翻译与研究”系列丛书。",
        "主（参）编国家级规划教材3部，获教育部精品教材、上海市精品教材。"
      ],
      papers: [
        "发表中、德、英文论文80余篇。"
      ],
      honors: [
        "国家“万人计划”哲学社会科学领军人才。",
        "中宣部文化名家暨“四个一批”人才。",
        "国家“万人计划”青年拔尖人才。",
        "教育部“新世纪优秀人才”。",
        "上海市“曙光学者”“浦江人才”“晨光学者”。",
        "2020年中国哲学社会科学研究最有影响力学者。",
        "国家级教学成果奖二等奖、上海市优秀教学成果奖一等奖。",
        "全国“宝钢优秀教师奖”、上海市育才奖。"
      ]
    },
    contact: [
      { label: "电子邮件", value: "zhfan@aliyun.com", href: "mailto:zhfan@aliyun.com" }
    ]
  }
};

const COMMITTEE = [
  { name: "许钧", org: "浙江大学", role: "主任委员" },
  { name: "查明建", org: "上海外国语大学", role: "委员" },
  { name: "金莉", org: "北京外国语大学", role: "委员" },
  { name: "聂珍钊", org: "广东外语外贸大学", role: "委员" },
  { name: "王克非", org: "北京外国语大学", role: "委员" },
  { name: "杨平", org: "专家委员", role: "委员" },
  { name: "杨金才", org: "南京大学", role: "委员" },
  { name: "彭青龙", org: "上海交通大学", role: "委员" },
  { name: "宋炳辉", org: "上海外国语大学", role: "委员" },
  { name: "梁展", org: "中国社会科学院", role: "委员" },
  { name: "苏晖", org: "上海外国语大学", role: "委员" },
  { name: "张帆", org: "上海外国语大学", role: "委员", image: "张帆.jpg" }
];

const PUBLICATIONS = [
  {
    title: "中国文学海外译介研究丛书",
    meta: "上海大学出版社 / 2024",
    image: "“中国文学海外译介研究丛书”（丛书主编：张帆、孙国亮）由上海大学出版社出版，2024年首推2部。.png"
  },
  {
    title: "博士后专著和译著",
    meta: "专著译著 / 3 部",
    image: "研究中心博士后出版专著和译著共计3部。.jpg"
  },
  {
    title: "中国故事的世界传播与流变",
    meta: "《国际汉学》特约专栏",
    image: "研究中心依托教育部重大课题，在CSSCI来源期刊《国际汉学》开设特约专栏“中国故事的世界传播与流变”。.png"
  },
  {
    title: "中国故事的世界传播",
    meta: "《中国故事》固定专栏",
    image: "研究中心在综合性人文期刊《中国故事》开设固定专栏“中国故事的世界传播”。.png"
  }
];

const ACTIVITIES = [
  {
    title: "主办国内学术会议",
    type: "学术会议",
    date: "2024",
    image: "2024年，研究中心主办3次国内学术会议，参会总人数近150人次。.png"
  },
  {
    title: "国别区域全球知识前沿讲坛",
    type: "前沿讲坛",
    date: "2024",
    image: "举办“国别区域全球知识前沿讲坛·中国话语与世界文学研究中心系列讲座”。.png"
  },
  {
    title: "文学经典的跨文化旅行读书会",
    type: "读书会",
    date: "2024",
    image: "开展“思想·诠释·对话：文学经典的跨文化旅行”主题系列读书会。1.png"
  },
  {
    title: "国内外学术会议论文宣读",
    type: "国际交流",
    date: "2024",
    image: "研究中心成员参加国内外学术会议并宣读论文24篇。.png"
  },
  {
    title: "成员受邀学术讲座",
    type: "前沿讲坛",
    date: "2024",
    image: "研究中心成员受邀在国内高校及文化机构进行学术讲座11次。.jpg"
  }
];

const SOCIAL_IMPACT =
  "研究中心充分发挥新媒体作用，开发并上线官方网站，构建微信公众号、微信视频号、B站、小红书、抖音等社交媒体矩阵，微信公众号自上线以来已推送近300篇推文，其中原创推文123篇，累计订阅粉丝逾2500人，总阅读量近94700人次，单篇推文最高阅读量近3000人次。";

function imageUrl(filename) {
  return `/assets/about/image/${encodeURIComponent(filename)}`;
}

function imageTitle(filename) {
  return filename.replace(/\.(png|jpe?g|webp)$/i, "").replace(/\s+/g, " ").replace(/[，。,.]+$/g, "");
}

function cleanCell(value) {
  const text = String(value || "").trim();
  return text && text !== "—" ? text : "";
}

function splitNumbered(value) {
  const text = cleanCell(value);
  if (!text) return [];
  return text
    .replace(/(\d+[）).])/g, "\n$1")
    .split(/\n+/)
    .map((item) => item.trim().replace(/^\d+[）).]\s*/, ""))
    .filter(Boolean);
}

function findScholarImage(name) {
  return aboutImages.find((filename) => imageTitle(filename).startsWith(name)) || `${name}.jpg`;
}

function scholarCategory(name, role) {
  if (CATEGORY_BY_NAME[name]) return CATEGORY_BY_NAME[name];
  if (/特聘/.test(role)) return "特聘专家";
  if (/双聘/.test(role)) return "双聘研究员";
  return "兼职研究员";
}

function contactItems(value) {
  const text = cleanCell(value);
  if (!text) return [];
  const normalized = text.replace(/(\.(?:com|cn|edu|org|net))(?!\s|$)/gi, "$1 ");
  const emails = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  if (emails?.length) {
    return emails.map((email) => ({ label: "电子邮件", value: email, href: `mailto:${email}` }));
  }
  return [{ label: "联系方式", value: text }];
}

function scholarIntro(basicItems, focusItems) {
  return basicItems[0] || (focusItems.length ? `研究方向：${focusItems.join("、")}` : "相关简介待补充。");
}

function parseScholarRows(rows) {
  return rows
    .map((row) => {
      const name = cleanCell(row["姓名"]);
      if (!name) return null;
      const role = cleanCell(row["职称/身份"]) || "研究人员";
      const focus = splitNumbered(row["研究方向"]);
      const basic = splitNumbered(row["基本信息（教育背景等）"]);
      const projects = splitNumbered(row["课题项目"]);
      const books = splitNumbered(row["著作出版"]);
      const papers = splitNumbered(row["论文发表"]);
      const honors = splitNumbered(row["荣誉奖项"]);
      const contact = contactItems(row["联系方式"]);
      return {
        name,
        slug: SLUG_BY_NAME[name] || encodeURIComponent(name),
        category: scholarCategory(name, role),
        role,
        organization: basic.find((item) => /大学|研究中心|研究院|学院/.test(item)) || "中国话语与世界文学研究中心",
        focus,
        intro: scholarIntro(basic, focus),
        image: findScholarImage(name),
        detail: {
          basic,
          direction: focus,
          profile: [],
          achievements: { projects, books, papers, honors },
          contact
        }
      };
    })
    .filter(Boolean);
}

function splitParagraphs(content) {
  return String(content || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSections(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const sections = [];
  let current = { title: "目录", content: [] };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (SECTION_HEADINGS.includes(trimmed)) {
      if (current.content.some((item) => item.trim())) sections.push(current);
      current = { title: trimmed, content: [] };
      return;
    }
    current.content.push(line);
  });

  if (current.content.some((item) => item.trim())) sections.push(current);
  return sections.map((section) => ({
    ...section,
    id: section.title.replace(/[^\u4e00-\u9fffA-Za-z0-9]/g, "-"),
    text: section.content.join("\n").trim()
  }));
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPersonProfile(person, rawText) {
  if (!rawText || !person) return "";
  const teamStart = rawText.indexOf("专家学者（本院学者）");
  const from = teamStart > -1 ? teamStart : 0;
  const body = rawText.slice(from);
  const pattern = new RegExp(`(^|\\n)\\s*${escapeRegExp(person.name)}(?=[\\s\\n，,：:（(])`);
  const match = body.search(pattern);
  const start = match > -1 ? from + match : rawText.indexOf(person.name, from);
  if (start < 0) return "";

  const tail = rawText.slice(start + person.name.length);
  const nextPeople = TEAM.filter((item) => item.name !== person.name)
    .map((item) => {
      const next = tail.search(new RegExp(`\\n\\s*${escapeRegExp(item.name)}(?=[\\s\\n，,：:（(])`));
      return next > -1 ? start + person.name.length + next : -1;
    });
  const nextSections = SECTION_HEADINGS.map((heading) => {
    const next = tail.indexOf(`\n${heading}`);
    return next > -1 ? start + person.name.length + next : -1;
  });
  const indexes = [...nextPeople, ...nextSections].filter((index) => index > start);
  const end = indexes.length ? Math.min(...indexes) : rawText.length;
  return rawText.slice(start, end).trim();
}

function section(sections, title) {
  return sections.find((item) => item.title === title);
}

function profileSummary(text) {
  return "依托上海外国语大学，中心以教育部哲学社会科学研究重大课题攻关项目为牵引，聚焦中国话语、世界文学、跨语种译介与数字人文方法，建设兼具学术研究、人才培养和国际传播功能的开放型研究平台。";
}

function Modal({ item, onClose }) {
  if (!item) return null;
  return (
    <div className="about-modal-backdrop" onClick={onClose} role="presentation">
      <section className="about-modal about-doc-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <button className="about-modal-close" type="button" onClick={onClose} aria-label="关闭">×</button>
        <div className="about-modal-kicker">{item.kicker}</div>
        <h2>{item.title}</h2>
        {item.image ? <img className="about-modal-image" src={item.image} alt={item.title} /> : null}
        <div className="about-modal-text">
          {splitParagraphs(item.text).map((paragraph, index) => (
            <p key={`${item.title}-${index}`}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionHeader({ number, title, summary, action, href }) {
  return (
    <div className="about-line-heading">
      <div>
        {number ? <span>{number}</span> : null}
        <h2>{title}</h2>
        {summary ? <p>{summary}</p> : null}
      </div>
      {href ? <a href={href}>更多 &gt;</a> : action}
    </div>
  );
}

function Metrics() {
  return (
    <section className="about-metric-wall about-module-metrics" aria-label="发展成果">
      {METRICS.map((metric) => (
        <article key={metric.label}>
          <strong>{metric.value}</strong>
          <span>{metric.label}</span>
        </article>
      ))}
    </section>
  );
}

function TeamCards({ people = TEAM, compact = false }) {
  return (
    <div className={compact ? "about-team-card-grid compact" : "about-team-card-grid"}>
      {people.map((person) => (
        <a key={person.slug} className="about-team-card" href={`#about/team/${person.slug}`} target="_blank" rel="noreferrer">
          <div className="about-team-photo-shell">
            <img src={imageUrl(person.image)} alt={person.name} loading="lazy" />
          </div>
          <strong>{person.name}</strong>
          <span>{person.role}</span>
          <em>{person.focus.join("｜")}</em>
          <p>{person.intro}</p>
          <b>查看详情</b>
        </a>
      ))}
    </div>
  );
}

function TeamCarousel({ people = TEAM }) {
  const trackRef = useRef(null);

  const scrollByCards = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector(".about-team-carousel-card");
    const cardWidth = card ? card.offsetWidth : 240;
    const gap = 24;
    track.scrollBy({ left: direction * (cardWidth + gap) * 4, behavior: "smooth" });
  };

  return (
    <div className="about-team-carousel">
      <button type="button" className="about-team-carousel-nav" aria-label="上一页" onClick={() => scrollByCards(-1)}>
        ‹
      </button>
      <div className="about-team-carousel-track" ref={trackRef}>
        {people.map((person) => (
          <a key={person.slug} className="about-team-carousel-card" href={`#about/team/${person.slug}`}>
            <div className="about-team-carousel-banner" aria-hidden="true" />
            <div className="about-team-carousel-avatar">
              <img src={imageUrl(person.image)} alt={person.name} loading="lazy" />
            </div>
            <div className="about-team-carousel-body">
              <strong>{person.name}</strong>
              <span>{person.role}</span>
              <em>{person.organization}</em>
            </div>
          </a>
        ))}
      </div>
      <button type="button" className="about-team-carousel-nav" aria-label="下一页" onClick={() => scrollByCards(1)}>
        ›
      </button>
    </div>
  );
}

function OverviewCarousel({ images = OVERVIEW_IMAGES }) {
  const trackRef = useRef(null);

  const scrollByItem = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const item = track.querySelector(".about-overview-carousel-item");
    const itemWidth = item ? item.offsetWidth : 260;
    const gap = 16;
    track.scrollBy({ left: direction * (itemWidth + gap), behavior: "smooth" });
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      scrollByItem(1);
    }, 4200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="about-overview-carousel">
      <button type="button" className="about-overview-carousel-nav" aria-label="上一张" onClick={() => scrollByItem(-1)}>
        ‹
      </button>
      <div className="about-overview-carousel-track" ref={trackRef}>
        {images.map((image) => (
          <div key={image} className="about-overview-carousel-item">
            <img src={imageUrl(image)} alt={imageTitle(image)} loading="lazy" />
          </div>
        ))}
      </div>
      <button type="button" className="about-overview-carousel-nav" aria-label="下一张" onClick={() => scrollByItem(1)}>
        ›
      </button>
    </div>
  );
}

function CommitteeCarousel({ people = COMMITTEE }) {
  const trackRef = useRef(null);

  const scrollByCards = (direction) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector(".about-team-carousel-card");
    const cardWidth = card ? card.offsetWidth : 240;
    const gap = 24;
    track.scrollBy({ left: direction * (cardWidth + gap) * 4, behavior: "smooth" });
  };

  return (
    <div className="about-team-carousel about-committee-carousel">
      <button type="button" className="about-team-carousel-nav" aria-label="上一页" onClick={() => scrollByCards(-1)}>
        ‹
      </button>
      <div className="about-team-carousel-track" ref={trackRef}>
        {people.map((person) => (
          <a key={person.name} className="about-team-carousel-card committee" href="#about/committee">
            <div className="about-team-carousel-banner" aria-hidden="true" />
            <div className="about-team-carousel-avatar text">
              <span>{person.name.slice(0, 1)}</span>
            </div>
            <div className="about-team-carousel-body">
              <strong>{person.name}</strong>
              <span>{person.role}</span>
              <em>{person.org}</em>
            </div>
          </a>
        ))}
      </div>
      <button type="button" className="about-team-carousel-nav" aria-label="下一页" onClick={() => scrollByCards(1)}>
        ›
      </button>
    </div>
  );
}

function CommitteePreview() {
  return (
    <div className="about-committee-grid">
      {COMMITTEE.slice(0, 6).map((person) => (
        <a key={person.name} className="about-committee-card" href="#about/committee">
          <strong>{person.name}</strong>
          <span>{person.org}</span>
          <em>{person.role}</em>
        </a>
      ))}
    </div>
  );
}

function PublicationGrid({ limit }) {
  const list = limit ? PUBLICATIONS.slice(0, limit) : PUBLICATIONS;
  return (
    <div className="about-publication-grid">
      {list.map((item) => (
        <article key={item.title}>
          <img src={imageUrl(item.image)} alt={item.title} loading="lazy" />
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
        </article>
      ))}
    </div>
  );
}

function ActivityGrid({ limit }) {
  const list = limit ? ACTIVITIES.slice(0, limit) : ACTIVITIES;
  return (
    <div className="about-activity-grid">
      {list.map((item) => (
        <article key={item.title}>
          <img src={imageUrl(item.image)} alt={item.title} loading="lazy" />
          <div>
            <strong>{item.title}</strong>
            <span>{item.type} / {item.date}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ContactBlock({ contactText }) {
  return (
    <section className="about-contact-direct">
      <div className="about-contact-copy">
        <h2>联系我们</h2>
        <dl>
          <dt>电子邮件</dt>
          <dd><a href="mailto:worldliterature@shisu.edu.cn">worldliterature@shisu.edu.cn</a></dd>
          <dt>来访地址</dt>
          <dd>上海外国语大学松江校区文翔路1550号 小别墅21号</dd>
          <dt>友情链接</dt>
          <dd>
            <a href="https://www.shisu.edu.cn/" target="_blank" rel="noreferrer">上海外国语大学官网</a>
            <a href="#home">上海全球治理与区域国别研究院官网</a>
          </dd>
        </dl>
        {/* 按需求：不在“联系我们”块内展示长段文字与文档原文 */}
      </div>
      <img src={imageUrl("研究中心充分发挥新媒体作用，开发并上线官方网站，构建微信公众号、微信视频号、B站、小红书、抖音等社交媒体矩阵，.jpg")} alt="研究中心新媒体传播矩阵" loading="lazy" />
    </section>
  );
}

function Overview({ sections, setActive, team = TEAM }) {
  const profile = section(sections, "研究中心简介");
  const overviewPillars = [
    ["话语体系", "中国故事阐释"],
    ["世界文学", "跨文化互鉴"],
    ["译介研究", "多语种传播"],
    ["数字人文", "知识库建设"]
  ];
  const overviewFlow = ["典籍文本", "译本谱系", "研究文献", "智能检索", "国际传播"];
  return (
    <>
      <section className="about-overview-band">
        <OverviewCarousel />
        <div className="about-overview-copy">
          <h2>中心概况</h2>
          <p>{profileSummary(profile?.text) || "研究中心于 2022 年正式揭牌成立，聚焦中国话语体系、世界文学视域与数字人文研究。"}</p>
          <div className="about-overview-orbit" aria-label="中心研究能力矩阵">
            <div className="about-orbit-core">
              <strong>中国话语</strong>
              <span>World Literature</span>
            </div>
            {overviewPillars.map(([title, text], index) => (
              <article key={title} style={{ "--orbit-index": index }}>
                <b>{title}</b>
                <span>{text}</span>
              </article>
            ))}
          </div>
          <div className="about-overview-flow" aria-label="研究平台工作流">
            {overviewFlow.map((item, index) => (
              <span key={item}>
                <i>{String(index + 1).padStart(2, "0")}</i>
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

  {/* 按需求：中心概况下方的数据描述（指标墙）不展示 */}

      <section className="about-newslike-section">
        <SectionHeader title="学术委员会" href="#about/committee" />
        <CommitteeCarousel />
      </section>

      <section className="about-newslike-section">
        <SectionHeader title="研究团队" href="#about/team" />
        <TeamCarousel people={team} />
      </section>

      <section className="about-newslike-section">
        <SectionHeader title="学术出版与成果" href="#about/publications" />
        <PublicationGrid limit={4} />
      </section>

      <section className="about-newslike-section">
        <SectionHeader title="学术活动" href="#about/activities" />
        <ActivityGrid limit={4} />
      </section>

      <ContactBlock contactText={section(sections, "联系我们")?.text} />
    </>
  );
}

function ProfilePage({ sections }) {
  const profile = section(sections, "研究中心简介");
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <span>Center Profile</span>
        <h1>中心简介</h1>
        <p>完整展示研究中心定位、学术创新、学术交流、团队建设、图书出版、数字人文与战略服务内容。</p>
      </div>
      <article className="about-long-doc">
        {splitParagraphs(profile?.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </article>
    </section>
  );
}

function CommitteePage({ sections }) {
  const committee = section(sections, "学术委员会");
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <span>Academic Committee</span>
        <h1>学术委员会</h1>
        <p>国内外文学、翻译、比较文学与区域国别研究专家共同组成。</p>
      </div>
      <div className="about-committee-grid full">
        {COMMITTEE.map((person) => (
          <article key={person.name} className="about-committee-card">
            <strong>{person.name}</strong>
            <span>{person.org}</span>
            <em>{person.role}</em>
          </article>
        ))}
      </div>
      <article className="about-long-doc">
        {splitParagraphs(committee?.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </article>
    </section>
  );
}

function TeamPage({ team = TEAM }) {
  const [category, setCategory] = useState(TEAM_CATEGORIES[0]);
  const people = team.filter((person) => person.category === category);
  return (
    <TeamPageContent category={category} setCategory={setCategory} people={people} />
  );
}

function TeamPageContent({ category, setCategory, people }) {
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <span>Research Team</span>
        <h1>研究团队</h1>
        <p>人物矩阵按本院学者、特聘专家、双聘研究员、兼职研究员分类展示。</p>
      </div>
      <div className="about-tabs" role="tablist" aria-label="研究团队分类">
        {TEAM_CATEGORIES.map((item) => (
          <button key={item} className={item === category ? "active" : ""} type="button" onClick={() => setCategory(item)}>{item}</button>
        ))}
      </div>
      <TeamCards people={people} />
    </section>
  );
}

function PersonPage({ person, rawText }) {
  const text = extractPersonProfile(person, rawText) || `${person.name}\n${person.role}\n${person.intro}`;
  const detail = person.detail || PERSON_DETAILS[person.slug];
  const fallbackParagraphs = splitParagraphs(text);
  const basicItems = Array.isArray(detail?.basic) ? detail.basic : [detail?.basic || person.intro].filter(Boolean);
  const directionItems = Array.isArray(detail?.direction) ? detail.direction : [detail?.direction || person.focus.join("、")].filter(Boolean);
  const profile = detail?.profile || fallbackParagraphs.slice(0, 2);
  const achievements = detail?.achievements || {
    projects: [],
    books: [],
    papers: fallbackParagraphs.slice(2),
    honors: []
  };
  const contact = detail?.contact || [];
  const achievementGroups = [
    ["一、课题项目", achievements.projects],
    ["二、著作出版", achievements.books],
    ["三、论文发表", achievements.papers],
    ["四、荣誉奖项", achievements.honors]
  ];

  return (
    <section className="about-person-page">
      <a className="about-back-link" href="#about/team">返回研究团队</a>
      <header className="about-person-hero">
        <img src={imageUrl(person.image)} alt={person.name} />
        <div>
          <span>{person.category}</span>
          <h1>{person.name}</h1>
          <p>{person.role}</p>
          <div>{person.focus.map((item) => <b key={item}>{item}</b>)}</div>
          <em>{person.organization}</em>
        </div>
      </header>
      <div className="about-person-layout">
        <aside>
          <strong>目录</strong>
          <span>基本信息</span>
          <span>研究方向</span>
          <span>学术成果</span>
          <span>联系方式</span>
        </aside>
        <article>
          <section>
            <h2>基本信息</h2>
            <ul className="about-detail-list">
              {basicItems.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
            {profile.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          </section>
          <section>
            <h2>研究方向</h2>
            <div className="about-direction-tags">
              {directionItems.length ? directionItems.map((item) => <span key={item}>{item}</span>) : <span>待补充</span>}
            </div>
          </section>
          <section>
            <h2>学术成果</h2>
            <div className="about-achievement-groups">
              {achievementGroups.map(([title, items]) => (
                <div key={title}>
                  <h3>{title}</h3>
                  {items.length ? (
                    <ol>
                      {items.map((item, index) => <li key={index}>{item}</li>)}
                    </ol>
                  ) : (
                    <p>相关内容待补充。</p>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2>联系方式</h2>
            {contact.length ? (
              <dl className="about-person-contact-list">
                {contact.map((item) => (
                  <div key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.href ? <a href={item.href}>{item.value}</a> : item.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p>联系方式待补充。</p>
            )}
          </section>
        </article>
      </div>
    </section>
  );
}

function PublicationsPage() {
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <span>Publications</span>
        <h1>学术出版与成果</h1>
        <p>研究丛书、专著译著、研究专栏与视频成果集中展示。</p>
      </div>
      <div className="about-tabs static"><span>研究丛书</span><span>专著译著</span><span>研究专栏</span><span>视频成果</span></div>
      <PublicationGrid />
    </section>
  );
}

function ActivitiesPage() {
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <span>Activities</span>
        <h1>学术活动</h1>
        <p>会议、讲座、读书会、专家交流和活动照片按时间线展示。</p>
      </div>
      <div className="about-tabs static"><span>全部</span><span>学术会议</span><span>前沿讲坛</span><span>读书会</span><span>国际交流</span></div>
      <ActivityGrid />
      <div className="about-activity-timeline">
        <strong>2024</strong>
        {ACTIVITIES.map((item) => <p key={item.title}>{item.type}：{item.title}</p>)}
      </div>
    </section>
  );
}

function DigitalPage() {
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <span>Data Platform</span>
        <h1>数据平台</h1>
        <p>相关信息已并入关于我们总览与联系方式，不再单独显示数据平台模块。</p>
      </div>
    </section>
  );
}

function ContactPage({ sections }) {
  const contact = section(sections, "联系我们");
  return (
    <section className="about-detail-page">
      <a className="about-back-link" href="#about">返回关于我们</a>
      <div className="about-detail-hero">
        <h1>联系我们</h1>
        <p>邮箱、地址、友情链接与新媒体传播情况直接展示，便于学术合作与来访联络。</p>
      </div>
      <ContactBlock contactText={contact?.text} />
      <article className="about-long-doc">
        {splitParagraphs(contact?.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </article>
    </section>
  );
}

export default function About({ route = "about" }) {
  const [rawText, setRawText] = useState("");
  const [team, setTeam] = useState(TEAM);
  const [error, setError] = useState("");
  const [active, setActive] = useState(null);

  useEffect(() => {
    let canceled = false;
    fetch(TEXT_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        if (!canceled) setRawText(text);
      })
      .catch((err) => {
        if (!canceled) setError(err.message);
      });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    fetch(SCHOLAR_XLSX_URL, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => {
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        const parsed = parseScholarRows(rows);
        if (!canceled && parsed.length) setTeam(parsed);
      })
      .catch(() => {
        if (!canceled) setTeam(TEAM);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const sections = useMemo(() => parseSections(rawText), [rawText]);
  const subroute = route.replace(/^about\/?/, "");
  const [, teamSlug] = subroute.match(/^team\/(.+)$/) || [];
  const person = team.find((item) => item.slug === teamSlug);

  if (error) {
    return <section className="about-page"><div className="page-alert">关于我们文档读取失败：{error}</div></section>;
  }

  let page;
  if (!subroute) page = <Overview sections={sections} setActive={setActive} team={team} />;
  else if (subroute === "profile") page = <ProfilePage sections={sections} />;
  else if (subroute === "committee") page = <CommitteePage sections={sections} />;
  else if (subroute === "team") page = <TeamPage team={team} />;
  else if (person) page = <PersonPage person={person} rawText={rawText} />;
  else if (subroute === "publications") page = <PublicationsPage />;
  else if (subroute === "activities") page = <ActivitiesPage />;
  else if (subroute === "digital-humanities") page = <DigitalPage />;
  else if (subroute === "contact") page = <ContactPage sections={sections} />;
  else page = <Overview sections={sections} setActive={setActive} />;

  return (
    <section className="about-page about-redesign about-module">
      {page}
      <Modal item={active} onClose={() => setActive(null)} />
    </section>
  );
}
