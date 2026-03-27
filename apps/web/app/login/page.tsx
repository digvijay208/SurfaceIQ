import { redirect } from "next/navigation";

import { AuthForm } from "../../components/auth-form";
import { getCurrentUser } from "../../lib/auth";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const searchParams = await props.searchParams;

  if (user) {
    redirect(searchParams.next || "/");
  }

  return <AuthForm mode="login" {...(searchParams.next ? { nextPath: searchParams.next } : {})} />;
}
