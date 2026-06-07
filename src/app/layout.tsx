import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

export const metadata: Metadata = {
  title: "MTTN Recruit OS",
  description: "Board Recruitment Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} font-sans`}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css" />
      </head>
      <body>
        <QueryProvider>{children}</QueryProvider>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js" async></script>
      </body>
    </html>
  );
}
