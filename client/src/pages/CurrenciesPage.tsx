import { useMemo, useState } from "react";
import { IconCheck, IconSearch } from "../components/Icons";
import type { ApiError } from "../lib/api";
import type { Currency } from "../types";

interface Props {
  currencies: Currency[];
  error: ApiError | null;
  onRetry: () => void;
  selected: string;
  onSelect: (code: string) => void;
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function CurrenciesPage({ currencies, error, onRetry, selected, onSelect }: Props) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return currencies;
    return currencies.filter((c) => norm(c.code).includes(n) || norm(c.name).includes(n));
  }, [q, currencies]);

  return (
    <>
      <div className="search">
        <IconSearch />
        <label htmlFor="q" className="sr-only">
          Rechercher une devise par nom ou code
        </label>
        <input
          id="q"
          type="search"
          placeholder="Rechercher par nom ou code (XOF, franc, naira…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </div>

      {error && (
        <section className="notice error-notice" role="alert">
          <strong>Liste des devises indisponible</strong>
          <span>{error.message}</span>
          <div className="row gap-s">
            <button type="button" className="btn small" onClick={onRetry}>
              Réessayer
            </button>
          </div>
        </section>
      )}

      <ul className="currency-list" role="listbox" aria-label="Devises">
        {list.map((c) => (
          <li key={c.code} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={c.code === selected}
              className={c.code === selected ? "currency selected" : "currency"}
              onClick={() => onSelect(c.code)}
            >
              <b>{c.code}</b>
              <span>{c.name}</span>
              {c.code === selected && <IconCheck />}
            </button>
          </li>
        ))}
        {!error && list.length === 0 && currencies.length > 0 && (
          <li className="empty-list">Aucune devise ne correspond à « {q} ».</li>
        )}
      </ul>
      <p className="legal">
        Seules les devises prises en charge par la source de taux de change sont proposées ; si l'une d'elles est
        momentanément absente de la source, un message vous l'indique.
      </p>
    </>
  );
}
