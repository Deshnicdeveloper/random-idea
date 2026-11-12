#!/bin/sh
# Downloads the Kokoro model files (about 355 MB) from the kokoro-onnx GitHub release.
set -e
mkdir -p models
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "models/$f" ] || curl -fL -o "models/$f" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f"
done
echo "Models ready."
