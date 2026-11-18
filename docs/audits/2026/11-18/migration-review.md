# Revisión de la migración para retirar el clon duplicado

Revisión de `be8a569ac09603170c220e77d1c61efdc0e967a7` frente a main
`05e6062a014d6b4a3113dcef19c4f505122df843`, consultado de nuevo en GitHub.
La intención es preservar el trabajo en main antes de retirar el clon aislado;
el checkout principal con cambios locales no se integra ni se elimina.

- Cinco revisiones independientes no encontraron defectos nuevos con confianza
  de al menos 80: instrucciones, errores, historia, comentarios previos y
  precisión de comentarios. No había hilos de revisión abiertos en PR #43.
- Los 26 originales y destinos coinciden con el mapa de hashes existente.
  Ambos HTML históricos y el patch conservan bytes; no se ejecutaron.
- Los cinco archivos Python conservan el AST tras normalizar los punteros
  documentales exactos en ambos lados. Un primer comprobador normalizaba solo
  el original y falló ante un puntero heredado que seguía igual en ambos lados;
  se corrigió el comprobador, sin modificar el código del producto.
- Se comprobaron 236 destinos Markdown relativos, sin archivos ausentes.
- El validador AFS docs pasó con dos scripts inmutables del propietario
  `alvarovillalbaa/afs@4935baf22571bae68caf4318843e4c1164a8c22d`.
  Sus once recomendaciones opcionales siguen explícitas. Los scripts temporales
  se retiraron; no se instaló un entorno ni se ejecutaron suites locales.
- Se volvió a leer el perfil personal de Drive, la propiedad privada del ZIP y
  sus 4.097 bytes completos. SHA-256 del ZIP:
  `c59ab829e6e8ccd6699181f6d9e9eff6735e9db8aa7e66a9150ca34a1df49595`.
  El miembro original coincide byte a byte con Git: 8.003 bytes, SHA-256
  `240ee807ed5ba770399bc8830ffd0feabac3730183e6e992f9d4a415cf95ef67`.
  La ubicación y procedencia siguen en [SOURCES](../../../../SOURCES.md).
- La CI del head revisado conserva el mismo fallo de cobertura que main:
  285 tests pasados, uno omitido, uno deseleccionado; 3.757 sentencias,
  396 sin cubrir, 89,46 % frente al 90 % exigido. Se consultaron los logs de
  [la PR](https://github.com/alvarovillalbaa/hackspain-2026/actions/runs/38081574883/job/114299397888)
  y [main](https://github.com/alvarovillalbaa/hackspain-2026/actions/runs/35500955505/job/106052507324).
  Web y el estado Vercel son correctos; esto no verifica una demo desplegada.

`git diff --check` pasó. No cambian CI, umbrales, dependencias, autenticación,
datos, cálculos ni prompts. La cobertura sigue siendo un defecto heredado,
no un gate verde. La integración exige volver a comprobar head, base, permisos
y CI del commit final; esta evidencia no declara todavía merge ni retirada.
