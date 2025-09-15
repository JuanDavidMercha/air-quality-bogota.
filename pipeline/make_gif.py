import os
import pandas as pd
import numpy as np
import imageio.v2 as imageio
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageDraw

DATA_DIR = Path("public/data")
GIF_DIR  = Path("public/gifs")
APP_DIR  = Path("app")
GIF_DIR.mkdir(parents=True, exist_ok=True)

# límites aproximados de Bogotá (ajustan la posición de los puntos)
LON_MIN, LON_MAX = -74.25, -73.95
LAT_MIN, LAT_MAX = 4.50, 4.85

def to_xy(lon, lat, W, H):
    x = int((lon - LON_MIN) / (LON_MAX - LON_MIN) * W)
    y = int((LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * H)
    return x, y

def color_for_value(val):
    if pd.isna(val): return (180,180,180,140)
    if val < 50:   return ( 80,180, 80,160)
    if val < 100:  return (230,200, 50,160)
    return (220, 70, 70,160)

def main():
    day = datetime.now().strftime("%Y-%m-%d")
    aire_csv = DATA_DIR / f"Datos_Aire_{day}.csv"
    met_csv  = DATA_DIR / f"Datos_Meteorologicos_{day}.csv"
    if not aire_csv.exists() or not met_csv.exists():
        print("[WARN] Falta CSV del día; salto GIF.")
        return

    df_air = pd.read_csv(aire_csv, sep=';')
    df_met = pd.read_csv(met_csv, sep=';')
    stations = pd.read_csv(APP_DIR / "stations_bogota.csv")

    contaminante = os.getenv("CONTAM", "PM25")
    if contaminante not in df_air.columns:
        contaminante = "PM25" if "PM25" in df_air.columns else (set(df_air.columns)-{"Fecha","Hora","name","stationId"}).pop()

    horas = sorted(df_air["Hora"].dropna().unique().tolist())

    base = Image.open(APP_DIR / "bogota_base.png").convert("RGBA")  # imagen 800×600 aprox
    W, H = base.size

    frames = []
    for h in horas:
        fr = base.copy()
        draw = ImageDraw.Draw(fr, "RGBA")
        dfa = df_air[df_air["Hora"] == h]
        dfm = df_met[df_met["Hora"] == h]

        for _, st in stations.iterrows():
            name, lon, lat = st["name"], st["lon"], st["lat"]
            x, y = to_xy(lon, lat, W, H)
            row = dfa[dfa["name"] == name]
            val = row[contaminante].values[0] if not row.empty and contaminante in row.columns else np.nan
            draw.ellipse((x-10,y-10,x+10,y+10), fill=color_for_value(val), outline=(0,0,0,120))

            rowm = dfm[dfm["name"] == name]
            if not rowm.empty and "Vel Viento" in rowm.columns and "Dir Viento" in rowm.columns:
                vel = rowm["Vel Viento"].values[0]; dgr = rowm["Dir Viento"].values[0]
                if vel != -9999 and dgr != -9999:
                    ang = np.deg2rad(dgr)
                    dx = int(np.cos(ang)*15); dy = int(-np.sin(ang)*15)
                    draw.line((x,y,x+dx,y+dy), fill=(0,0,0,200), width=2)

        draw.rectangle((0,0,W,28), fill=(255,255,255,180))
        draw.text((8,6), f"{contaminante} — {day} {h}", fill=(0,0,0,220))
        frames.append(fr)

    out = GIF_DIR / f"GIF_{contaminante}_{day}.gif"
    imageio.mimsave(out, [f.convert("P") for f in frames], fps=2)
    imageio.mimsave(GIF_DIR / "latest.gif", [f.convert("P") for f in frames], fps=2)
    print(f"[OK] GIF generado: {out}")

if __name__ == "__main__":
    main()
