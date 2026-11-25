import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aviator — Simulador de Voo & Multiplicador',
  description: 'Recriação interativa do jogo Aviator com créditos virtuais, motor de rondas no servidor e dois painéis independentes de apostas.',
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
