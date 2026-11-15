import './global.css';

export const metadata = {
  title: 'SewerNet — customizable Matrix messenger',
  description:
    'A customizable cross-platform messenger built on the Matrix protocol. Dev log and project news.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
