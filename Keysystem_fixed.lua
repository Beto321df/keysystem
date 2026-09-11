local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local CoreGui = game:GetService("CoreGui")
local UserInputService = game:GetService("UserInputService")
local RbxAnalyticsService = game:GetService("RbxAnalyticsService")

local API_URL = "https://zkeysystem.vercel.app"
local WEBSITE_URL = "https://zkeysystem.vercel.app/"
local DISCORD_URL = "https://discord.gg/wCrVjBtpt"
local SCRIPT_LOADER_URL = "https://raw.githubusercontent.com/zsoyyo73-dotcom/Hola12/refs/heads/main/z"

local requestFunc = (syn and syn.request) or (http and http.request) or http_request or request
local deviceId = ""

pcall(function()
    local raw = tostring(RbxAnalyticsService:GetClientId() or ""):upper()
    local clean = raw:gsub("[^A-F0-9]", "")
    if #clean >= 24 then
        deviceId = "HWID-" .. clean:sub(1, 24)
    end
end)

local function encode(v)
    v = tostring(v or "")
    if HttpService.UrlEncode then return HttpService:UrlEncode(v) end
    return v:gsub("([^%w%-_%.~])", function(c) return string.format("%%%02X", string.byte(c)) end)
end

local function requestJson(path, method)
    if not requestFunc then return false, nil, "Tu executor no soporta HTTP." end
    local ok, response = pcall(function()
        return requestFunc({
            Url = API_URL .. path,
            Method = method or "GET",
            Headers = { ["Accept"] = "application/json" }
        })
    end)
    if not ok or not response then return false, nil, "No se pudo conectar con Z Nexus." end
    if not response.Body then return false, response, "El servidor no devolvió respuesta." end
    local decoded, data = pcall(function() return HttpService:JSONDecode(response.Body) end)
    if not decoded or type(data) ~= "table" then
        return false, response, "Respuesta inválida del servidor."
    end
    return true, data, nil
end

local keyUrl = WEBSITE_URL .. "?hwid=" .. encode(deviceId)

if CoreGui:FindFirstChild("ZNexusKeySystem") then
    pcall(function() CoreGui.ZNexusKeySystem:Destroy() end)
end

local gui = Instance.new("ScreenGui")
gui.Name = "ZNexusKeySystem"
gui.ResetOnSpawn = false
gui.Parent = (gethui and gethui()) or CoreGui

local frame = Instance.new("Frame")
frame.Size = UDim2.new(0, 340, 0, 205)
frame.Position = UDim2.new(.5, -170, .5, -102)
frame.BackgroundColor3 = Color3.fromRGB(18,18,24)
frame.BorderSizePixel = 0
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0,12)

local stroke = Instance.new("UIStroke", frame)
stroke.Color = Color3.fromRGB(99,102,241)
stroke.Transparency = .3

local title = Instance.new("TextLabel", frame)
title.Size = UDim2.new(1,0,0,34)
title.BackgroundTransparency = 1
title.Text = "Z NEXUS  •  Key System"
title.TextColor3 = Color3.new(1,1,1)
title.TextSize = 16
title.Font = Enum.Font.GothamBold

local hw = Instance.new("TextLabel", frame)
hw.Size = UDim2.new(.9,0,0,25)
hw.Position = UDim2.new(.05,0,0,34)
hw.BackgroundTransparency = 1
hw.Text = deviceId ~= "" and deviceId or "HWID no disponible"
hw.TextColor3 = Color3.fromRGB(130,130,180)
hw.TextSize = 9
hw.Font = Enum.Font.Code
hw.TextTruncate = Enum.TextTruncate.AtEnd

local box = Instance.new("TextBox", frame)
box.Size = UDim2.new(.86,0,0,42)
box.Position = UDim2.new(.07,0,0,62)
box.BackgroundColor3 = Color3.fromRGB(24,24,33)
box.TextColor3 = Color3.fromRGB(230,230,255)
box.PlaceholderText = "FREE_XXXXXXXXX-0000"
box.Text = ""
box.TextSize = 13
box.Font = Enum.Font.GothamMedium
box.ClearTextOnFocus = false
Instance.new("UICorner", box).CornerRadius = UDim.new(0,8)

local verify = Instance.new("TextButton", frame)
verify.Size = UDim2.new(.41,0,0,38)
verify.Position = UDim2.new(.07,0,0,116)
verify.BackgroundColor3 = Color3.fromRGB(99,102,241)
verify.TextColor3 = Color3.new(1,1,1)
verify.Text = "Verificar Key"
verify.TextSize = 12
verify.Font = Enum.Font.GothamBold
verify.AutoButtonColor = false
Instance.new("UICorner", verify).CornerRadius = UDim.new(0,8)

local getKey = Instance.new("TextButton", frame)
getKey.Size = UDim2.new(.41,0,0,38)
getKey.Position = UDim2.new(.52,0,0,116)
getKey.BackgroundColor3 = Color3.fromRGB(24,24,33)
getKey.TextColor3 = Color3.fromRGB(190,190,215)
getKey.Text = "Obtener Key"
getKey.TextSize = 12
getKey.Font = Enum.Font.GothamMedium
getKey.AutoButtonColor = false
Instance.new("UICorner", getKey).CornerRadius = UDim.new(0,8)

