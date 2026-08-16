import type { Metadata } from "next";
import { Space_Grotesk, Nunito_Sans } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const nunitoSans = Nunito_Sans({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Bartola Budget",
  description: "Your one number for the day: Safe-to-Spend.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${nunitoSans.variable} h-full antialiased`}
    >
      <body className="bg-surface text-ink flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
