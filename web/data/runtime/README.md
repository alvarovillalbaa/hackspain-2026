# Datos que genera la plataforma (persistencia en repo, sin base de datos)

Aquí aterriza todo lo que produce el producto en marcha: la sesión de demo, las
empresas importadas por CSV, las decisiones del marketplace agéntico, la copia
de acciones que redacta Eve y las ofertas aceptadas.

No es el dataset. El dataset crudo vive en `docs/data/raw/` y el fact pack
derivado (determinista, generado por `uv run xray-export-web` y
`npm run build:facts`) en `web/lib/xray/dataset/`. Esta carpeta es la otra
mitad: los datos que nacen del uso, no de la carga inicial.

## Los tres niveles de `lib/xray/store.ts`

| Nivel | Cuándo actúa | Sobrevive a |
|---|---|---|
| Vercel Blob | hay `BLOB_READ_WRITE_TOKEN` | despliegues y cold starts |
| JSON en esta carpeta | resto de ejecuciones locales | reinicios de `npm run dev` |
| Maps en memoria | Vercel sin token de Blob | nada |

El nivel de ficheros está desactivado cuando existe `process.env.VERCEL`: el
sistema de ficheros del despliegue es de solo lectura fuera de `/tmp`, así que
en producción la durabilidad la da Blob. Sin token, la demo funciona pero el
estado muere con la instancia.

`XRAY_RUNTIME_DIR` mueve esta carpeta (los tests la apuntan a un temporal).

## Git

El contenido está en `.gitignore`: son datos de sesión y ensuciarían el
historial en cada oferta aceptada. Para congelar un estado de demo ensayado,
`git add -f web/data/runtime/<fichero>`. Para volver a empezar, borra la
carpeta o usa el reset de `/start`.
