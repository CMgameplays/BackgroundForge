import io
import os
import sys
import base64
import time
import uuid
import shutil
import zipfile
import threading
import tempfile
from pathlib import Path
from collections import deque

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from flask import Blueprint, request, jsonify, render_template, send_file, abort
from PIL import Image
import numpy as np

try:
    from shared.limiter import limiter
except ImportError:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    limiter = Limiter(get_remote_address, storage_uri="memory://")

bp = Blueprint(
    "backgroundforge", __name__,
    template_folder="templates",
    static_folder="static",
)

# ---------------------------------------------------------------------------
# Temp storage for processed images (used for ZIP downloads)
# ---------------------------------------------------------------------------
TEMP_DIR = Path(tempfile.mkdtemp(prefix='bgforge_'))

# ---------------------------------------------------------------------------
# rembg session pool  (lazy-loaded, one session per model)
# ---------------------------------------------------------------------------
_sessions: dict = {}
_sessions_lock = threading.Lock()
_warmup_done = False

MODELS = {
    'balanced':    'u2net',
    'fast':        'u2netp',
    'hq':          'isnet-general-use',
    'person':      'u2net_human_seg',
}

def get_session(model_key: str = 'balanced'):
    model_name = MODELS.get(model_key, 'u2net')
    with _sessions_lock:
        if model_name not in _sessions:
            from rembg import new_session
            _sessions[model_name] = new_session(model_name)
    return _sessions[model_name]


def _warmup_default():
    global _warmup_done
    try:
        get_session('balanced')
        _warmup_done = True
        print('  [AI] Default model (u2net) loaded and ready.')
    except Exception as e:
        print(f'  [AI] Model warmup failed: {e}')

threading.Thread(target=_warmup_default, daemon=True).start()


# ---------------------------------------------------------------------------
# Temp-file cleanup (every 30 min, remove sessions older than 2 hours)
# ---------------------------------------------------------------------------
def _cleanup_loop():
    while True:
        time.sleep(1800)
        cutoff = time.time() - 7200
        for d in TEMP_DIR.iterdir():
            if d.is_dir() and d.stat().st_mtime < cutoff:
                shutil.rmtree(d, ignore_errors=True)

threading.Thread(target=_cleanup_loop, daemon=True).start()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@bp.route('/')
def index():
    return render_template('backgroundforge/index.html')


@bp.route('/api/status')
def status():
    return jsonify({
        'ai_ready': _warmup_done,
        'models': list(MODELS.keys()),
    })


@bp.route('/api/process', methods=['POST'])
def process_image():
    mode       = request.form.get('mode', 'ai')
    session_id = request.form.get('session_id', '')
    file       = request.files.get('image')

    if not file:
        return jsonify({'error': 'No image provided'}), 400
    if not session_id or '/' in session_id or '\\' in session_id or '..' in session_id:
        return jsonify({'error': 'Invalid session ID'}), 400

    img_bytes   = file.read()
    safe_name   = Path(file.filename).name
    output_name = Path(safe_name).stem + '.png'

    try:
        if mode == 'ai':
            model_key = request.form.get('model', 'balanced')
            from rembg import remove
            sess   = get_session(model_key)
            output = remove(img_bytes, session=sess)
            result = Image.open(io.BytesIO(output)).convert('RGBA')
        else:
            color_hex = request.form.get('color', '#ffffff')
            tolerance = max(0, min(255, int(request.form.get('tolerance', '30'))))
            method    = request.form.get('method', 'flood')
            feather   = max(0, min(10, int(request.form.get('feather', '0'))))
            result    = remove_color_bg(img_bytes, color_hex, tolerance, method, feather)

        # Persist for ZIP
        sess_dir = TEMP_DIR / session_id
        sess_dir.mkdir(parents=True, exist_ok=True)
        out_path = sess_dir / output_name
        result.save(out_path, format='PNG')

        # Return base64 for preview
        buf = io.BytesIO()
        result.save(buf, format='PNG')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()

        return jsonify({
            'name':  output_name,
            'data':  f'data:image/png;base64,{b64}',
            'token': f'{session_id}/{output_name}',
        })

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@bp.route('/api/download-zip', methods=['POST'])
def download_zip():
    data   = request.get_json(silent=True) or {}
    tokens = data.get('tokens', [])
    if not tokens:
        abort(400)

    buf = io.BytesIO()
    added = 0
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for token in tokens:
            if not token or '..' in token or token.startswith('/'):
                continue
            path = (TEMP_DIR / token).resolve()
            if not str(path).startswith(str(TEMP_DIR.resolve())):
                continue
            if path.exists() and path.is_file():
                zf.write(path, path.name)
                added += 1

    if added == 0:
        abort(404)

    buf.seek(0)
    return send_file(
        buf,
        mimetype='application/zip',
        as_attachment=True,
        download_name='BackgroundForge_processed.zip',
    )


