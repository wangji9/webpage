export default function PageHero({ eyebrow, title, children }) {
  return (
    <section className="page-hero">
      <div>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <div>{children}</div>
      </div>
    </section>
  );
}
