import base64
import plistlib
import uuid
from pathlib import Path

FONT_PATH = "Corporate-Logo-Medium-ver3.otf"
OUTPUT_PATH = "Corporate-Logo-Medium-3.mobileconfig"

font_data = Path(FONT_PATH).read_bytes()

font_payload = {
    "PayloadDescription": "Installs a custom font.",
    "PayloadDisplayName": "Corporate Logo Medium Ver3",
    "PayloadIdentifier": f"com.tonkatsu.font.{uuid.uuid4()}",
    "PayloadOrganization": "tonkatsu",
    "PayloadType": "com.apple.font",
    "PayloadUUID": str(uuid.uuid4()).upper(),
    "PayloadVersion": 1,

    "Name": Path(FONT_PATH).name,
    "Font": font_data
}

profile = {
    "PayloadContent": [
        font_payload
    ],
    "PayloadDescription": "Installs Corporate Logo Medium.",
    "PayloadDisplayName": "Corporate Logo Medium Ver3",
    "PayloadIdentifier": f"com.tonkatsu.profile.{uuid.uuid4()}",
    "PayloadOrganization": "tonkatsu",
    "PayloadRemovalDisallowed": False,
    "PayloadScope": "System",
    "PayloadType": "Configuration",
    "PayloadUUID": str(uuid.uuid4()).upper(),
    "PayloadVersion": 1
}

with open(OUTPUT_PATH, "wb") as f:
    plistlib.dump(profile, f, fmt=plistlib.FMT_XML, sort_keys=False)

print("Created:", OUTPUT_PATH)