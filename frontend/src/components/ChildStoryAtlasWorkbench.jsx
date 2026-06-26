import storyData from "../data/storyCollections.json";
import StatisticsPanel from "./StatisticsPanel.jsx";
import StoryVisualAtlas from "./StoryVisualAtlas.jsx";

export default function ChildStoryAtlasWorkbench({ component }) {
  return (
    <section className="platform-special-workbench child-story-atlas" style={{ "--span": component?.span || 24 }}>
      <header className="german-story-atlas-toolbar">
        <strong>子故事知识图谱</strong>
      </header>
      <div className="german-story-atlas-section">
        <StoryVisualAtlas mode="children" />
      </div>
      <div className="kb-stats-bottom kb-anchor-target">
        <StatisticsPanel items={storyData.childStories || []} title="子故事知识图谱专题统计可视化" />
      </div>
    </section>
  );
}
