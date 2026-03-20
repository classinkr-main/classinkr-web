from rembg import remove
from PIL import Image
import os
import glob

input_dir = r'public\images\use-cases'
for img_path in glob.glob(os.path.join(input_dir, '*.png')):
    if '_nobg' in img_path: continue
    print(f"Processing {img_path}")
    try:
        with open(img_path, 'rb') as i:
            input_data = i.read()
            output_data = remove(input_data)
        with open(img_path, 'wb') as o:
            o.write(output_data)
        print(f"Saved removed bg to {img_path}")
    except Exception as e:
        print(f"Error on {img_path}: {e}")
