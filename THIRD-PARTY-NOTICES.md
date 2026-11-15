# Third-party notices

## heic-to

Foto inspektorius uses `heic-to` (version 1.6.7) for browser-side HEIC/HEIF decoding.
The package is distributed under the GNU Lesser General Public License v3.0 (LGPL-3.0).
Its upstream source and license are available at:
https://github.com/hoppergee/heic-to

The package uses libheif 1.23.7 internally. Refer to the upstream repository for the
corresponding third-party licensing and source details.

## ONNX Runtime Web

The experimental in-browser image quality assessment feature uses `onnxruntime-web`.
See https://github.com/microsoft/onnxruntime and its included license files.

## DBCNN ONNX image-quality model

The experimental DBCNN model is downloaded on first use from:
https://huggingface.co/86Cao/IQA-ONNX-Models
The model repository declares Apache-2.0; the model card notes that original model weights remain subject to their respective licenses. See the repository model card and original DBCNN paper before redistribution.
