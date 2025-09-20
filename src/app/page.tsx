import { Button } from "@/components/ui/button";
import { Header } from "@/components/landing/Header";
import { Testimonial } from "@/components/landing/Testimonial";
import { Features } from "@/components/landing/Feature";
import { Topics } from "@/components/landing/Topic";
import { Testimonials2 } from "@/components/landing/Testimonial2";
import NewPricing from "@/components/landing/NewPricing";
import { Footer } from "@/components/landing/Footer";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function Page() {
  // Check if user is logged in
  const session = await auth.api.getSession({
    headers: await headers()
  });

  return (
    <div className="flex justify-center">
      <div className="w-full flex flex-col justify-center align-middle max-w-[1328px] py-4 px-8">
        <nav className="flex w-full justify-between">
          <div className="flex gap-1 items-center">
            <img src="play.svg" className="size-5 "></img>
            <span className="select-none">vidiopintar</span>
          </div>
          <div className="flex gap-2">
            {session ? (
              <a href="/home">
                <Button
                  variant="outline"
                  className="cursor-pointer active:scale-[0.975]"
                >
                  Home
                </Button>
              </a>
            ) : (
              <>
                <a href="/login">
                  <Button
                    variant="ghost"
                    className="cursor-pointer active:scale-[0.975]"
                  >
                    Login
                  </Button>
                </a>
                <a href="https://vidiopintar.com/register">
                  <Button
                    variant="outline"
                    className="rounded-full dark:border-accent cursor-pointer transition active:scale-[0.975]"
                  >
                    Get Started
                  </Button>
                </a>
              </>
            )}
          </div>
        </nav>
        <Header />
        <Testimonial />
        <Features />
        <Topics />
        <Testimonials2 />
        <NewPricing />
        <Footer />
      </div>
    </div>
  )
}
