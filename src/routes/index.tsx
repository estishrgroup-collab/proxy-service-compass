import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Check, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { proxyProviders } from "@/lib/proxy-providers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "luxpoxy | Telegram proxy shop" },
      {
        name: "description",
        content: "The luxpoxy Telegram shop for proxy service requests and supplier status.",
      },
      { property: "og:title", content: "luxpoxy | Telegram proxy shop" },
      {
        property: "og:description",
        content: "Proxy service requests through the luxpoxy Telegram bot.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const connectedCount = proxyProviders.filter((provider) => provider.state === "connected").length;

  return (
    <div className="shop-shell">
      <header className="shop-header">
        <div className="shop-container shop-header-inner">
          <a className="shop-brand" href="/" aria-label="luxpoxy home">
            <span className="shop-brand-mark" aria-hidden="true">LX</span>
            <span className="shop-brand-copy">
              <span className="shop-brand-name">luxpoxy</span>
              <span className="shop-brand-caption">ESTISHR GROUP</span>
            </span>
          </a>
          <div className="shop-header-status">
            <span className="shop-live-dot" aria-hidden="true" />
            <span>Telegram linked</span>
            <span className="shop-handle">@lux2proxybot</span>
          </div>
          <Button asChild className="shop-open-button">
            <a href="https://t.me/lux2proxybot" target="_blank" rel="noreferrer">
              Open bot <ArrowUpRight aria-hidden="true" />
            </a>
          </Button>
        </div>
      </header>

      <main className="shop-container shop-main">
        <section className="shop-intro" aria-labelledby="page-title">
          <div className="shop-kicker">TELEGRAM SHOP <span>/</span> OPERATIONS</div>
          <div className="shop-intro-grid">
            <div>
              <h1 id="page-title">luxpoxy</h1>
              <p className="shop-lede">Live SOCKS5 &amp; residential proxies sold at 2x wholesale with automated API delivery in Telegram.</p>
            </div>
            <div className="shop-mode-tag">
              <span className="shop-mode-dot" aria-hidden="true" />
              LIVE CATALOG <span className="shop-mode-divider">·</span> 2X MARKUP
            </div>
          </div>
        </section>

        <section className="shop-overview" aria-label="Shop status">
          <article className="shop-overview-item">
            <div className="shop-overview-label">TELEGRAM BOT</div>
            <div className="shop-overview-value">@lux2proxybot</div>
            <div className="shop-overview-note"><Check aria-hidden="true" /> Connected</div>
          </article>
          <article className="shop-overview-item">
            <div className="shop-overview-label">SECURE SUPPLIERS</div>
            <div className="shop-overview-value">{connectedCount} <span>/ 4</span></div>
            <div className="shop-overview-note">Exclusive and Turbo</div>
          </article>
          <article className="shop-overview-item">
            <div className="shop-overview-label">SELLING MODEL</div>
            <div className="shop-overview-value">2x markup</div>
            <div className="shop-overview-note">Prepaid crypto wallet · auto API buy</div>
          </article>
        </section>

        <section className="shop-suppliers" aria-labelledby="suppliers-title">
          <div className="shop-section-heading">
            <div>
              <div className="shop-kicker">SUPPLIER ACCESS</div>
              <h2 id="suppliers-title">Proxy providers</h2>
            </div>
            <span className="shop-section-count">{String(proxyProviders.length).padStart(2, "0")} SOURCES</span>
          </div>

          <div className="shop-provider-list">
            {proxyProviders.map((provider, index) => {
              const isConnected = provider.state === "connected";

              return (
                <article className="shop-provider-row" key={provider.id}>
                  <span className="shop-provider-index">0{index + 1}</span>
                  <div className="shop-provider-copy">
                    <h3>{provider.name}</h3>
                    <p>{provider.note}</p>
                  </div>
                  <span className={isConnected ? "shop-provider-status is-connected" : "shop-provider-status is-pending"}>
                    {isConnected ? <Check aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
                    {isConnected ? "Connected" : "HTTPS needed"}
                  </span>
                </article>
              );
            })}
          </div>
        </section>

        <footer className="shop-footer">
          <p>Fresh and Smart remain unavailable until secure HTTPS API addresses are provided.</p>
          <p>Automatic supplier buying &amp; refund protection are active; connect a crypto gateway to enable live top-up invoices.</p>
        </footer>
      </main>
    </div>
  );
}
