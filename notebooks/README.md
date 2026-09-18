# Notebooks

Experimentos que el equipo tiene que poder ver (chequeos de literatura del slice #3, curvas de evaluación del #4, calibración del #5). Lo que sea scratch personal puede vivir en vuestro propio repo: basta con tener `xray` instalado.

## Reglas

1. **Los notebooks importan `xray`, no definen el pipeline.** Si una función de un notebook se reutiliza, se mueve a `xray/` y se importa. El test: ¿podría `score.py` reproducir el resultado sin el notebook? Si no, el código está en el sitio equivocado.
2. **Los datos se cargan con `xray.data.load()`**, nunca con rutas absolutas. La primera llamada cachea los CSV en parquet (`artifacts/raw/`); las siguientes tardan segundos.
3. **Sin outputs en git.** `nbstripout` está configurado vía `.gitattributes`; actívalo una vez por clon con `uv run nbstripout --install`.
4. Nombre: `NN_tema_autor.ipynb` (p. ej. `03_uso_linea_antes_estres_mikel.ipynb`).

## Arranque

```bash
uv sync --all-extras          # entorno + jupyterlab
uv run nbstripout --install   # una vez por clon
uv run xray-cache             # convierte los 9 CSV a parquet (una vez)
uv run jupyter lab
```

## Desde otro repositorio

```bash
uv add "xray @ git+https://github.com/alvarovillalbaa/hackspain-2026"
export XRAY_DATA_DIR=/ruta/a/input_data
```

```python
from xray.data import load
tx = load("transactions")
```
