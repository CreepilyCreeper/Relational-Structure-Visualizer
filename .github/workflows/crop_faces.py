import cv2
import os
import json
import numpy as np  # <-- Add numpy for imdecode workaround

SELFIE_CROPPED_DIR = "src/assets/selfiescropped"
WORKFLOWS_DIR = os.path.dirname(__file__)
TO_CROP_LIST = os.path.join(WORKFLOWS_DIR, "to_crop_images.json")

def imread_unicode(path):
    # Read image with non-ASCII path using imdecode workaround
    try:
        with open(path, 'rb') as f:
            data = f.read()
        img_array = np.frombuffer(data, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        return img
    except Exception as e:
        print(f"Error reading {path}: {e}")
        return None

def crop_face(image_path, output_path):
    # Normalize and get absolute path
    image_path = os.path.abspath(os.path.normpath(image_path))
    img = imread_unicode(image_path)  # Use robust imread
    if img is None:
        print(f"Could not read {image_path}")
        return
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = face_cascade.detectMultiScale(gray, 1.1, 4)
    if len(faces) == 0:
        print(f"No face found in {image_path}")
        return
    x, y, w, h = faces[0]  # Only crop the first detected face
    cropped = img[y:y+h, x:x+w]
    cv2.imwrite(output_path, cropped)
    print(f"Cropped face saved to {output_path}")

def main():
    os.makedirs(SELFIE_CROPPED_DIR, exist_ok=True)
    with open(TO_CROP_LIST, "r") as f:
        to_crop_images = json.load(f)
    # Make a copy to iterate over since we'll modify the list
    images_to_process = to_crop_images.copy()
    for img_path in images_to_process:
        base = os.path.basename(img_path)
        name, ext = os.path.splitext(base)
        output_path = os.path.join(SELFIE_CROPPED_DIR, f"{name}_CROPPED{ext}")
        crop_face(img_path, output_path)
        # Remove the entry from to_crop_images.json after processing
        to_crop_images.remove(img_path)
        with open(TO_CROP_LIST, "w") as f:
            json.dump(to_crop_images, f)

if __name__ == "__main__":
    main()