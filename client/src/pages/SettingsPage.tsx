import { StateChip } from "../components/StatusPill";
import { useNow } from "../hooks/useMisc";
import type { ApiError } from "../lib/api";
import { formatWhen } from "../lib/format";
import { APP_VERSION } from "../version";
import { PassCard } from "../components/PassCard";
import type { AppConfig, SourceInfo, StatusResponse } from "../types";

interface Props {
  config: AppConfig | null;
  status: StatusResponse | null;
  statusError: ApiError | null;
  statusLoading: boolean;
  onRefreshStatus: () => void;
  user: string | null;
  onLogout: () => void;
  onLogin: () => void;
  loginBusy: boolean;
  loginError: string | null;
}

function SourceCard({ title, info, now }: { title: string; info: SourceInfo; now: number }) {
  return (
    <div className="info-row">
      <dt>{title}</dt>
      <dd>
        <span className="row gap-s end">
          <strong>{info.name}</strong>
          <StateChip state={info.state} />
        </span>
        {info.state === "unavailable" ? (
          <span className="sub">Aucune donnée valide pour le moment.</span>
        ) : (
          <span className="sub">Mise à jour : {formatWhen(info.sourceUpdatedAt ?? info.fetchedAt, now)}</span>
        )}
        <a className="sub" href={info.attribution.url} target="_blank" rel="noopener noreferrer">
          {info.attribution.text}
        </a>
      </dd>
    </div>
  );
}

export function SettingsPage(p: Props) {
  const now = useNow();

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>Sources de données</h2>
          <button type="button" className="btn small ghost" onClick={p.onRefreshStatus} disabled={p.statusLoading}>
            {p.statusLoading ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
        {p.status ? (
          <dl>
            {p.status.price ? (
              <SourceCard title="Prix du Pi" info={p.status.price} now={now} />
            ) : (
              <div className="info-row">
                <dt>Prix du Pi</dt>
                <dd>
                  <strong>À venir</strong>
                  <span className="sub">Pas encore disponible</span>
                </dd>
              </div>
            )}
            <SourceCard title="Taux de change" info={p.status.fx} now={now} />
          </dl>
        ) : (
          <p className="hint error">{p.statusError?.message ?? "État des sources en cours de chargement…"}</p>
        )}
        <p className="hint">
          Aucune valeur n'est inventée : tant que la valeur du Pi n'est pas disponible, elle est indiquée « à venir ».
        </p>
      </section>

      <section className="card">
        <h2>Compte</h2>
        <p className="hint">{p.user ? `Connecté en tant que ${p.user}.` : "Vous utilisez l'application sans être connecté."}</p>
        {p.user ? (
          <button type="button" className="btn ghost" onClick={p.onLogout}>
            Se déconnecter
          </button>
        ) : (
          <button type="button" className="btn" onClick={p.onLogin} disabled={p.loginBusy}>
            {p.loginBusy ? "Connexion…" : "Se connecter avec Pi"}
          </button>
        )}
        {p.loginError && !p.user && (
          <p className="notice error-notice" role="alert">
            {p.loginError}
          </p>
        )}
      </section>

      <PassCard />

      <section className="card">
        <h2>À propos</h2>
        <p className="hint">
          ValueConvert convertit des montants entre le Pi et des monnaies fiat. Ce n'est pas une plateforme d'achat, de
          vente ou de transfert de cryptomonnaies. Les résultats sont des estimations indicatives, jamais des
          garanties.
        </p>
        <p className="hint">
          Application indépendante, non affiliée à Pi Network et non approuvée par Pi Network. Pi Network is a trademark
          of PI Community Company.
        </p>
        <p className="hint">
          <a href="/confidentialite">Politique de confidentialité</a> · <a href="/conditions">Conditions d'utilisation</a>
        </p>
        <p className="hint">Version {APP_VERSION}</p>
      </section>
    </>
  );
}
