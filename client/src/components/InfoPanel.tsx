import { formatDecimal, formatWhen } from "../lib/format";
import type { ConvertResponse, SourceInfo } from "../types";
import { StateChip } from "./StatusPill";

function SourceRow({ label, info, now }: { label: string; info: SourceInfo; now: number }) {
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd>
        <span className="row gap-s end">
          <strong>{info.name}</strong>
          <StateChip state={info.state} />
        </span>
        <span className="sub">Mise à jour : {formatWhen(info.sourceUpdatedAt ?? info.fetchedAt, now)}</span>
      </dd>
    </div>
  );
}

export function InfoPanel({ data, now }: { data: ConvertResponse; now: number }) {
  const usd = data.currency.code === "USD";
  return (
    <section className="card info" aria-label="Détails du calcul">
      <dl>
        <div className="info-row">
          <dt>Prix du Pi utilisé</dt>
          <dd>
            <strong>1 Pi = {formatDecimal(data.priceUsd)} USD</strong>
            {!usd && (
              <span className="sub">
                soit {formatDecimal(data.unitPriceFiat, { minFraction: data.currency.decimals })} {data.currency.code}
              </span>
            )}
          </dd>
        </div>
        {!usd && (
          <div className="info-row">
            <dt>Taux de change</dt>
            <dd>
              <strong>
                1 USD = {formatDecimal(data.usdToFiat)} {data.currency.code}
              </strong>
            </dd>
          </div>
        )}
        {data.sources.price && <SourceRow label="Source du prix" info={data.sources.price} now={now} />}
        {data.sources.fx && <SourceRow label="Source des taux" info={data.sources.fx} now={now} />}
      </dl>
      <p className="attrib">
        {data.sources.price && (
          <>
            <a href={data.sources.price.attribution.url} target="_blank" rel="noopener noreferrer">
              {data.sources.price.attribution.text}
            </a>
            {" · "}
          </>
        )}
        {data.sources.fx ? (
          <a href={data.sources.fx.attribution.url} target="_blank" rel="noopener noreferrer">
            {data.sources.fx.attribution.text}
          </a>
        ) : null}
      </p>
    </section>
  );
}
