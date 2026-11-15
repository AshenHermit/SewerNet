import styles from './page.module.css';

const FEATURES = [
  {
    title: 'Matrix protocol',
    text: 'End-to-end capable, federated and decentralized messaging on top of the open Matrix standard.',
  },
  {
    title: 'Cross-platform',
    text: 'Web, desktop and (later) mobile from a single codebase built with Tauri and React.',
  },
  {
    title: 'Customizable interface',
    text: 'Proxy UI components switch between component kits and themes — colors, fonts, icons.',
  },
  {
    title: 'Markdown messages',
    text: 'Write in Markdown, react with custom emoji, style individual messages your way.',
  },
  {
    title: 'Stickers & emoji',
    text: 'Custom sticker and emoji packs with a marketplace, just like you are used to.',
  },
  {
    title: 'Message workshop',
    text: 'Custom HTML/CSS wrappers and helper scripts to re-style how messages render.',
  },
];

const DEV_LOG = [
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

export default function Index() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.hero}>
          <span className={styles.badge}>Work in progress</span>
          <h1 className={styles.title}>
            Sewer<span className={styles.titleAccent}>Net</span>
          </h1>
          <p className={styles.tagline}>
            A customizable cross-platform messenger built on the Matrix
            protocol. Your chats, your themes, your rules.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.cta} href="#devlog">
              Read the dev log
            </a>
            <a
              className={styles.ctaSecondary}
              href="https://matrix.org/ecosystem/clients/"
              target="_blank"
              rel="noreferrer"
            >
              About Matrix
            </a>
          </div>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>What is SewerNet?</h2>
          <div className={styles.grid}>
            {FEATURES.map((feature) => (
              <article key={feature.title} className={styles.card}>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="devlog" className={styles.section}>
          <h2 className={styles.sectionTitle}>Dev log</h2>
          <div className={styles.logList}>
            {DEV_LOG.map((entry) => (
              <article key={entry.title} className={styles.logEntry}>
                <span className={styles.logDate}>{entry.date}</span>
                <span className={styles.logTitle}>{entry.title}</span>
              </article>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <p>
            SewerNet — an open-source Matrix client. Built with Nx, Tauri,
            React and NestJS.
          </p>
        </footer>
      </div>
    </div>
  );
}
