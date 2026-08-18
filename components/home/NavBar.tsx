'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Menu,
  ShoppingCart,
  LogOut,
  Ship,
  Gift,
  Sparkles,
  Calculator,
  Box,
  Scale,
  Zap,
  DollarSign,
  Tags,
  Laptop,
  CalendarClock,
  Database,
  PackageSearch,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useAuth } from '@/app/context/AuthContext';
import ThemeToggle from '@/components/home/ThemeToggle';

const MENU_ITEMS = {
  services: [
    {
      title: 'Supplier Intelligence',
      href: '/supplier-intelligence',
      icon: Database,
      desc: 'Verified supplier research for global importers',
      color: 'from-slate-700 to-slate-950',
    },
    {
      title: 'Book Consultation',
      href: '/book-consultation',
      icon: CalendarClock,
      desc: 'Paid call for sourcing, supplier, cost and shipping decisions',
      color: 'from-brand-orange-400 to-brand-orange-600',
    },
    {
      title: 'Buy from Chinese Websites',
      href: '/buy-from-chinese-websites',
      icon: ShoppingCart,
      desc: 'Direct purchasing with quality assurance',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      title: 'Ship with us',
      href: '/ship-with-us',
      icon: Ship,
      desc: 'Submit shipping-only requests for goods you already bought',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      title: 'Track Shipment',
      href: '/track',
      icon: PackageSearch,
      desc: 'Follow the progress of your Ship With Us shipment',
      color: 'from-blue-600 to-indigo-700',
    },
    {
      title: 'Corporate Sourcing',
      href: '/corporate-sourcing',
      icon: Gift,
      desc: 'Machinery, equipment, branded products and bulk sourcing',
      color: 'from-amber-400 to-orange-500',
    },
    {
      title: 'Laptops for Business',
      href: '/laptops-for-business',
      icon: Laptop,
      desc: 'Bulk laptop sourcing for teams, schools and resellers',
      color: 'from-slate-600 to-slate-900',
    },
    {
      title: 'LineScout',
      href: 'https://linescout.sureimports.com/',
      icon: Sparkles,
      desc: 'Machines and equipment sourcing guidance',
      color: 'from-purple-500 to-pink-600',
    },
  ],
  tools: [
    {
      title: 'Air vs Sea Calculator',
      href: '/tools/air-vs-sea-calculator',
      icon: Calculator,
      desc: 'Compare shipping methods instantly',
    },
    {
      title: 'Carton Optimization',
      href: '/tools/carton-optimization',
      icon: Box,
      desc: 'Optimize your carton size for shipping',
    },
    {
      title: 'CBM Calculator',
      href: '/tools/cbm-volumetric-weight-calculator',
      icon: Scale,
      desc: 'Calculate volumetric weight easily',
    },
    {
      title: 'Generator Sizing',
      href: '/tools/generator-sizing',
      icon: Zap,
      desc: 'Calculate the right generator size',
    },
    {
      title: 'Landed Cost Estimator',
      href: '/tools/landed-cost-estimator',
      icon: DollarSign,
      desc: 'Estimate total landed cost accurately',
    },
    {
      title: 'Retail Price Builder',
      href: '/tools/retail-price-builder',
      icon: Tags,
      desc: 'Turn landed cost into selling price',
    },
  ],
  webinars: [
    {
      title: 'White Label Webinar',
      href: '/white-label-leads',
      icon: Sparkles,
      desc: 'Learn how to build and launch a white-label product',
      color: 'from-purple-500 to-pink-600',
    },
    {
      title: 'Machine Sourcing Webinar',
      href: '/machine-sourcing-webinar',
      icon: CalendarClock,
      desc: 'Learn how to source machinery and equipment from China',
      color: 'from-blue-500 to-indigo-600',
    },
  ],
};

