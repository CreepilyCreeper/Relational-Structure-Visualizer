# download_drive_images.py
import requests
import os
import mimetypes
import json

SHEET_URL = "https://opensheet.elk.sh/1iqLhPX7cjypuQqd741NkuWjM96AJAxOtlNPeNwXECQA/Sheet1"
SELFIE_DIR = "../../../src/assets/selfies"
CHANGED_LIST = "changed_images.json"
FALLBACK_IMAGE = "fallback.png"
DOWNLOADED_IMAGES = "downloaded_images.json"

def get_drive_file_id(url):
    if "id=" in url:
        return url.split("id=")[-1].split("&")[0]
    elif "/file/d/" in url:
        return url.split("/file/d/")[-1].split("/")[0]
    return None

def get_extension_from_content_type(content_type):
    ext = mimetypes.guess_extension(content_type)
    if ext:
        return ext
    if "jpeg" in content_type:
        return ".jpg"
    if "png" in content_type:
        return ".png"
    return ".jpg"

def download_drive_image(file_id, dest_path):
    url = f"https://drive.google.com/uc?export=download&id={file_id}"
    resp = requests.get(url, stream=True)
    if resp.status_code == 200:
        content_type = resp.headers.get("content-type", "")
        ext = get_extension_from_content_type(content_type)
        if not dest_path.endswith(ext):
            dest_path += ext
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(1024):
                f.write(chunk)
        print(f"Downloaded {dest_path}")
        return os.path.basename(dest_path), True
    else:
        print(f"Failed to download {file_id}: {resp.status_code}")
        return FALLBACK_IMAGE, False

def sanitize_filename(name):
    return "".join(c for c in name if c.isalnum() or c in (' ', '_', '-')).rstrip().replace(" ", "_")

def main():
    os.makedirs(SELFIE_DIR, exist_ok=True)
    data = requests.get(SHEET_URL).json()
    # Load previous mapping of name -> file_id
    if os.path.exists(DOWNLOADED_IMAGES):
        with open(DOWNLOADED_IMAGES, "r") as f:
            downloaded_images = json.load(f)
    else:
        downloaded_images = {}

    changed_images = []
    updated_downloaded_images = downloaded_images.copy()

    for row in data:
        name = row.get("name", "").strip()
        selfie_url = row.get("selfie", "").strip()
        selfie_file = FALLBACK_IMAGE
        changed = False
        if selfie_url and name:
            file_id = get_drive_file_id(selfie_url)
            if not file_id:
                continue
            # Only download if file_id is new or changed for this name
            if downloaded_images.get(name) != file_id:
                filename = sanitize_filename(name)
                selfie_file = f"{filename}"
                selfie_path = os.path.join(SELFIE_DIR, selfie_file)
                selfie_file, changed = download_drive_image(file_id, selfie_path)
                if changed and selfie_file != FALLBACK_IMAGE:
                    changed_images.append(os.path.join(SELFIE_DIR, selfie_file))
                    updated_downloaded_images[name] = file_id
            else:
                print(f"Skipping {name}, already downloaded file_id {file_id}")
        # else: skip if no selfie_url or name

    # Save updated mapping
    with open(DOWNLOADED_IMAGES, "w") as f:
        json.dump(updated_downloaded_images, f, indent=2)
    # Output changed images list for next job
    with open(CHANGED_LIST, "w") as f:
        json.dump(changed_images, f)
    print(f"Changed images: {changed_images}")

if __name__ == "__main__":
    main()