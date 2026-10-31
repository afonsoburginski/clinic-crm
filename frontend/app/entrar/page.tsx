import type { Metadata } from "next"

import { SignInScreen } from "@/modules/auth/components/sign-in-screen"

export const metadata: Metadata = { title: "Entrar" }

export default function SignInPage() {
  return <SignInScreen />
}