const TOP_LEVEL_NAV = [
  {
    type: 'link',
    title: 'Home',
    href: '/',
    match: 'exact',
  },
  {
    type: 'dropdown',
    title: 'Services',
    value: 'services',
    items: MENU_ITEMS.services,
    panelClassName: 'w-[600px]',
  },
  {
    type: 'dropdown',
    title: 'Tools',
    value: 'tools',
    items: MENU_ITEMS.tools,
    panelClassName: 'w-[650px]',
  },
  {
    type: 'link',
    title: 'Import Hub',
    href: '/import-from-china-to-nigeria',
    match: 'exact',
  },
  {
    type: 'link',
    title: 'Blog',
    href: '/blog',
    match: 'prefix',
  },
  {
    type: 'link',
    title: 'Shop',
    href: '/shop',
    match: 'prefix',
  },
  {
    type: 'link',
    title: 'White Label',
    href: '/white-label',
    match: 'prefix',
  },
  {
    type: 'dropdown',
    title: 'Webinars',
    value: 'webinars',
    items: MENU_ITEMS.webinars,
    panelClassName: 'w-[600px]',
  },
  {
    type: 'cart',
    title: 'Cart',
    href: '/shop?openCart=1',
  },
] as const;

type NavbarProps = {
  forceLightNavbar?: boolean;
};

