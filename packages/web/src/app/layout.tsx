import type { Metadata } from 'next';
import { Fira_Code, Fira_Sans } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';

const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
});

const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Engram - Secure-First AI Memory Layer',
  description:
    'End-to-end encrypted AI memory layer. Your AI memories, cryptographically sealed.',
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${firaSans.variable} ${firaCode.variable} font-sans bg-background text-foreground antialiased selection:bg-indigo-500/30 selection:text-indigo-200`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
