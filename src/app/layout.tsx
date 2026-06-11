
import { ClerkProvider } from '@clerk/nextjs';
import { BillingProvider } from "@/lib/billing/BillingContext";
import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <BillingProvider>{children}</BillingProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
