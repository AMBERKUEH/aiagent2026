import requests
import base64
import numpy as np
from PIL import Image
from io import BytesIO

# Create an image that passes the paddy leaf guard
# green_ratio >= 0.05 or detail_std >= 22.0
# A random noise green image will easily pass
img_array = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
img_array[:, :, 0] = 0   # R
img_array[:, :, 1] = 200 # G
img_array[:, :, 2] = 0   # B
# Add some noise to increase detail_std
noise = np.random.randint(-50, 50, (224, 224, 3), dtype=np.int16)
img_array = np.clip(img_array.astype(np.int16) + noise, 0, 255).astype(np.uint8)

img = Image.fromarray(img_array, "RGB")
buffered = BytesIO()
img.save(buffered, format="PNG")
img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
img_base64 = f"data:image/png;base64,{img_str}"

res = requests.post(
    "https://smartpaddy-18261887927.asia-southeast1.run.app/api/cv/predict",
    json={"image_base64": img_base64}
)
print("Status:", res.status_code)
print("Response:", res.text)
