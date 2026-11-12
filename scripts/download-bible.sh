#!/bin/sh
# Downloads the public-domain Bible texts Selah is built from (~21 MB) into data/raw/.
#   KJV, BSB  scrollmapper/bible_databases (formats/json)
#   LSG 1910  Beblia/Holy-Bible-XML-Format (FrenchBible.xml = Louis Segond 1910)
# Then run: npm run build:bible   (or simply: npm run setup)
set -e
cd "$(dirname "$0")/.."
mkdir -p data/raw
get() { [ -s "data/raw/$1" ] && echo "✓ $1 (already downloaded)" || { echo "↓ $1"; curl -fsSL -o "data/raw/$1" "$2"; }; }
get KJV.json "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json"
get BSB.json "https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json"
get LSG.xml  "https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/FrenchBible.xml"
echo "Bible sources ready in data/raw/"
