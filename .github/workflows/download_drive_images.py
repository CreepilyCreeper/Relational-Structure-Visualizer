# download_drive_images.py
import requests
import os
import mimetypes
import hashlib
import json

SHEET_URL = "https://opensheet.elk.sh/1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA/Sheet1"
SELFIE_DIR = "src/assets/selfies"
CHANGED_LIST = "changed_images.json"
FALLBACK_IMAGE = "fallback.png"

def get_drive_file_id(url):
    # Supports both .../open?id= and .../file/d/ formats
    if "id=" in url:
        return url.split("id=")[-1].split("&")[0]
    elif "/file/d/" in url:
        return url.split("/file/d/")[-1].split("/")[0]
    return None

def get_extension_from_content_type(content_type):
    ext = mimetypes.guess_extension(content_type)
    if ext:
        return ext
    # fallback
    if "jpeg" in content_type:
        return ".jpg"
    if "png" in content_type:
        return ".png"
    return ".jpg"

def file_hash(path):
    if not os.path.exists(path):
        return None
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def download_drive_image(file_id, dest_path):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    resp = requests.get(url, stream=True)
    if resp.status_code == 200:
        content_type = resp.headers.get("content-type", "")
        ext = get_extension_from_content_type(content_type)
        if not dest_path.endswith(ext):
            dest_path += ext
        # Compare hash before and after download
        old_hash = file_hash(dest_path)
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(1024):
                f.write(chunk)
        new_hash = file_hash(dest_path)
        changed = (old_hash != new_hash)
        print(f"Downloaded {dest_path} (changed: {changed})")
        return os.path.basename(dest_path), changed
    else:
        print(f"Failed to download {file_id}: {resp.status_code}")
        return FALLBACK_IMAGE, False

def sanitize_filename(name):
    return "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).rstrip().replace(" ", "_")

def main():
    os.makedirs(SELFIE_DIR, exist_ok=True)
    data = requests.get(SHEET_URL).json()
    changed_images = []
    for row in data:
        name = row.get("name", "").strip()
        selfie_url = row.get("selfie", "").strip()
        selfie_file = FALLBACK_IMAGE
        changed = False
        if selfie_url:
            file_id = get_drive_file_id(selfie_url)
            if file_id and name:
                filename = sanitize_filename(name)
                selfie_file = f"{filename}"
                selfie_path = os.path.join(SELFIE_DIR, selfie_file)
                selfie_file, changed = download_drive_image(file_id, selfie_path)
        if changed and selfie_file != FALLBACK_IMAGE:
            changed_images.append(os.path.join(SELFIE_DIR, selfie_file))
    # Output changed images list for next job
    with open(CHANGED_LIST, "w") as f:
        json.dump(changed_images, f)
    print(f"Changed images: {changed_images}")

if __name__ == "__main__":
    main()