import { RouteTransition } from "@/shared/ui/templates/route-transition"

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return <RouteTransition>{children}</RouteTransition>
}
