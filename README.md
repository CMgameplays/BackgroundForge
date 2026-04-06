# BackgroundForge

A locally-hosted web app for removing backgrounds from single images or entire batches. Supports AI-powered detection or solid-color removal — no cloud required, no data leaves your machine.

![Python](https://img.shields.io/badge/Python-3.9%2B-blue?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0%2B-black?logo=flask)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

| Feature | What it does |
|---|---|
| **AI Background Removal** | Uses `rembg` (U2Net / ISNet) to automatically detect and cut out backgrounds |
| **Color-Based Removal** | Remove a specific solid color using Flood Fill (edge-seeded) or Global replace |
| **Eye-Dropper** | Click directly on any loaded image to sample its background color |
| **Tolerance Control** | Adjustable 0–200 tolerance for loose or tight color matching |
| **Edge Softening** | Optional feathering/blur on the alpha edge for smoother cutouts |
| **Before / After Toggle** | Compare original and result per image without leaving the page |
| **Transparent Preview** | Checkered pattern shows exactly what's transparent vs opaque |
| **Batch Processing** | Upload thousands of images — processed 3 at a time with live progress |
| **Individual Download** | Download any single result as a PNG instantly |
| **Batch ZIP Export** | All processed images bundled into a single `BackgroundForge_processed.zip` |
| **Multiple AI Models** | Choose between Balanced, Fast, High Quality, or Person-optimised models |

---

## Requirements

### Software

| Requirement | Version | Notes |
|---|---|---|
| [Python](https://www.python.org/downloads/) | 3.9+ | Required |

### Python Packages

All listed in `requirements.txt`:

```
flask>=3.0.0
rembg>=2.0.50
pillow>=10.0.0
numpy>=1.24.0
onnxruntime>=1.16.0
```

> **Note:** `rembg` will download AI model files (~170–180 MB each) on first use per model. They are cached at `~/.u2net/` and never re-downloaded.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/CMgameplays/BackgroundForge.git
cd BackgroundForge
```

### 2. Create and activate a virtual environment

**Windows:**

```bash
python -m venv venv
venv\Scripts\activate
```

**macOS / Linux:**

```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python dependencies

```bash
pip install -r requirements.txt
```

---

## Running Locally

**Windows (recommended):**

Double-click `run.bat` — it sets up the virtual environment, installs dependencies, and opens the browser automatically.

**Manual:**

```bash
python app.py
```

Server starts on `http://127.0.0.1:5000`.

---

## Usage

### AI Mode

1. Drop your images into the sidebar upload zone
2. Select **AI Remove** and choose a model:
   - **Balanced** (u2net) — best all-around, ready immediately
   - **Fast** (u2netp) — lighter, lower quality
   - **High Quality** (ISNet) — best results, slower
   - **Person Seg** — optimised for people/portraits
3. Click **Process Images**
4. Toggle **Before / After** on any card to compare
5. Download individually or use **Download All as ZIP**

### Color Remove Mode

1. Set the background color using the color picker, hex input, or 💧 eye-dropper
2. Adjust **Tolerance** — higher values remove more shades around that color
3. Choose a fill method:
   - **Flood Fill** — starts from image edges, best for uniform solid backgrounds
   - **Global** — removes all matching pixels anywhere in the image
4. Optionally add **Edge Softening** for a feathered look
5. Click **Process Images**

---

## Project Structure

```
BackgroundForge/
├── app.py               # Flask app — routes, AI removal, color removal logic
├── requirements.txt     # Python dependencies
├── run.bat              # One-click Windows launcher
├── templates/
│   └── index.html       # Single-page UI
└── static/
    ├── style.css        # CMG Forge design system styles
    └── app.js           # Frontend logic — queue, processing, preview, download
```

---

## API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | Main UI page |
| `GET` | `/api/status` | Returns AI model readiness status |
| `POST` | `/api/process` | Process a single image, returns base64 PNG + session token |
| `POST` | `/api/download-zip` | Generate and stream a ZIP of processed images |

### POST `/api/process` — fields

| Field | Type | Description |
|---|---|---|
| `image` | file | The image to process |
| `mode` | string | `ai` or `color` |
| `session_id` | string | Client-generated UUID for grouping files |
| `model` | string | AI model key: `balanced`, `fast`, `hq`, `person` (AI mode only) |
| `color` | string | Hex color to remove e.g. `#ffffff` (color mode only) |
| `tolerance` | int | Color match tolerance 0–200 (color mode only) |
| `method` | string | `flood` or `global` (color mode only) |
| `feather` | int | Edge blur radius 0–10 (color mode only) |

Returns JSON: `{ name, data (base64 data URL), token }`.

### POST `/api/download-zip` — body

```json
{ "tokens": ["session_id/filename.png", ...] }
```

Returns a ZIP file (`Content-Type: application/zip`).

---

## License

MIT — see [LICENSE](LICENSE) for details.

© CMG Forge