local status = Instance.new("TextLabel", frame)
status.Size = UDim2.new(1,0,0,20)
status.Position = UDim2.new(0,0,0,163)
status.BackgroundTransparency = 1
status.Text = "2026"
status.TextColor3 = Color3.fromRGB(130,130,160)
status.TextSize = 10
status.Font = Enum.Font.Gotham

local dragging, dragStart, startPos, dragInput = false, nil, nil, nil
frame.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        dragStart = input.Position
        startPos = frame.Position
        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then dragging = false end
        end)
    end
end)
frame.InputChanged:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch then dragInput = input end
end)
UserInputService.InputChanged:Connect(function(input)
    if input == dragInput and dragging then
        local d = input.Position - dragStart
        frame.Position = UDim2.new(startPos.X.Scale,startPos.X.Offset+d.X,startPos.Y.Scale,startPos.Y.Offset+d.Y)
    end
end)

local function setStatus(msg, color)
    status.Text = msg
    status.TextColor3 = color or Color3.fromRGB(130,130,160)
end

getKey.MouseButton1Click:Connect(function()
    if deviceId == "" then
        setStatus("No se pudo obtener el HWID", Color3.fromRGB(239,68,68))
        return
    end
    if not setclipboard then
        setStatus("Tu executor no soporta clipboard", Color3.fromRGB(239,68,68))
        return
    end
    pcall(function() setclipboard(keyUrl) end)
    getKey.Text = "¡Link copiado!"
    setStatus("Usa el link completo con ?hwid=...", Color3.fromRGB(34,197,94))
    task.delay(2,function() if getKey.Parent then getKey.Text="Obtener Key" end end)
end)

local function finish(key)
    setStatus("¡Key verificada correctamente!", Color3.fromRGB(34,197,94))
    verify.Text = "¡Acceso Concedido!"
    verify.BackgroundColor3 = Color3.fromRGB(34,197,94)
    getgenv().ZNexusSession = {Authenticated=true,Key=key,HWID=deviceId,Timestamp=os.time()}
    getgenv().ZNexusHWID = deviceId
    task.wait(1)
    pcall(function() gui:Destroy() end)
    local ok, err = pcall(function()
        local source = game:HttpGet(SCRIPT_LOADER_URL)
        if not source or source == "" then error("Main Script vacío") end
        local fn = loadstring(source)
        if not fn then error("No se pudo compilar Main Script") end
        fn()
    end)
    if not ok then warn("[Z NEXUS ERROR] Main Script:", err) end
end

verify.MouseButton1Click:Connect(function()
    if deviceId == "" then setStatus("No se pudo obtener el HWID", Color3.fromRGB(239,68,68)); return end
    local userKey = tostring(box.Text or ""):gsub("^%s+",""):gsub("%s+$",""):upper()
    if not userKey:match("^FREE_[A-Z][A-Z][A-Z][A-Z][A-Z][A-Z][A-Z][A-Z][A-Z]%-[0-9][0-9][0-9][0-9]$") then
        setStatus("Formato: FREE_XXXXXXXXX-0000", Color3.fromRGB(239,68,68)); return
    end
    if not requestFunc then setStatus("Executor sin HTTP", Color3.fromRGB(239,68,68)); return end

    verify.Text = "Comprobando..."
    setStatus("Validando key y HWID...", Color3.fromRGB(99,102,241))

    task.spawn(function()
        -- Primero intentamos el endpoint normal.
        local ok, data = requestJson("/api/key/validate?key="..encode(userKey).."&deviceId="..encode(deviceId), "GET")
        if ok and type(data) == "table" and data.valid == true then
            finish(userKey)
            return
        end

        -- FIX: el sitio ya usa /api/key/recover para localizar la key ligada
        -- al HWID. Si /validate devuelve {valid:false} sin reason, usamos
        -- recover como segunda comprobación server-side. No se acepta una key
        -- distinta a la que el servidor tiene ligada a este HWID.
        local rok, recovered = requestJson("/api/key/recover?deviceId="..encode(deviceId), "GET")
        if rok and type(recovered) == "table" then
            if recovered.found == true then
                local serverKey = tostring(recovered.key or ""):upper()
                if serverKey == userKey then
                    if recovered.expired == true then
                        setStatus("Esta key ya expiró", Color3.fromRGB(239,68,68))
                        verify.Text = "Verificar Key"
                        return
                    end
                    finish(userKey)
                    return
                else
                    warn("[Z NEXUS DEBUG] Key no coincide | servidor=", serverKey, " | ingresada=", userKey, " | hwid=", deviceId)
                end
            elseif recovered.expired == true then
                setStatus("Esta key ya expiró", Color3.fromRGB(239,68,68))
                verify.Text = "Verificar Key"
                return
            end
        end

        verify.Text = "Verificar Key"
        setStatus("Key inválida | servidor no la reconoce para este HWID", Color3.fromRGB(239,68,68))
        warn("[Z NEXUS DEBUG] Validación fallida | hwid=", deviceId, " | key=", userKey, " | validate=", ok and "respuesta" or "error", " | recover=", rok and "respuesta" or "error")
    end)
end)

if deviceId == "" then
    setStatus("HWID no disponible", Color3.fromRGB(239,68,68))
else
    setStatus("HWID listo • copia el link para generar tu key", Color3.fromRGB(130,130,160))
end
