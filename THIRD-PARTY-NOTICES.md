# Third-party notices

## heic-to

Foto inspektorius uses `heic-to` (version 1.6.7) for browser-side HEIC/HEIF decoding.
The package is distributed under the GNU Lesser General Public License v3.0 (LGPL-3.0).
Its upstream source and license are available at:
https://github.com/hoppergee/heic-to

The package uses libheif 1.23.7 internally. Refer to the upstream repository for the
corresponding third-party licensing and source details.

## Transformers.js and the CLIP model (optional AI quality check)

The optional "AI antra nuomonė" feature loads Transformers.js (Hugging Face, Apache-2.0)
from the jsDelivr CDN and downloads the model `Xenova/clip-vit-base-patch16` (an ONNX
conversion of OpenAI CLIP) from Hugging Face. Both are fetched at runtime only after the
user clicks "Atsisiųsti ir įjungti AI"; neither is bundled with Foto inspektorius.
See the model card on Hugging Face for the model's license terms.
https://github.com/huggingface/transformers.js
