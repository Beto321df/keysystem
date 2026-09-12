-- Z Nexus Key System V2
-- Preserva la GUI de zkeysystemu.lua y cambia el boton "Obtener Key"
-- para pedir un enlace de acceso firmado al servidor.

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

local function httpGet(url)
    local ok, response = pcall(function()
        return requestFunc({
            Url = url,
            Method = "GET",
            Headers = { ["Accept"] = "text/plain" }
        })
    end)

    if not ok or not response or not response.Body then
        error("No se pudo descargar el Key System V2.")
    end

    return response.Body
end

local source = httpGet(SOURCE_URL)

-- Cambia apiRequest para aceptar body JSON en POST.
local oldApiStart = 'local function apiRequest(path, method)'
local oldApiEnd = '\nend\n\n-- =========================================================\n-- DOWNLOAD ASSETS'

local apiStart = source:find(oldApiStart, 1, true)
local apiEnd = apiStart and source:find(oldApiEnd, apiStart, true)

if not apiStart or not apiEnd then
    error("No se pudo localizar apiRequest en zkeysystemu.lua.")
end

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
        return false, response, "El servidor no devolvió una respuesta."
    end

    local data = decodeResponse(response)

    if not data then
        return false, response, "Respuesta inválida del servidor."
    end

    return true, data, nil
end]]

source = source:sub(1, apiStart - 1) .. newApi .. source:sub(apiEnd + 1)

-- Reemplaza únicamente el bloque del boton Obtener Key.
local buttonStart = source:find('GetLinkBtn.MouseButton1Click:Connect(function()', 1, true)

if not buttonStart then
    error("No se pudo localizar el boton Obtener Key en zkeysystemu.lua.")
end

local buttonEnd = source:find('\nend)', buttonStart, true)

if not buttonEnd then
    error("No se pudo localizar el final del boton Obtener Key.")
end

local newButton = [[GetLinkBtn.MouseButton1Click:Connect(function()

    if deviceId == "" then
        updateStatus(
            "No se pudo obtener el HWID",
            Color3.fromRGB(239, 68, 68),
            3
        )
        return
    end

    updateStatus(
        "Generando enlace...",
        Color3.fromRGB(99, 102, 241),
        3
    )

    local success, data, errorMessage = apiRequest(
        "/api/link/access",
        "POST",
        {
            action = "activate",
            deviceId = deviceId
        }
    )

    if not success or type(data) ~= "table" or type(data.url) ~= "string" then
        updateStatus(
            errorMessage or "No se pudo generar el enlace",
            Color3.fromRGB(239, 68, 68),
            4
        )
        return
    end

    if setclipboard then
        pcall(function()
            setclipboard(data.url)
        end)

        GetLinkBtn.Text = "  ¡Copiado!"

        updateStatus(
            "Enlace copiado con tu dispositivo",
            Color3.fromRGB(34, 197, 94),
            2
        )

        task.delay(2, function()
            if GetLinkBtn and GetLinkBtn.Parent then
                GetLinkBtn.Text = "  Obtener Key"
            end
        end)
    else
        updateStatus(
            "Tu executor no soporta setclipboard",
            Color3.fromRGB(239, 68, 68),
            2
        )
    end
end)]]

source = source:sub(1, buttonStart - 1) .. newButton .. source:sub(buttonEnd + 5)

local loaded, result = pcall(function()
    local fn, compileError = loadstring(source)

    if not fn then
        error(compileError)
    end

    return fn()
end)

if not loaded then
    error("Key System V2: " .. tostring(result))
end
