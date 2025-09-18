# download_drive_images.py
import requests
import os
import mimetypes
import json
import shutil

CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'config.json')
with open(CONFIG_PATH, 'r') as f:
    config = json.load(f)
SHEET_URL = f"https://opensheet.elk.sh/{config['sheetId']}/{config['sheetName']}"
SELFIE_DIR = "src/assets/selfies"
WORKFLOWS_DIR = os.path.dirname(__file__)
DOWNLOADED_IMAGES = os.path.join(WORKFLOWS_DIR, "downloaded_images.json")
TO_CROP_LIST = os.path.join(WORKFLOWS_DIR, "to_crop_images.json")
FALLBACK_IMAGE = "fallback.png"

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

def save_downloaded_images(downloaded_images, action, name=None, file_id=None):
    if not os.path.exists(DOWNLOADED_IMAGES):
        print(f"[DEBUG] Creating {DOWNLOADED_IMAGES}")
    else:
        print(f"[DEBUG] Modifying {DOWNLOADED_IMAGES}")
    if action == "add":
        print(f"[DEBUG] Added/Updated: {name} -> {file_id}")
    with open(DOWNLOADED_IMAGES, "w") as f:
        json.dump(downloaded_images, f, indent=2)

def save_to_crop_images(to_crop_images):
    if not os.path.exists(TO_CROP_LIST):
        print(f"[DEBUG] Creating {TO_CROP_LIST}")
    else:
        print(f"[DEBUG] Modifying {TO_CROP_LIST}")
    with open(TO_CROP_LIST, "w") as f:
        json.dump(to_crop_images, f)
    print(f"[DEBUG] Images to crop (live update): {to_crop_images}")

def main():
    os.makedirs(SELFIE_DIR, exist_ok=True)
    data = requests.get(SHEET_URL).json()
    # Load previous mapping of name -> file_id
    if os.path.exists(DOWNLOADED_IMAGES):
        with open(DOWNLOADED_IMAGES, "r") as f:
            downloaded_images = json.load(f)
    else:
        downloaded_images = {}

    # Load or initialize to_crop_images
    if os.path.exists(TO_CROP_LIST):
        with open(TO_CROP_LIST, "r") as f:
            to_crop_images = json.load(f)
    else:
        to_crop_images = []

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
                # Check if file_id exists under another name
                found_existing = False
                for other_name, other_file_id in downloaded_images.items():
                    if other_file_id == file_id:
                        # Found existing file, copy it
                        filename = sanitize_filename(name)
                        selfie_file = f"{filename}"
                        # Find the extension of the existing file
                        for ext in [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tiff", ".ico", ".heic"]:
                            src_path = os.path.join(SELFIE_DIR, sanitize_filename(other_name) + ext)
                            if os.path.exists(src_path):
                                dest_path = os.path.join(SELFIE_DIR, selfie_file + ext)
                                shutil.copy2(src_path, dest_path)
                                print(f"Copied {src_path} to {dest_path} for {name}")
                                selfie_file = selfie_file + ext
                                selfie_full_path = dest_path
                                found_existing = True
                                break
                        if found_existing:
                            # Update mappings and crop list
                            updated_downloaded_images[name] = file_id
                            save_downloaded_images(updated_downloaded_images, "add", name, file_id)
                            if selfie_full_path not in to_crop_images:
                                to_crop_images.append(selfie_full_path)
                                save_to_crop_images(to_crop_images)
                        break
                if not found_existing:
                    # Not found, download as before
                    filename = sanitize_filename(name)
                    selfie_file = f"{filename}"
                    selfie_path = os.path.join(SELFIE_DIR, selfie_file)
                    selfie_file, changed = download_drive_image(file_id, selfie_path)
                    if changed and selfie_file != FALLBACK_IMAGE:
                        selfie_full_path = os.path.join(SELFIE_DIR, selfie_file)
                        if selfie_full_path not in to_crop_images:
                            to_crop_images.append(selfie_full_path)
                            save_to_crop_images(to_crop_images)
                        updated_downloaded_images[name] = file_id
                        save_downloaded_images(updated_downloaded_images, "add", name, file_id)
            else:
                print(f"Skipping {name}, already downloaded file_id {file_id}")
        # else: skip if no selfie_url or name

    # Final save to ensure all changes are written
    save_to_crop_images(to_crop_images)

if __name__ == "__main__":
    main()