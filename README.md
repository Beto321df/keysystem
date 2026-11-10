# Key Control Premium

Panel en HTML/CSS/JavaScript respaldado por Firebase Realtime Database. Las keys nuevas usan el formato `Premium_XXXXXXXXX-0000`, duran entre 1 segundo y 365 días y quedan sin dispositivo asociado hasta su primer uso.

## Puesta en marcha

1. Publica esta carpeta en Vercel con Node.js 20.
2. Configura estas variables privadas en el proyecto:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON de una cuenta de servicio de Firebase.
   - `FIREBASE_DATABASE_URL`: URL de Realtime Database.
   - `ADMIN_API_SECRET`: secreto aleatorio largo para abrir el panel.
   - `CRON_SECRET`: secreto aleatorio largo que Vercel enviará al cron.
3. Despliega. Abre el sitio, pulsa **Conectar** y pega el valor de `ADMIN_API_SECRET`.

Vercel ejecuta `/api/admin/keys?cleanup=1` cada cinco minutos. La lista y la generación también eliminan keys vencidas como parte de sus solicitudes. La validación de una key expirada la borra en el acto junto con su índice de dispositivo.

## Amarre al primer dispositivo

La primera llamada válida a `/api/key/validate?key=...&deviceId=HWID-...` asocia la key de forma atómica al `deviceId`. Las llamadas posteriores solo reciben `valid: true` si envían el mismo identificador; otra instalación recibe `reason: "device_mismatch"`. El endpoint conserva compatibilidad con las keys `FREE_...` existentes.

El script tiene que enviar el mismo identificador estable en cada validación. Roblox Luau normal no expone el HWID físico del dispositivo; el script o el entorno que lo ejecuta debe proporcionar ese identificador. Si el identificador se genera o se puede cambiar desde el cliente, el amarre también se puede suplantar.

## Archivos

- `index.html`, `styles.css`, `app.js`: panel de administración.
- `api/admin/keys.js`: emisión, listado, borrado y limpieza programada.
- `api/key/validate.js`: validación y amarre atómico al primer uso.
- El resto de `api/`, `lib/` y `middleware.js`: backend existente del proyecto fuente.
