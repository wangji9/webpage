import { dynamicItems, detailHref } from "../data/dynamicContent.js";

function tagHref(label) {
  return detailHref("tag", encodeURIComponent(label));
}

export default function Home({ sections }) {
  const tabs = [
    ["knowledge", "知识库分区"],
    ["topic", "专题聚焦", detailHref("topic", "focus")],
    ["topic", "综合研究", detailHref("topic", "research")],
    ["topic", "媒体关注", detailHref("topic", "media")]
  ];
  const dynamics = dynamicItems;
  const featured = dynamics[0];

  return (
    <>
      <section className="home-hero">
        <div className="hero-text">
          <p>教育部哲学社会科学研究重大课题攻关项目</p>
          <h1>讲好中国故事，连接世界文学</h1>
          <h2>基于大语言模型的垂直知识库，整合中华典籍、多语种译本与研究文献，赋能学术研究、高校教学与国际文化传播。</h2>
        </div>
      </section>

      <section className="center-intro flat-section">
        <div>
          <h2>中国话语与世界文学研究中心</h2>
          <p>依托上海外国语大学，以教育部哲学社科研究重大课题攻关项目为核心，构建融通中外的话语体系。</p>
        </div>
      </section>

      <section className="flat-section feature-row home-dynamics-section">
        <div className="section-title">
          <span></span>
          <div>
            <h2>平台动态</h2>
            <p>News & Updates</p>
          </div>
          <a href="/#about">更多</a>
        </div>
        <div className="home-dynamic-layout">
          {featured ? (
            <a className="home-dynamic-spotlight" href={detailHref("dynamic", featured.id)} target="_blank" rel="noreferrer">
              <img src={featured.image} alt={featured.title} />
              <span>{featured.type}</span>
              <h3>{featured.title}</h3>
            </a>
          ) : null}
          <div className="home-dynamic-grid">
            {dynamics.slice(1, 7).map((item) => (
              <a key={item.id} href={detailHref("dynamic", item.id)} target="_blank" rel="noreferrer">
                <img src={item.image} alt={item.title} loading="lazy" />
                <div>
                  <strong>{item.type}</strong>
                  <span>{item.title}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="flat-section knowledge-strip">
        <div className="tab-heading">
          {tabs.map(([kind, label, href]) => (
            href ? (
              <a key={label} href={href} target="_blank" rel="noreferrer">{label}</a>
            ) : (
              <strong key={label}>{label}</strong>
            )
          ))}
        </div>
        <div className="section-grid">
          {sections.map((section, index) => (
            <article className="section-card" key={section.id}>
              <em>0{index + 1}</em>
              <h3><a href={detailHref("section", section.id)} target="_blank" rel="noreferrer">{section.title}</a></h3>
              <p>{section.intro}</p>
              <div>
                {section.keywords.map((keyword) => (
                  <a key={keyword} href={tagHref(keyword)} target="_blank" rel="noreferrer">{keyword}</a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="service-band">
        <div className="section-title light">
          <span></span>
          <div>
            <h2>知识服务、教学与传播</h2>
            <p>Knowledge Services, Teaching & Communication</p>
          </div>
          <a href={detailHref("service", "knowledge")} target="_blank" rel="noreferrer">更多</a>
        </div>
        <div className="service-grid">
          <a href={detailHref("service", "knowledge")} target="_blank" rel="noreferrer"><strong>垂直知识库</strong><small>Vertical Knowledge Base</small></a>
          <a href={detailHref("service", "graph")} target="_blank" rel="noreferrer"><strong>译介关系图谱</strong><small>Translation Relation Graph</small></a>
          <a href={detailHref("service", "upload")} target="_blank" rel="noreferrer"><strong>文献整理与入库</strong><small>Document Curation & Data Ingestion</small></a>
        </div>
      </section>
    </>
  );
}
