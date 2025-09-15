import pandas as pd
import requests
import pytz
from datetime import datetime
from pathlib import Path

OUTPUT_DIR = Path("public/data")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

URLS = [
    ("http://rmcab.ambientebogota.gov.co/dynamicTabulars/TabularReportTable?id=58", "Datos_Meteorologicos"),
    ("http://rmcab.ambientebogota.gov.co/dynamicTabulars/TabularReportTable?id=12", "Datos_Aire"),
]

def obtener_datos(url: str) -> pd.DataFrame:
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    df = pd.read_json(data['TabularList'])
    df = df[['stationId', 'name', 'monitors']]

    all_keys = set()
    for monitors_list in df['monitors']:
        for m in monitors_list:
            all_keys.add(m['Name'])

    expanded = {k: [] for k in all_keys}
    expanded['stationId'] = df['stationId']
    expanded['name'] = df['name']

    for monitors_list in df['monitors']:
        row = {k: float('nan') for k in all_keys}
        for m in monitors_list:
            row[m['Name']] = m['value']
        for k in all_keys:
            expanded[k].append(row[k])

    out = pd.DataFrame(expanded)
    out.rename(columns={
        'CO':'CO','NO':'NO','NO2':'NO2','NOX':'NOX',
        'OZONO':'OZONO','PM10':'PM10','PM25':'PM25','SO2':'SO2'
    }, inplace=True)

    tz = pytz.timezone('America/Bogota')
    now = datetime.now(tz)
    out['Fecha'] = now.strftime('%Y-%m-%d')
    out['Hora']  = now.strftime('%H:%M')

    cols = ['Fecha','Hora','name','stationId'] + [c for c in out.columns if c not in ['Fecha','Hora','name','stationId','monitors']]
    return out[cols]

def append_csv(df: pd.DataFrame, path_csv: Path):
    if path_csv.exists():
        base = pd.read_csv(path_csv, sep=';')
        pd.concat([base, df], ignore_index=True).to_csv(path_csv, sep=';', index=False)
    else:
        df.to_csv(path_csv, sep=';', index=False)

def main():
    tz = pytz.timezone('America/Bogota')
    today = datetime.now(tz).strftime('%Y-%m-%d')
    aire_csv = OUTPUT_DIR / f"Datos_Aire_{today}.csv"
    met_csv  = OUTPUT_DIR / f"Datos_Meteorologicos_{today}.csv"

    for url, nombre in URLS:
        df = obtener_datos(url)
        if nombre == "Datos_Aire":
            append_csv(df, aire_csv)
        else:
            append_csv(df, met_csv)
        # instantánea "latest" (opcional)
        df.to_csv(OUTPUT_DIR / f"{nombre}_latest.csv", sep=';', index=False)
        print(f"[OK] {nombre} actualizado")

if __name__ == "__main__":
    main()
