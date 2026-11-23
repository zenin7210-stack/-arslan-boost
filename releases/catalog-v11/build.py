"""Assemble the catalog release from immutable repository inputs."""
import hashlib
import lzma
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile
from PIL import Image, ImageEnhance

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
TARGET = Path(sys.argv[1]).resolve()
ARCHIVE = REPO / "ARSLAN_BOOST_PRO_SAFE_v3_2026-11-19.zip"
if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != "d5bf258cabdd2f8def1f701292bc6f7d01233463a60ce72b4b8ef45642f49828":
    raise ValueError("Unexpected baseline archive")
TARGET.mkdir(exist_ok=True, parents=True)
if any(TARGET.iterdir()):
    raise ValueError("Build directory must be empty")

def records(version):
    for line in (HERE / (version + ".sha256")).read_text().splitlines():
        digest, name = line.split("  ", 1)
        yield digest, name

def verify(version):
    for digest, name in records(version):
        if hashlib.sha256((TARGET / name).read_bytes()).hexdigest() != digest:
            raise ValueError(f"{version} build mismatch: {name}")

def apply(patch):
    subprocess.run(["git", "apply", "--whitespace=nowarn", "-"], cwd=TARGET, input=patch, check=True)

with ZipFile(ARCHIVE) as archive:
    for _, name in records("v10"):
        old = "arslan-boost-cloudflare/" + name
        if old in archive.namelist():
            dest = TARGET / name
            dest.parent.mkdir(exist_ok=True, parents=True)
            dest.write_bytes(archive.read(old))
subprocess.run(["git", "init", "-q"], cwd=TARGET, check=True)
apply(lzma.decompress((HERE / "v10-source.patch.xz").read_bytes()))
assets = TARGET / "public/assets"
shutil.copyfile(REPO / "releases/start-banner.jpg", assets / "start-banner.jpg")
with Image.open(assets / "start-banner.jpg") as image:
    banner = image.convert("RGB").crop((12, 48, 988, 536)).resize((1280, 640), Image.Resampling.LANCZOS)
    banner = ImageEnhance.Sharpness(ImageEnhance.Contrast(banner).enhance(1.10)).enhance(1.20)
    banner.save(assets / "start-welcome-v6.jpg", "JPEG", quality=88, optimize=True, progressive=True)
admin = assets / "donat/admin"
admin.mkdir(exist_ok=True)
for art in (assets / "donat").glob("cover-*.webp"):
    with Image.open(art) as image:
        image.convert("RGB").save(admin / (art.stem + ".jpg"), "JPEG", quality=91, optimize=True, subsampling=0)
verify("v10")
apply((HERE / "catalog.patch").read_bytes())
for art in (HERE / "art").glob("*.webp"):
    shutil.copyfile(art, assets / "donat/catalog" / art.name)
shutil.copyfile(HERE / "art/chat-welcome.jpg", assets / "donat/catalog/chat-welcome.jpg")
verify("v11")
apply((HERE / "welcome-hour.patch").read_bytes())
print("Source, static assets, catalog and production configuration verified.")
