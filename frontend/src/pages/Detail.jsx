import { useEffect, useState } from "react";
import { dynamicItems, findDynamicItem, topicContent } from "../data/dynamicContent.js";
import { loadSiteContent } from "../data/siteContent.js";

const fallback = {
  title: "专题内容",
  type: "平台栏目",
  date: "2026-05-29",
  summary: "该页面用于承接首页栏目、知识库分区和平台服务入口，后续可接入真实内容管理系统。"
};

export default function Detail({ route, sections, results }) {
  const [managedDynamics, setManagedDynamics] = useState([]);
  const [, kind = "topic", id = "overview"] = route.split("/");
  const decodedId = decodeURIComponent(id);
  const result = results.find((item) => item.id === id);
  const section = sections.find((item) => item.id === id);
  useEffect(() => {
    let canceled = false;
    loadSiteContent()
      .then((content) => {
        if (!canceled) setManagedDynamics(content.dynamics || []);
      })
      .catch(() => {
        if (!canceled) setManagedDynamics([]);
      });
    return () => {
      canceled = true;
    };
  }, []);
  const dynamicSource = managedDynamics.length ? managedDynamics : dynamicItems;
  const dynamicItem = kind === "dynamic"
    ? dynamicSource.find((item) => item.id === id || item.id === decodedId || item.filename === decodedId) || findDynamicItem(id)
    : null;

  const topicMap = {
    ...topicContent,
    news: {
      title: "平台动态",
      type: "新闻与成果",
      summary: "集中呈现平台建设进展、研究中心动态、学术论文、资料目录和项目阶段性成果。"
    },
    service: {
      title: id === "graph" ? "译介关系图谱" : id === "upload" ? "文献整理与入库" : "垂直知识库",
      type: "知识服务",
      summary: "面向学术研究、高校教学和国际文化传播提供结构化知识服务。"
    }
  };

  const tagContent = kind === "tag" && {
    title: decodedId,
    type: "知识标签",
    summary: `该标签用于聚合与“${decodedId}”相关的译本、研究文献、传播节点与知识图谱关系，后续可接入检索结果列表。`
  };

  const content = dynamicItem || result || (section && {
    title: section.title,
    type: "知识库分区",
    summary: section.intro,
    keywords: section.keywords,
    date: "持续建设"
  }) || tagContent || topicMap[id] || topicMap[kind] || fallback;

  return (
    <section className="detail-page">
      <div className="detail-shell">
        <p className="detail-type">{content.type}</p>
        <h1>{content.title}</h1>
        <time>{content.date || "2026-05-29"}</time>
        {content.image ? <img className="detail-main-image" src={content.image} alt={content.title} /> : null}
        <p>{content.summary}</p>
        {content.keywords && (
          <div className="chip-row">{content.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}</div>
        )}
        {kind === "topic" && topicContent[id] ? (
          <div className="detail-card-grid">
            {dynamicSource
              .filter((item) => item.topic === id)
              .slice(0, 9)
              .map((item) => (
                <a key={item.id} href={`/#detail/dynamic/${item.id}`} target="_blank" rel="noreferrer">
                  <img src={item.image} alt={item.title} loading="lazy" />
                  <strong>{item.title}</strong>
                  <span>{item.type}</span>
                </a>
              ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
