# Identity-preserving img2img workflows for ComfyUI

Three drag-and-drop workflows for editing an existing image while keeping the
subject's face intact. Drag a `.json` onto the ComfyUI canvas to load it.

| File | What it does |
|---|---|
| `01-qwen-image-edit-2509-identity-lock.json` | Instruction-driven edit (Qwen-Image-Edit-2509) + hard face-lock composite |
| `02-sdxl-instantid-img2img.json` | Uncensored SDXL img2img with InstantID identity conditioning |
| `03-uncensored-refiner-pass.json` | Low-denoise refine pass over the output of workflow 01 |

## Recommendation

Start with **01**, and chain **03** after it when the base editor renders the
subject matter too conservatively.

`Qwen-Image-Edit-2509` is the strongest open instruction editor for identity
retention right now: you tell it what to change in plain language and it leaves
everything else — including facial structure — alone. It accepts up to three
reference images, so an extra clean portrait can be fed in as `image2` to
reinforce the identity. `Flux.1 Kontext dev` is the main alternative but drifts
faces more on multi-turn edits and carries a non-commercial license.

Because no diffusion editor is pixel-exact on faces, workflow 01 also composites
the original face back over the result through a feathered painted mask
(`FeatherMask` → `ImageCompositeMasked`). That is the "strongly maintains facial
features" part — it is exact, not approximate. It only works when the edit keeps
the head roughly in place (clothing, background, lighting, style edits). For
edits that move or re-pose the head, bypass the composite and rely on
workflow 02's InstantID conditioning instead.

Note: I could not identify "firered" as an image-editing method — the closest
matches are **FireFlow** (fast rectified-flow inversion for semantic editing,
which preserves un-edited regions well) and **FLUX.1 Redux** (a variation
adapter, not an editor). Neither has first-class ComfyUI support comparable to
the above; if you meant something else, say which and this can be reworked.

## Models to download

Everything goes under `ComfyUI/models/`:

- `diffusion_models/qwen_image_edit_2509_fp8_e4m3fn.safetensors`
- `text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors`
- `vae/qwen_image_vae.safetensors`
- `loras/Qwen-Image-Lightning-4steps-V1.0.safetensors` (optional, 4-step speedup)
- `checkpoints/<an uncensored SDXL checkpoint>` for workflows 02 and 03
- InstantID (workflow 02): `instantid/ip-adapter.bin`,
  `controlnet/instantid/diffusion_pytorch_model.safetensors`,
  `insightface/models/antelopev2/`

Workflow 02 needs the `ComfyUI_InstantID` custom nodes; 01 and 03 are core nodes
only. Press `R` in the browser after adding model files so the dropdowns refresh.

## Usage notes

- **Workflow 01**: load the source image, right-click it → *Open in MaskEditor*
  and paint over the face; that mask drives the face lock. Write the edit
  instruction in the positive `TextEncodeQwenImageEditPlus` node. With the
  Lightning LoRA use 4 steps / cfg 1.0; bypass it and use ~20 steps / cfg 2.5
  for maximum quality. Two `SaveImage` nodes let you compare before/after the
  face lock.
- **Workflow 02**: `denoise` on the KSampler is the main dial — 0.45 keeps most
  of the original, 0.65 is a heavy rewrite. `ApplyInstantID` weight 0.85 with
  `image_kps` wired from the source keeps the original head pose.
- **Workflow 03**: `denoise` 0.25–0.40. Higher than 0.45 and it starts inventing
  a new face, which defeats the point.
- Content LoRA slots are wired in and bypassed (purple nodes). Un-bypass with
  Ctrl+B after pointing them at a real file.

## Scope

These are for images you have the right to edit — your own photos, consenting
adults, or fictional/synthetic characters. Putting a real person's face on
sexual imagery without their consent is out of scope here.
