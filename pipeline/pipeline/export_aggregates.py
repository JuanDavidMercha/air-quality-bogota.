import pandas as pd
from pathlib import Path
import glob

DATA_DIR = Path("public/data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

def load_concat(pat: str) -> pd.DataFrame:
    files = glob.glob(str(DATA_DIR / pat))
    if not files: return pd.DataFrame()
    dfs = []
    for f in files:
        try: dfs.append(pd.read_csv(f, sep=';'))
        except: pass
    return pd.concat(dfs, ignore_index=True) if dfs else pd.DataFrame()

def main():
    df = load_concat("Datos_Aire_*.csv")
    if df.empty:
        print("[WARN] No hay datos aire para agregar"); return

    df["timestamp"] = pd.to_datetime(df["Fecha"] + " " + df["Hora"], errors="coerce")
    df = df.dropna(subset=["timestamp"])

    base = ["timestamp","name","stationId"]
    pols = [c for c in df.columns if c not in base + ["Fecha","Hora"]]

    long = pd.concat(
        [(df[base + [p]].rename(columns={p:"value"}).assign(pollutant=p)) for p in pols],
        ignore_index=True
    )

    daily = (long.set_index("timestamp")
        .groupby([pd.Grouper(freq="D"), "name", "pollutant"])["value"]
        .agg(["mean","max","min","count"])
        .reset_index()
        .rename(columns={"timestamp":"date"}))

    weekly = (long.set_index("timestamp")
        .groupby([pd.Grouper(freq="W-MON"), "name", "pollutant"])["value"]
        .agg(["mean","max","min","count"])
        .reset_index()
        .rename(columns={"timestamp":"week"}))

    DATA_DIR.joinpath("timeseries.json").write_text(long.to_json(orient="records", date_format="iso"))
    DATA_DIR.joinpath("daily.json").write_text(daily.to_json(orient="records", date_format="iso"))
    DATA_DIR.joinpath("weekly.json").write_text(weekly.to_json(orient="records", date_format="iso"))
    print("[OK] Exportados daily.json, weekly.json, timeseries.json")

if __name__ == "__main__":
    main()
