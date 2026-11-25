import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aviator — Bombabet',
  description:
    'Jogue Aviator na Bombabet. Acompanhe o voo em tempo real, aposte com dois painéis independentes e levante antes do avião partir.',
  openGraph: {
    title: 'Aviator — Bombabet',
    description:
      'Jogue Aviator na Bombabet. Acompanhe o voo em tempo real, aposte com dois painéis independentes e levante antes do avião partir.',
    siteName: 'Bombabet',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt" className="dark">
      <body className="min-h-screen bg-[#0e0f14] text-white antialiased selection:bg-[#e50539]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