export default function Navbar({ forceLightNavbar = false }: NavbarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const isShopProductPage =
    Boolean(pathname?.startsWith('/shop/')) &&
    pathname !== '/shop/checkout' &&
    pathname !== '/shop/order-success';
  const LEGAL_PAGE_PATHS = [
    '/privacy-policy',
    '/terms-and-conditions',
    '/shipping-policy',
    '/warranty-policy',
    '/faya-warranty-policy',
    '/about',
  ];
  const isLegalPage = Boolean(pathname && LEGAL_PAGE_PATHS.includes(pathname));
  const isToolsPage = Boolean(pathname?.startsWith('/tools'));
  const isBlogPage = Boolean(pathname?.startsWith('/blog'));
  const isSupplierReportProductPage = Boolean(
    pathname && /^\/supplier-intelligence\/reports\/[^/]+\/?$/.test(pathname),
  );
  const useLightNavbar =
    forceLightNavbar ||
    isShopProductPage ||
    isLegalPage ||
    isToolsPage ||
    isBlogPage ||
    isSupplierReportProductPage;
  const signInHref = '/sign-in';
  const isOnShopPage = Boolean(pathname?.startsWith('/shop'));

  const handleCartNavClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isOnShopPage) return;
    event.preventDefault();
    window.dispatchEvent(new Event('open-shop-cart'));
  };

  const isNavItemActive = (item: (typeof TOP_LEVEL_NAV)[number]) => {
    if (item.type !== 'link' || !pathname) return false;
    if (item.match === 'prefix') return pathname.startsWith(item.href);
    return pathname === item.href;
  };

  const desktopNavLinkClass = (active = false) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
      active
        ? useLightNavbar
          ? 'bg-slate-900/10 text-slate-900'
          : 'bg-white/10 text-white'
        : useLightNavbar
          ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
    }`;

  const desktopDropdownClass = `rounded-full bg-transparent px-4 py-2 text-sm font-semibold transition-colors focus:bg-transparent ${
    useLightNavbar
      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900 data-[state=open]:bg-slate-100 data-[state=open]:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white dark:data-[state=open]:bg-white/10 dark:data-[state=open]:text-white'
      : 'text-slate-300 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white'
  }`;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const syncCartCount = () => {
      try {
        const raw = localStorage.getItem('shopCart');
        if (!raw) {
          setCartCount(0);
          return;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setCartCount(0);
          return;
        }
        const count = parsed.reduce(
          (total: number, item: { quantity?: number }) =>
            total + Number(item?.quantity || 0),
          0,
        );
        setCartCount(count);
      } catch {
        setCartCount(0);
      }
    };

    syncCartCount();
    window.addEventListener('storage', syncCartCount);
    window.addEventListener('shop-cart-updated', syncCartCount);
    return () => {
      window.removeEventListener('storage', syncCartCount);
      window.removeEventListener('shop-cart-updated', syncCartCount);
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        useLightNavbar
          ? scrolled
            ? 'border-b border-slate-200 bg-white/95 py-3 shadow-lg shadow-slate-200/60 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/90 dark:shadow-black/10'
            : 'border-b border-slate-200/80 bg-white/85 py-5 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-950/85'
          : scrolled
            ? 'border-b border-slate-800/60 bg-slate-950/80 py-3 shadow-xl shadow-black/10 backdrop-blur-xl'
            : 'bg-transparent py-5'
      }`}
    >
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="z-50 flex flex-col items-start transition-opacity hover:opacity-80"
          >
            {useLightNavbar ? (
              <>
                <Image
                  src="/images/svg-logo.svg"
                  alt="Sure Imports"
                  width={180}
                  height={40}
                  priority
                  className="h-8 w-auto dark:hidden"
                />
                <Image
                  src="/images/svg-logo-white.svg"
                  alt=""
                  width={180}
                  height={40}
                  className="hidden h-8 w-auto dark:block"
                />
              </>
            ) : (
              <Image
                src="/images/svg-logo-white.svg"
                alt="Sure Imports"
                width={180}
                height={40}
                priority
                className="h-8 w-auto"
              />
            )}
            <span
              className={`mt-1 text-[10px] font-bold uppercase leading-none tracking-[0.32em] ${
                useLightNavbar
                  ? 'text-slate-600 dark:text-slate-300'
                  : 'text-slate-300'
              }`}
            >
              LineScout
            </span>
          </Link>

          <div className="hidden xl:block">
            <NavigationMenu>
              <NavigationMenuList className="gap-2">
                {TOP_LEVEL_NAV.map((item) => {
                  if (item.type === 'dropdown') {
                    return (
                      <NavigationMenuItem key={item.title}>
                        <NavigationMenuTrigger className={desktopDropdownClass}>
                          {item.title}
                        </NavigationMenuTrigger>
                        <NavigationMenuContent>
                          <ul
                            className={`grid ${item.panelClassName} grid-cols-2 gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl`}
                          >
                            {item.items.map((child) => (
                              <ListItem
                                key={child.title}
                                title={child.title}
                                href={child.href}
                                desc={child.desc}
                                icon={child.icon}
                                color={
                                  'color' in child ? child.color : undefined
                                }
                              />
                            ))}
                          </ul>
                        </NavigationMenuContent>
                      </NavigationMenuItem>
                    );
                  }

                  if (item.type === 'cart') {
                    return (
                      <NavigationMenuItem key={item.title}>
                        <NavigationMenuLink
                          asChild
                          className={`relative ${desktopNavLinkClass(false)}`}
                        >
                          <Link href={item.href} onClick={handleCartNavClick}>
                            <ShoppingCart className="h-5 w-5" />
                            {cartCount > 0 && (
                              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">
                                {cartCount}
                              </span>
                            )}
                          </Link>
                        </NavigationMenuLink>
                      </NavigationMenuItem>
                    );
                  }

                  return (
                    <NavigationMenuItem key={item.title}>
                      <NavigationMenuLink
                        asChild
                        className={desktopNavLinkClass(isNavItemActive(item))}
                      >
                        <Link href={item.href}>{item.title}</Link>
                      </NavigationMenuLink>
                    </NavigationMenuItem>
                  );
                })}
              </NavigationMenuList>
            </NavigationMenu>
          </div>

          <div className="hidden items-center gap-4 xl:flex">
            <ThemeToggle lightSurface={useLightNavbar} />
            {user ? (
              <>
                <Button
                  asChild
                  className="rounded-full border-0 bg-brand-orange-500 px-6 py-5 text-sm font-bold text-white shadow-lg shadow-brand-orange-500/20 transition-all hover:bg-brand-orange-600 hover:shadow-brand-orange-500/40 active:scale-95"
                >
                  <Link href="/dashboard">Go to Dashboard</Link>
                </Button>
                <Button
                  type="button"
                  onClick={() => void logout()}
                  className="rounded-full border-0 bg-slate-800 px-6 py-5 text-sm font-bold text-white shadow-lg transition-all hover:bg-slate-700 active:scale-95"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </>
            ) : (
              <Button
                asChild
                className="rounded-full border-0 bg-brand-orange-500 px-6 py-5 text-sm font-bold text-white shadow-lg shadow-brand-orange-500/20 transition-all hover:bg-brand-orange-600 hover:shadow-brand-orange-500/40 active:scale-95"
              >
                <Link href={signInHref}>Sign In</Link>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 xl:hidden">
            <ThemeToggle lightSurface={useLightNavbar} />
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`border-0 ${useLightNavbar ? 'text-slate-800 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10' : 'text-white hover:bg-white/10'}`}
                >
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full overflow-y-auto border-slate-800 bg-slate-950 p-0 sm:max-w-md"
              >
                <SheetTitle className="sr-only">
                  Main Navigation Menu
                </SheetTitle>
                <div className="p-6">
                  <div className="mb-8 flex items-center gap-4">
                    <div className="flex flex-col items-start">
                      <Image
                        src="/images/svg-logo-white.svg"
                        alt="Sure Imports"
                        width={140}
                        height={30}
                      />
                      <span className="mt-1 text-[10px] font-bold uppercase leading-none tracking-[0.32em] text-slate-300">
                        LineScout
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    {TOP_LEVEL_NAV.map((item) => {
                      if (item.type === 'dropdown') {
                        return (
                          <Accordion
                            key={item.title}
                            type="single"
                            collapsible
                            className="w-full border-none"
                          >
                            <AccordionItem
                              value={item.value}
                              className="border-none"
                            >
                              <AccordionTrigger className="rounded-xl px-4 py-3 text-lg font-semibold text-slate-300 hover:bg-slate-900 hover:text-white hover:no-underline">
                                {item.title}
                              </AccordionTrigger>
                              <AccordionContent className="space-y-2 pb-0 pl-4 pt-2">
                                {item.items.map((child) => (
                                  <SheetClose asChild key={child.title}>
                                    <Link
                                      href={child.href}
                                      target={
                                        child.href.startsWith('http')
                                          ? '_blank'
                                          : undefined
                                      }
                                      rel={
                                        child.href.startsWith('http')
                                          ? 'noopener noreferrer'
                                          : undefined
                                      }
                                      className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-400 hover:bg-slate-900 hover:text-white"
                                    >
                                      <child.icon className="h-5 w-5" />
                                      {child.title}
                                    </Link>
                                  </SheetClose>
                                ))}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        );
                      }

                      if (item.type === 'cart') {
                        return (
                          <SheetClose asChild key={item.title}>
                            <Link
                              href={item.href}
                              onClick={handleCartNavClick}
                              className="flex items-center gap-3 rounded-xl px-4 py-3 text-lg font-semibold text-slate-300 hover:bg-slate-900 hover:text-white"
                            >
                              <ShoppingCart className="h-5 w-5" />
                              {item.title}
                              {cartCount > 0 && (
                                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white">
                                  {cartCount}
                                </span>
                              )}
                            </Link>
                          </SheetClose>
                        );
                      }

                      return (
                        <SheetClose asChild key={item.title}>
                          <Link
                            href={item.href}
                            className={`rounded-xl px-4 py-3 text-lg font-semibold hover:bg-slate-900 hover:text-white ${
                              isNavItemActive(item)
                                ? 'text-white'
                                : 'text-slate-300'
                            }`}
                          >
                            {item.title}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </div>

                  <div className="mt-8 border-t border-slate-800 pt-8">
                    <SheetClose asChild>
                      {user ? (
                        <div className="space-y-3">
                          <Button
                            asChild
                            className="w-full rounded-xl bg-brand-orange-500 py-6 text-lg font-bold text-white hover:bg-brand-orange-600"
                          >
                            <Link href="/dashboard">Go to Dashboard</Link>
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void logout()}
                            className="w-full rounded-xl bg-slate-800 py-6 text-lg font-bold text-white hover:bg-slate-700"
                          >
                            <LogOut className="mr-2 h-5 w-5" />
                            Sign Out
                          </Button>
                        </div>
                      ) : (
                        <Button
                          asChild
                          className="w-full rounded-xl bg-brand-orange-500 py-6 text-lg font-bold text-white hover:bg-brand-orange-600"
                        >
                          <Link href={signInHref}>Sign In to Dashboard</Link>
                        </Button>
                      )}
                    </SheetClose>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  );
}

type ListItemProps = {
  title: string;
  href: string;
  desc: string;
  icon: LucideIcon;
  color?: string;
};

const ListItem = ({ title, href, desc, icon: Icon, color }: ListItemProps) => {
  return (
    <li>
      <Link
        href={href}
        target={href.startsWith('http') ? '_blank' : '_self'}
        rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="group flex items-start gap-4 rounded-xl p-3 transition-colors hover:bg-slate-800"
      >
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${
            color ||
            'from-slate-700 to-slate-800 group-hover:from-slate-600 group-hover:to-slate-700'
          }`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h4 className="mb-1 text-sm font-bold text-white transition-colors group-hover:text-blue-400">
            {title}
          </h4>
          <p className="line-clamp-2 text-xs text-slate-400">{desc}</p>
        </div>
      </Link>
    </li>
  );
};
