"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Truck, Menu, X, LayoutDashboard, Eye } from 'lucide-react';
import { useFleetStore } from "@/store/useFleetStore";

export function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Status global de telemetría (Zustand)
  const hasData = useFleetStore(s => s.rawParsedData !== null || s.isHistoricalView);

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/auditoria', label: 'Auditoría', icon: Eye, requireData: true },
  ];

  return (
    <header className="relative shrink-0 border-b border-zinc-900 bg-black z-50">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="flex h-16 items-center justify-between">

          {/* Logo y Nombre */}
          <div className="flex items-center gap-3 md:gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center shadow-lg shadow-orange-600/20 border border-orange-500/50">
                <Truck className="h-4 w-4 text-black" />
              </div>
              <span className="font-heading font-bold text-2xl tracking-tigher text-zinc-100 uppercase">
                Analytics<span className="text-orange-500">GPS</span>
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-1 bg-zinc-900/50 p-1 rounded-xl border border-zinc-800/50">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                const isDisabled = link.requireData && !hasData;
                const Icon = link.icon;

                return (
                  <Link
                    key={link.href}
                    href={isDisabled ? '#' : link.href}
                    onClick={(e) => isDisabled && e.preventDefault()}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
                      ${isActive
                        ? 'bg-zinc-900 text-orange-400 shadow-sm border border-orange-500/30'
                        : isDisabled
                          ? 'text-zinc-700 cursor-not-allowed hidden lg:flex'
                          : 'text-zinc-400 hover:text-orange-400 hover:bg-orange-950/20 border border-transparent'
                      }
                    `}
                    title={isDisabled ? 'Procesa datos en el Dashboard primero' : ''}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-orange-500' : ''}`} />
                    {link.label}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right Side Info & Mobile Toggle */}
          <div className="flex items-center gap-4">

            <div className="hidden sm:flex items-center text-[10px] bg-[#111] border border-orange-900/30 px-3 py-1.5 rounded-full text-orange-500 mr-2 uppercase tracking-widest font-bold">
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
              </span>
              En Línea
            </div>

            <button className="flex items-center gap-2 group p-1 rounded-full hover:bg-zinc-800/50 transition-colors">
              <div className="text-right hidden sm:block mr-1">
                <p className="text-sm font-medium leading-none text-zinc-200 transition-colors">Admin</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-orange-600 flex items-center justify-center text-sm font-medium text-black border border-orange-500 group-hover:border-orange-400 transition-colors shadow-sm">
                <User className="h-4 w-4" />
              </div>
            </button>

            {/* Hamburger Button (Mobile Only) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 -mr-2 text-zinc-400 hover:text-white rounded-lg transition-colors bg-zinc-900/50 border border-zinc-800"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Navigation Dropdown */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-64 border-b border-zinc-800/80 shadow-2xl bg-zinc-950' : 'max-h-0'}`}
      >
        <nav className="px-4 py-4 flex flex-col gap-2">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            const isDisabled = link.requireData && !hasData;
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={isDisabled ? '#' : link.href}
                onClick={(e) => {
                  if (isDisabled) e.preventDefault();
                  else setMobileMenuOpen(false);
                }}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                  ${isActive
                    ? 'bg-orange-950/20 text-orange-400 border border-orange-500/30'
                    : isDisabled
                      ? 'text-zinc-700 bg-black'
                      : 'text-zinc-400 hover:bg-zinc-900 hover:text-orange-500 border border-transparent'
                  }
                `}
              >
                <div className={`p-1.5 rounded-md ${isActive ? 'bg-orange-500/10 text-orange-500' : 'bg-zinc-800 text-zinc-500'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {link.label}
                {isDisabled && <span className="ml-auto text-[10px] text-zinc-600 bg-zinc-900 px-2 flex items-center rounded-sm">Sin datos</span>}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  );
}
