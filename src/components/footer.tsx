import { ThemeSwitcher } from "./ui/theme-switcher";

const links = [
  // {
  //     title: 'Changelog',
  //     href: '/changelogs',
  // },
  {
    title: "Privacy",
    href: "/privacy",
  },
  {
    title: "Terms",
    href: "/terms",
  },
  {
    title: "Credits",
    href: "https://github.com/ahmadrosid/vidiopintar.com",
  },
];

export function FooterSection() {
  return (
    <footer className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <a
          href="/"
          aria-label="go home"
          className="mx-auto block size-fit tracking-tight"
        >
          YTCollege
        </a>

        <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
          {links.map((link, index) => (
            <a
              key={index}
              href={link.href}
              className="text-muted-foreground hover:text-primary block duration-150"
            >
              <span>{link.title}</span>
            </a>
          ))}
        </div>
        <div className="flex justify-center my-6">
          <ThemeSwitcher />
        </div>
        <span className="text-muted-foreground block text-center text-sm">
          {" "}
          © {new Date().getFullYear()} YTCollege, All rights reserved
        </span>
      </div>
    </footer>
  );
}
