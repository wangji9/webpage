import { useMemo } from "react";
import storyData from "../data/storyCollections.json";
import StatisticsPanel from "./StatisticsPanel.jsx";
import StoryVisualAtlas from "./StoryVisualAtlas.jsx";

function buildPrefacePayload() {
  return Object.fromEntries((storyData.prefaces || [])
    .filter((item) => item.text || item.intro)
    .map((item) => [
      item.id,
      {
        text: item.text || item.intro || "",
        year: item.year,
        filename: item.collectionTitle || item.id,
        sourceTitle: item.collectionTitle || item.id,
        author: item.author,
        type: item.type,
      },
    ]));
}

export default function PrefaceStoryAtlasWorkbench({ component }) {
  const prefaces = useMemo(buildPrefacePayload, []);
  const statisticItems = useMemo(() => (storyData.prefaces || []).map((item) => ({
    id: item.id,
    title: item.collectionTitle,
    canonicalName: item.collectionTitle,
    year: item.year,
    yearText: item.yearText,
    translator: item.author,
    editor: item.author,
    language: "中文",
    carrier: item.type || "序跋",
    type: item.type || "序跋",
    country: "德国",
    publisher: item.collectionTitle,
    source: "序跋中文版本",
    text: item.text || item.intro || "",
  })), []);

  return (
    <section className="platform-special-workbench preface-story-atlas" style={{ "--span": component?.span || 24 }}>
      <header className="german-story-atlas-toolbar">
        <strong>序跋中文版本图谱</strong>
      </header>
      <div className="german-story-atlas-section">
        <StoryVisualAtlas mode="prefaces" prefaces={prefaces} />
      </div>
      <div className="kb-stats-bottom kb-anchor-target">
        <StatisticsPanel items={statisticItems} title="序跋中文版本专题统计可视化" />
      </div>
    </section>
  );
}
