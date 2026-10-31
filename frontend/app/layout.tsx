import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'

import { Providers } from '@/shared/lib/providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz'] })

export const metadata: Metadata = {
  title: {
    default: 'Villiére · Painel da clínica',
    template: '%s · Villiére',
  },
  description:
    'Painel interno da clínica de desenvolvimento infantil: agenda, pacientes, responsáveis, profissionais e serviços.',
  generator: 'v0.app',
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/clinic-logo.png', type: 'image/png' }],
    apple: '/clinic-logo.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7f8' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0c0f' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={`${inter.variable} ${fraunces.variable} bg-background`}>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
