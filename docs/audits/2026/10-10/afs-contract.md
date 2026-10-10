# Migración de propietarios AFS

Fecha: 2026-10-10. Fuente: `05e6062a014d6b4a3113dcef19c4f505122df843`.

## Alcance y resultado

El clon aislado estaba limpio después de `git pull origin main`, antes de editar. No se modificó el checkout original compartido. Esta evidencia cubre HackSpain, no completa la migración de todas las organizaciones.

Se preservaron 26 movimientos de documentación en el [mapa de hashes](afs-migration-map.jsonl): el índice pasa a docs/README; la explicación del score conserva su propietario técnico y un aviso histórico; el watcher pasa a runbooks; las dos páginas HTML son resultados del 19 de septiembre; cinco notas quedan como evidencia dentro de unidades de investigación; audits/plans y los informes/patch de UI quedan en su fecha y propietario. No se fabricó conocimiento generalizable a partir de operaciones del producto.

Todos los movimientos conservaron bytes antes de editar. Los cambios permitidos posteriores son rebases de rutas, el índice de navegación y su fecha, y el aviso histórico de la explicación. Los HTML y el patch histórico conservan bytes exactos y no se regeneraron ni aplicaron.

[SOURCES.md](../../../../SOURCES.md) conserva nombre, tamaño, hash y revisión del intake original. El archivo de Drive personal fue descargado y comparado byte a byte antes de retirar `docs/raw/ideas-equipo.md`; el [recibo](drive-preservation.json) omite rutas locales y URLs de descarga firmadas. Sus ideas no se convierten en decisiones aceptadas. El dataset `data/raw/` y el contrato XRAY_DATA_DIR quedan fuera del intake AFS.

[REFERENCES.md](../../../../REFERENCES.md) cataloga propietarios técnicos y URLs históricas sin afirmar lectura o vigencia externa. [GAPS.md](../../../../GAPS.md) conserva los límites de aceptación, las cifras no revalidadas y la discrepancia entre PRODUCT y el vocabulario del asesor.

## Verificación y límites

El [recibo de verificación](afs-verification.json) registra la comparación de los 26 hashes originales y finales, la correspondencia del original de Drive con Git y SOURCES, cinco definiciones de investigación completas, 234 destinos relativos sin enlaces a archivos ausentes y los symlinks intactos. La comprobación excluye los skills empaquetados de .agents. Se actualizaron también referencias a nombres anteriores con guion bajo hacia propietarios existentes, sin crear aliases de archivos.

La validación AFS canónica pasó el perfil docs con el propietario `c0173467b840cf7dd1491ccbfb3ea5b568208aaf`; recomienda once familias opcionales ausentes. No se añadieron directorios vacíos ni conocimiento ficticio para silenciar recomendaciones. Los cinco archivos Python solo cambian comentarios, docstrings y referencias en la ayuda del CLI: el AST coincide con el original tras normalizar esos punteros exactos. `git diff --check` pasó; no cambian cálculos ni flujos.

Se leyeron AGENTS raíz y web, el mapa y guías relevantes; se inspeccionaron metadatos, agendas y estados de las investigaciones originales. Se reutilizaron las capacidades instaladas Engineering/code-documentation y use-afs con el contrato actual del usuario. Esto no declara ingestión ni una nueva revisión de toda la literatura citada.

No se ejecutaron tests Python/web, build, typecheck amplio, servidor ni navegador. No hay cambios de dependencias, auth, infra, CI, prompts, dataset o contratos generados; no se valida despliegue, demo, aceptación del equipo ni vigencia de métricas.
