import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import Link from "next/link"
import React from "react"
import { Footer } from "../landing/Footer"
import { Logo } from "../logo"
import { Button } from "../ui/button"

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  // Check if user is logged in
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  const renderNavigation = () => {
    if (session) {
      return (
        <Button variant="ghost" className="cursor-pointer active:scale-[0.975]" asChild>
          <Link href="/home">Home</Link>
        </Button>
      )
    }

    return (
      <Button variant="ghost" className="cursor-pointer active:scale-[0.975]" asChild>
        <Link href="/login">Login</Link>
      </Button>
    )
  }

  return (
    <div className="flex justify-center">
      <div className="w-full flex flex-col justify-center align-middle max-w-[1328px] py-4 px-8">
        <nav className="flex w-full justify-between">
          {/* brand logo */}
          <Logo />

          <div className="flex gap-2">
            {/* check navigation */}
            {renderNavigation()}

            <Button
              variant="outline"
              className="rounded-full dark:border-accent cursor-pointer transition active:scale-[0.975]"
              asChild
            >
              <Link href="/register">Get Started</Link>
            </Button>
          </div>
        </nav>

        {/* render children */}
        {children}

        {/* footer */}
        <Footer />
      </div>
    </div>
  )
}
