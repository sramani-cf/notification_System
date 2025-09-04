import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { UserProvider } from '@/contexts/UserContext';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Notification System Demo",
  description: "A comprehensive notification system with load balancing and real-time processing",
  keywords: "notification, system, demo, real-time, load balancer",
  authors: [{ name: "Notification System Team" }],
  openGraph: {
    title: "Notification System Demo",
    description: "Send and manage notifications with load balancing",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UserProvider>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
