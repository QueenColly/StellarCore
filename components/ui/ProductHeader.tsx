import Image from "next/image";
import Link from "next/link";
import React from "react";

type ProductHeaderProps = Readonly<{
  current: "home" | "dashboard" | "detail" | "insights";
  variant?: "overlay" | "solid";
}>;

export function ProductHeader({
  current,
  variant = "solid",
}: ProductHeaderProps) {
  return (
    <header className={`product-header product-header--${variant}`} data-nav>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Link className="brand" href="/" aria-label="StellarCore home">
        <Image
          className="brand-logo"
          src="/StellarCore-logo.png"
          alt=""
          width={135}
          height={128}
          priority
          aria-hidden="true"
        />
        StellarCore
      </Link>
      <nav className="product-nav" aria-label="Primary navigation">
        {current === "home" ? (
          <a className="product-nav-secondary" href="#evidence-model">
            Evidence model
          </a>
        ) : (
          <Link href="/">Home</Link>
        )}
        <Link
          className="product-header-cta"
          href="/dashboard"
          aria-current={current === "dashboard" ? "page" : undefined}
        >
          Dashboard <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}
