import './globals.css';

export const metadata = {
  title: 'LLM Proxy Admin',
  description: 'Manage API Keys for LLM Proxy',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
