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

## onnxruntime-web and user-supplied ONNX models (optional)

When the user selects an ONNX quality model, Foto inspektorius loads `onnxruntime-web` 1.22.0 (Microsoft, MIT)
from the jsDelivr CDN at runtime; it is not bundled. The model file is supplied by the user and stays in the
browser's IndexedDB; its licence is that of the model's authors (e.g. the weights listed on Hugging Face
`86Cao/IQA-ONNX-Models`, whose wrapper is Apache-2.0 while the original weights keep their own licences).
https://github.com/microsoft/onnxruntime
