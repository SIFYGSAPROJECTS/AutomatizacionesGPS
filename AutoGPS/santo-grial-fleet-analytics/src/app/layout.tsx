import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Santo Grial - Fleet Analytics",
  description: "Enterprise fleet management and analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${instrumentSerif.variable} h-full antialiased dark`}
    >
      <body className="flex flex-col h-full overflow-hidden bg-black text-zinc-300 selection:bg-orange-500/30" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        
        {/* Top Navbar */}
        <Header />
        
        {/* Main Content Area */}
        <main id="santo-grial-main-scroll" className="flex-1 overflow-y-auto p-4 md:p-8 z-0">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}
