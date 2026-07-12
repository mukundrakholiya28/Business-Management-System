import { Inter, Oswald } from "next/font/google";
import "./globals.css";
import { AuthProvider, ProtectedLayout } from "@/context/AuthContext";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Shree Royal Car — Workshop Manager",
  description:
    "Business Management System for Shree Royal Car workshop. Manage customers, vehicles, billing, and worker payroll.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/logo.png", type: "image/png" }
    ],
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${oswald.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
