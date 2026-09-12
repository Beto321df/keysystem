-- Z Nexus Key System V2
-- Mantiene el sistema original completo desde zkeysystemu.lua y aplica
-- el nuevo flujo seguro de /api/link/access al boton Obtener Key.
-- No reemplaza ni recorta la GUI original.

local HttpService = game:GetService("HttpService")

local SOURCE_URL = "https://raw.githubusercontent.com/Beto321df/keysystem/main/zkeysystemu.lua"
local API_URL = "https://zkeysystem.vercel.app"

local requestFunc =
    (syn and syn.request)
    or (http and http.request)
    or http_request
    or request

if not requestFunc then
    error("Tu executor no soporta peticiones HTTP.")
end

local function request(url, method, body)
    local headers = {
        ["Accept"] = "application/json"
    }

    local options = {
        Url = url,
        Method = method or "GET",
        Headers = headers
    }

    if body ~= nil then
        headers["Content-Type"] = "application/json"
        options.Body = HttpService:JSONEncode(body)
    end

    local ok, response = pcall(function()
        return requestFunc(options)
    end)

    if not ok or not response or not response.Body then
        return false, nil
    end

    return true, response
end

-- Primero pedimos al servidor el enlace de acceso asociado al HWID.
local deviceId = ""
pcall(function()
    local RbxAnalyticsService = game:GetService("RbxAnalyticsService")
    local raw = tostring(RbxAnalyticsService:GetClientId() or ""):upper()
    local clean = raw:gsub("[^A-F0-9]", "")
    if #clean >= 24 then
        deviceId = "HWID-" .. clean:sub(1, 24)
    end
end)

if deviceId == "" then
    error("No se pudo obtener el HWID.")
end

local ok, response = request(
    API_URL .. "/api/link/access",
    "POST",
    {
        action = "activate",
        deviceId = deviceId
    }
)

if not ok then
    error("No se pudo generar el enlace de acceso.")
end

local decodedOk, data = pcall(function()
    return HttpService:JSONDecode(response.Body)
end)

if not decodedOk or type(data) ~= "table" or type(data.url) ~= "string" then
    error("El servidor no devolvio un enlace valido.")
end

local accessUrl = data.url

-- Descarga la GUI original completa y la ejecuta sin reconstruirla.
-- El flujo de acceso se genera antes de ejecutar la GUI para que el
-- usuario reciba el enlace firmado por el backend.
local sourceOk, sourceResponse = request(SOURCE_URL, "GET")

if not sourceOk or not sourceResponse.Body or sourceResponse.Body == "" then
    error("No se pudo descargar zkeysystemu.lua.")
end

local source = sourceResponse.Body

-- El archivo original usa KEY_WEBSITE_URL para el boton Obtener Key.
-- Lo reemplazamos por el enlace firmado que acabamos de generar.
local oldUrlLine = 'local KEY_WEBSITE_URL =\n    WEBSITE_URL .. "?hwid=" .. urlEncode(deviceId)'
local newUrlLine = 'local KEY_WEBSITE_URL = accessUrl'

if source:find(oldUrlLine, 1, true) then
    source = source:gsub(
        oldUrlLine:gsub("([%%%^%$%(%)%.%[%]%*%+%-%?])", "%%%1"),
        newUrlLine,
        1
    )
else
    -- Fallback robusto para cambios de formato en la declaracion.
    source = source:gsub(
        'local KEY_WEBSITE_URL%s*=%s*WEBSITE_URL%s*%.%.%s*"%?hwid="%s*%.%.%s*urlEncode%(%s*deviceId%s*%)',
        newUrlLine,
        1
    )
end

-- Modifica apiRequest para permitir POST JSON sin tocar el resto de la GUI.
local oldApi = [[local function apiRequest(path, method)
    if not requestFunc then
        return false, nil, "Tu executor no soporta peticiones HTTP."
    end

    local success, response = pcall(function()
        return requestFunc({
            Url = API_URL .. path,
            Method = method or "GET",
            Headers = {
                ["Accept"] = "application/json"
            }
        })
    end)

    if not success or not response then
        return false, nil, "No se pudo conectar con Z Nexus."
    end

    if not response.Body then
        return false, response, "El servidor no devolviÃ³ una respuesta."
    end

    local data = decodeResponse(response)

    if not data then
        return false, response, "Respuesta invÃ¡lida del servidor."
    end

    return true, data, nil
end]]

local newApi = [[local function apiRequest(path, method, body)
    if not requestFunc then
        return false, nil, "Tu executor no soporta peticiones HTTP."
    end

    local headers = {
        ["Accept"] = "application/json"
    }

    local requestData = {
        Url = API_URL .. path,
        Method = method or "GET",
        Headers = headers
    }

    if body ~= nil then
        headers["Content-Type"] = "application/json"

        local encodedOk, encoded = pcall(function()
            return HttpService:JSONEncode(body)
        end)

        if not encodedOk then
            return false, nil, "No se pudo preparar la solicitud."
        end

        requestData.Body = encoded
    end

    local success, response = pcall(function()
        return requestFunc(requestData)
    end)

    if not success or not response then
        return false, nil, "No se pudo conectar con Z Nexus."
    end

    if not response.Body then
        return false, response, "El servidor no devolviÃ³ una respuesta."
    end

    local data = decodeResponse(response)

    if not data then
        return false, response, "Respuesta invÃ¡lida del servidor."
    end

    return true, data, nil
end]]

if source:find(oldApi, 1, true) then
    source = source:gsub(
        oldApi:gsub("([%%%^%$%(%)%.%[%]%*%+%-%?])", "%%%1"),
        newApi,
        1
    )
end

-- En el GUI original, Obtener Key ya copia KEY_WEBSITE_URL.
-- Como KEY_WEBSITE_URL ahora es el accessUrl firmado, se conserva toda
-- la interfaz, animaciones y mensajes originales.

local compileOk, compiled = pcall(loadstring, source)

if not compileOk or not compiled then
    error("No se pudo compilar el Key System V2.")
end

local runOk, runError = pcall(compiled)

if not runOk then
    error("Key System V2: " .. tostring(runError))
end
