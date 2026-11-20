import { useEffect, useState } from "react";
import { ApiError, api, type PassStatus } from "../lib/api";
import { piAuthenticateWith, piCreatePayment, type IncompletePayment } from "../lib/pi";

type Phase = { s: "idle" } | { s: "busy"; step: string } | { s: "done"; text: string } | { s: "error"; text: string };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Pass payant : prix fixe en Pi, fixé par le serveur. Absent si le serveur ne l'offre pas. */
export function PassCard() {
  const [offer, setOffer] = useState<PassStatus | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ s: "idle" });

  useEffect(() => {
    const c = new AbortController();
    api.passStatus(undefined, c.signal).then(setOffer).catch(() => setOffer(null));
    return () => c.abort();
  }, []);

  if (!offer?.enabled) return null;

  async function buy() {
    setPhase({ s: "busy", step: "Autorisation Pi en cours…" });
    try {
      let token = "";
      const onIncomplete = (p: IncompletePayment) => {
        // Paiement resté en suspens : on le termine côté serveur s'il a déjà une transaction.
        if (p.identifier && p.transaction?.txid && token) void api.passComplete(token, p.identifier, p.transaction.txid).catch(() => undefined);
      };
      token = await piAuthenticateWith(["username", "payments"], onIncomplete);
      const current = await api.passStatus(token).catch(() => null);
      if (current?.expiresAt) setExpiresAt(current.expiresAt);
      setPhase({ s: "busy", step: "Validez le paiement dans la fenêtre Pi…" });
      piCreatePayment(
        { amount: offer!.price, memo: `ValueConvert — pass ${offer!.days} jours`, metadata: { purpose: "pass-30j" } },
        {
          approve: async (id) => {
            await api.passApprove(token, id);
          },
          complete: async (id, txid) => {
            const r = await api.passComplete(token, id, txid);
            if (r.expiresAt) setExpiresAt(r.expiresAt);
            setPhase({ s: "done", text: r.expiresAt ? `Pass actif jusqu'au ${fmtDate(r.expiresAt)}.` : "Paiement reçu. Merci !" });
          },
          cancel: () => setPhase({ s: "error", text: "Paiement annulé." }),
          error: (e) => setPhase({ s: "error", text: e instanceof ApiError ? e.message : "Le paiement a échoué. Réessayez." }),
        },
      );
    } catch (e) {
      const msg = e instanceof Error && e.message === "PI_UNAVAILABLE" ? "Ouvrez ValueConvert dans Pi Browser pour payer." : e instanceof ApiError ? e.message : "Paiement impossible. Réessayez.";
      setPhase({ s: "error", text: msg });
    }
  }

  return (
    <section className="card" aria-label={`Pass ${offer.days} jours`}>
      <h2>Pass {offer.days} jours</h2>
      <p className="hint">
        Prix fixe : {offer.price} Pi pour {offer.days} jours d'accès. Le prix est exprimé en Pi ; il n'est pas calculé à partir
        d'une devise. Paiement unique, sans abonnement automatique.
      </p>
      {expiresAt && new Date(expiresAt).getTime() > Date.now() && <p className="notice ok-notice">Pass actif jusqu'au {fmtDate(expiresAt)}.</p>}
      <button type="button" className="btn" onClick={() => void buy()} disabled={phase.s === "busy"}>
        Obtenir le pass ({offer.price} Pi)
      </button>
      {phase.s === "busy" && <p className="notice warn-notice" role="status">{phase.step}</p>}
      {phase.s === "done" && <p className="notice ok-notice" role="status">{phase.text}</p>}
      {phase.s === "error" && <p className="notice error-notice" role="alert">{phase.text}</p>}
    </section>
  );
}
