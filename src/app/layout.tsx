import type { Metadata } from "next";
import { Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-thai",
});

export const metadata: Metadata = {
  title: "Split the Bill",
  description: "แชร์ค่าข้าวกับเพื่อน จ่ายคืนไว ไม่มีลืม",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoSansThai.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