# ---------------------------------------------------------------------------
# Color-based background removal
# ---------------------------------------------------------------------------
def remove_color_bg(img_bytes: bytes, color_hex: str, tolerance: int,
                    method: str, feather: int) -> Image.Image:
    img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
    color_hex = color_hex.lstrip('#')
    r = int(color_hex[0:2], 16)
    g = int(color_hex[2:4], 16)
    b = int(color_hex[4:6], 16)
    target = (r, g, b)

    if method == 'flood':
        result = flood_fill_remove(img, target, tolerance)
    else:
        result = global_color_remove(img, target, tolerance)

    if feather > 0:
        result = feather_edges(result, feather)

    return result


def flood_fill_remove(img: Image.Image, target: tuple, tolerance: int) -> Image.Image:
    data   = np.array(img, dtype=np.uint8)
    result = data.copy()
    h, w   = data.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    t = np.array(target, dtype=np.int32)

    def matches(y: int, x: int) -> bool:
        p = data[y, x, :3].astype(np.int32)
        return float(np.sqrt(np.sum((p - t) ** 2))) <= tolerance

    queue: deque = deque()

    for x in range(w):
        for y_edge in (0, h - 1):
            if not visited[y_edge, x] and matches(y_edge, x):
                visited[y_edge, x] = True
                queue.append((y_edge, x))
    for y in range(1, h - 1):
        for x_edge in (0, w - 1):
            if not visited[y, x_edge] and matches(y, x_edge):
                visited[y, x_edge] = True
                queue.append((y, x_edge))

    while queue:
        y, x = queue.popleft()
        result[y, x, 3] = 0
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and matches(ny, nx):
                visited[ny, nx] = True
                queue.append((ny, nx))

    return Image.fromarray(result)


def global_color_remove(img: Image.Image, target: tuple, tolerance: int) -> Image.Image:
    data = np.array(img, dtype=np.uint8)
    t    = np.array(target, dtype=np.int32)
    d    = data[:, :, :3].astype(np.int32)
    diff = np.sqrt(((d - t) ** 2).sum(axis=2))
    result = data.copy()
    result[diff <= tolerance, 3] = 0
    return Image.fromarray(result)


def feather_edges(img: Image.Image, radius: int) -> Image.Image:
    from PIL import ImageFilter
    r, g, b, a = img.split()
    a_blurred  = a.filter(ImageFilter.GaussianBlur(radius=radius))
    img.putalpha(a_blurred)
    return img


# ---------------------------------------------------------------------------
if __name__ == '__main__':
    from flask import Flask
    standalone = Flask(__name__)
    standalone.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
    standalone.register_blueprint(bp, url_prefix='/')
    limiter.init_app(standalone)

    print()
    print('  ============================================')
    print('   BackgroundForge — Background Removal Tool ')
    print('  ============================================')
    print(f'  Server  : http://localhost:5000')
    print(f'  Temp dir: {TEMP_DIR}')
    print('  Press Ctrl+C to stop')
    print()
    standalone.run(debug=False, port=5000, threaded=True)
