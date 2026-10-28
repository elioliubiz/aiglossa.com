"""生成静态示例音频的波形摘要清单。"""
import json, subprocess, wave, io
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAMPLES = ROOT / "sites/tools/samples"

def one(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "wav", "-ac", "1", "-ar", "8000", "-"], check=True, capture_output=True).stdout
    with wave.open(io.BytesIO(out), "rb") as w: raw = memoryview(w.readframes(w.getnframes())).cast("h")
    n=96; return {"version":1,"bins":n,"peaks":[round(max(abs(v) for v in raw[i*len(raw)//n:max(i*len(raw)//n+1,(i+1)*len(raw)//n)])*255/32767) for i in range(n)]}

for mp3 in sorted(SAMPLES.glob("*.mp3")):
    flac = mp3.with_suffix(".flac")
    tmp = flac.with_name(flac.stem + ".tmp.flac")
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(mp3), "-c:a", "flac", "-compression_level", "8", str(tmp)], check=True)
    one(tmp)
    tmp.replace(flac)
    mp3.unlink()

data = {p.stem: one(p) for p in sorted(SAMPLES.glob("*.flac"))}
(SAMPLES / "waveforms.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"generated {len(data)} waveforms")
