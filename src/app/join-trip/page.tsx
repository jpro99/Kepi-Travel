import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

interface Props {
  searchParams: Promise<{ code?: string }>;
}

export default async function JoinTripPage({ searchParams }: Props) {
  const { userId } = await auth();
  const { code } = await searchParams;

  if (!code) {
    redirect("/travel-assistant");
  }

  if (!userId) {
    redirect(`/sign-up?tripInvite=${encodeURIComponent(code)}`);
  }

  redirect(`/travel-assistant?openTripInvite=${encodeURIComponent(code)}`);
}
