const ENTRIES = [
  {
    date: '2026-11-16',
    title: 'Monorepo scaffolded: Nx workspace, web, backend, landing',
  },
  {
    date: '2026-11-16',
    title: 'Proxy UI kit system, theming engine and Storybook in place',
  },
  {
    date: '2026-11-16',
    title: 'Matrix REST proxy backend and first working chat UI',
  },
];

export default function DevLogPage() {
  return (
    <main>
      <h1>SewerNet dev log</h1>
      <ol>
        {ENTRIES.map((entry) => (
          <li key={entry.title}>
            <time dateTime={entry.date}>{entry.date}</time> — {entry.title}
          </li>
        ))}
      </ol>
      <a href="/">Back to SewerNet</a>
    </main>
  );
}
