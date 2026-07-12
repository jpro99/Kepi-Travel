import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function RedeemPage({ searchParams }: Props) {
  const { userId } = await auth();
  const { code } = await searchParams;

  // If not signed in, send to sign-up with code preserved
  if (!userId) {
    if (code) {
      redirect(`/sign-up?code=${encodeURIComponent(code)}`);
    }
    redirect("/sign-up");
  }

  // Signed in with a code — travel assistant auto-redeems from ?redeem=
  if (code) {
    redirect(`/travel-assistant?redeem=${encodeURIComponent(code)}`);
  }

  redirect("/travel-assistant");
}
