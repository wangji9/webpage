import { WilhelmStoriesWorkbench } from "../pages/WilhelmStories.jsx";

export default function WilhelmStoryAtlasWorkbench({ component }) {
  return (
    <section className="platform-special-workbench wilhelm-story-atlas" style={{ "--span": component?.span || 24 }}>
      <WilhelmStoriesWorkbench embedded focused anchorBase="wilhelm-story-atlas" />
    </section>
  );
}
