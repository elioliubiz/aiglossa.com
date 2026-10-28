"""从仓库外的官方示例音频生成前端波形摘要清单。"""
import argparse
import io
import json
import subprocess
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "sites/tools/samples/waveforms.json"

def one(path):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "wav", "-ac", "1", "-ar", "8000", "-"], check=True, capture_output=True).stdout
    with wave.open(io.BytesIO(out), "rb") as w: raw = memoryview(w.readframes(w.getnframes())).cast("h")
    n=96; return {"version":1,"bins":n,"peaks":[round(max(abs(v) for v in raw[i*len(raw)//n:max(i*len(raw)//n+1,(i+1)*len(raw)//n)])*255/32767) for i in range(n)]}

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("audio_dir", type=Path, help="包含官方 FLAC 示例的仓库外目录")
args = parser.parse_args()
files = sorted(args.audio_dir.glob("*.flac"))
if not files:
    parser.error(f"目录中没有 FLAC 文件：{args.audio_dir}")
data = {p.stem: one(p) for p in files}
OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"generated {len(data)} waveforms")
