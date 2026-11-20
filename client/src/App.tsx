import { useRef, useState } from "react";
import { Brand } from "./components/Brand";
import { IconBack, IconGlobe, IconMarket, IconSettings } from "./components/Icons";
import { StatusPill, healthOf } from "./components/StatusPill";
import { useAuth } from "./hooks/useAuth";
import { useConfig, useCurrencies, useStatus } from "./hooks/useApiData";
import { useHashRoute, useOnline, usePersisted } from "./hooks/useMisc";
import { ConverterPage } from "./pages/ConverterPage";
import { CurrenciesPage } from "./pages/CurrenciesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { WelcomePage } from "./pages/WelcomePage";
import type { Direction, Route } from "./types";

const isCurrencyCode = (v: string): v is string => /^[A-Z]{3}$/.test(v);
const isDirection = (v: string): v is Direction => v === "pi_to_fiat" || v === "fiat_to_pi";

const NAV: { route: Route; label: string; icon: JSX.Element }[] = [
  { route: "marche", label: "Convertir", icon: <IconMarket /> },
  { route: "devises", label: "Devises", icon: <IconGlobe /> },
  { route: "reglages", label: "Réglages", icon: <IconSettings /> },
];


export default function App() {
  const auth = useAuth();
  const [route, navigate] = useHashRoute();
  const config = useConfig();
  const { currencies, error: currenciesError, retry: retryCurrencies } = useCurrencies();
  const { status, error: statusError, loading: statusLoading, refresh: refreshStatus } = useStatus();
  const online = useOnline();

  const [currency, setCurrency] = usePersisted("currency", "XOF", isCurrencyCode);
  const [direction, setDirection] = usePersisted<Direction>("direction", "pi_to_fiat", isDirection);
  const [amount, setAmount] = useState("100");
  const lastConverter = useRef<Route>("marche");
  if (route === "marche") lastConverter.current = route;

  // Première page : bienvenue + connexion. Rien d'autre tant que l'utilisateur n'est pas connecté.
  if (!auth.user && !auth.guest) {
    return (
      <div className="shell">
        <WelcomePage busy={auth.busy} error={auth.error} onLogin={() => void auth.login()} onGuest={auth.continueAsGuest} />
      </div>
    );
  }

  const piValueAvailable = config?.piValueAvailable ?? false;
  const health = healthOf(piValueAvailable, status, statusLoading, online);
  const isConverter = route === "marche";
  const title = route === "devises" ? "Choisir une devise" : "Réglages";

  return (
    <div className="shell">
      <header className={`hero ${isConverter ? "with-tabs" : ""}`}>
        <div className="row between">
          <Brand />
          <div className="row gap-s">
            <StatusPill health={health} />
          </div>
        </div>
        {isConverter ? (
          <div className="page-head">
            <h1>Convertisseur</h1>
          </div>
        ) : (
          <div className="page-head">
            {route === "devises" && (
              <button type="button" className="back" onClick={() => navigate("marche")} aria-label="Retour">
                <IconBack />
              </button>
            )}
            <h1>{title}</h1>
          </div>
        )}
      </header>

      <main className={`content ${isConverter ? "overlap" : ""}`}>
        {isConverter && (
          <ConverterPage
            piValueAvailable={piValueAvailable}
            amount={amount}
            onAmount={setAmount}
            direction={direction}
            onSwap={() => setDirection(direction === "pi_to_fiat" ? "fiat_to_pi" : "pi_to_fiat")}
            currency={currency}
            currencies={currencies}
            onPickCurrency={() => navigate("devises")}
            online={online}
          />
        )}
        {route === "devises" && (
          <CurrenciesPage
            currencies={currencies}
            error={currenciesError}
            onRetry={retryCurrencies}
            selected={currency}
            onSelect={(code) => {
              setCurrency(code);
              navigate("marche");
            }}
          />
        )}
        {route === "reglages" && (
          <SettingsPage
            config={config}
            status={status}
            statusError={statusError}
            statusLoading={statusLoading}
            onRefreshStatus={refreshStatus}
            user={auth.user}
            onLogout={auth.logout}
            onLogin={() => void auth.login()}
            loginBusy={auth.busy}
            loginError={auth.error}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Navigation principale">
        {NAV.map((n) => (
          <button
            key={n.route}
            type="button"
            aria-current={route === n.route ? "page" : undefined}
            onClick={() => navigate(n.route)}
          >
            {n.icon}
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
