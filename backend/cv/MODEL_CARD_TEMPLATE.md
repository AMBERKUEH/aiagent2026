# SmartPaddy CV Model Card

## Model

- Name: `{{MODEL_NAME}}`
- Input size: `{{INPUT_SIZE}}`
- Confidence threshold for `unknown`: `{{CONFIDENCE_THRESHOLD}}`

## Primary metric

- Macro-F1 on frozen golden set: `{{MACRO_F1}}`

## Intended use

This model is designed for the SmartPaddy rice leaf scanner MVP. It predicts the most likely primary disease condition from a single field image and returns top-3 suggestions plus confidence.

## Label set

- `healthy`
- `bacterial_blight`
- `blast`
- `brown_spot`
- `hispa`
- `tungro`

## Known limits

- Low-light, motion blur, cluttered backgrounds, and extreme zoom levels can reduce reliability.
- The model should abstain to `unknown` below the configured confidence threshold rather than over-claim certainty.
- This MVP is classification-first and does not localize lesions.
