import cv2
import os
import json

SELFIE_CROPPED_DIR = "src/assets/selfiescropped"
CHANGED_LIST = "changed_images.json"

def crop_face(image_path, output_path):
    img = cv2.imread(image_path)
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
    with open(CHANGED_LIST, "r") as f:
        changed_images = json.load(f)
    for img_path in changed_images:
        base = os.path.basename(img_path)
        name, ext = os.path.splitext(base)
        output_path = os.path.join(SELFIE_CROPPED_DIR, f"{name}_CROPPED{ext}")
        crop_face(img_path, output_path)

if __name__ == "__main__":
    main()