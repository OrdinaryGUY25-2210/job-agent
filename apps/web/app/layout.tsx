import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Job Agent',
  description: 'AI job application agent control center',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}