import type { Metadata } from 'next';
import './globals.css';
import { StudioProvider } from '../context/studio-context';

export const metadata: Metadata = {
  title: 'AI Content Studio — AI Content Operating System',
  description: 'Describe it. Create it. Refine it. Publish it.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <StudioProvider>{children}</StudioProvider>
      </body>
    </html>
  );
}
