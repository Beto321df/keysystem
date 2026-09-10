local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local CoreGui = game:GetService("CoreGui")
local UserInputService = game:GetService("UserInputService")

local requestFunc = (syn and syn.request) or (http and http.request) or http_request or request
local rawHwid = (gethwid and gethwid()) or (syn and syn.gethwid and syn.gethwid()) or game:GetService("RbxAnalyticsService"):GetClientId()

local API_URL = "https://zkeysystem.vercel.app"
local WEBSITE_URL = "https://zkeysystem.vercel.app/"
local DISCORD_URL = "https://discord.gg/wCrVjBtpt"
local SCRIPT_LOADER_URL = "https://raw.githubusercontent.com/zsoyyo73-dotcom/Hola12/refs/heads/main/z"

-- =========================================================
-- HELPERS / HWID
-- =========================================================

local function urlEncode(value)
    value = tostring(value or "")
    if HttpService.UrlEncode then
        return HttpService:UrlEncode(value)
    end
    return value:gsub("([^%w%-_%.~])", function(char)
        return string.format("%%%02X", string.byte(char))
    end)
end

local function normalizeHwid(value)
    local s = tostring(value or ""):upper()
    local hex = s:gsub("[^A-F0-9]", "")
    if #hex < 24 then
        return nil
    end
    return "HWID-" .. hex:sub(1, 24)
end

local deviceId = normalizeHwid(rawHwid)
local KEY_PATTERN = "^FREE_[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]%-[0-9][0-9][0-9][0-9]$"
local KEY_WEBSITE_URL = deviceId and (WEBSITE_URL .. "?hwid=" .. urlEncode(deviceId)) or WEBSITE_URL

local function jsonResponse(response)
    if not response or not response.Body then
        return nil
    end
    local ok, data = pcall(function()
        return HttpService:JSONDecode(response.Body)
    end)
    return ok and type(data) == "table" and data or nil
end

local function apiGet(path)
    if not requestFunc then return false, nil, "Tu executor no soporta HTTP." end
    local ok, response = pcall(function()
        return requestFunc({
            Url = API_URL .. path,
            Method = "GET",
            Headers = {Accept = "application/json"}
        })
    end)
    if not ok or not response then return false, nil, "No se pudo conectar con Z Nexus." end
    local data = jsonResponse(response)
    if not data then return false, nil, "Respuesta inválida del servidor." end
    return true, data
end

-- =========================================================
-- GUI
-- =========================================================

if CoreGui:FindFirstChild("ZNexusKeySystem") then
    CoreGui.ZNexusKeySystem:Destroy()
end

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "ZNexusKeySystem"
ScreenGui.ResetOnSpawn = false
ScreenGui.Parent = (gethui and gethui()) or CoreGui

local MainFrame = Instance.new("Frame")
MainFrame.Size = UDim2.new(0, 340, 0, 210)
MainFrame.Position = UDim2.new(0.5, -170, 0.5, -105)
MainFrame.BackgroundColor3 = Color3.fromRGB(18, 18, 24)
MainFrame.BorderSizePixel = 0
MainFrame.Parent = ScreenGui

local corner = Instance.new("UICorner", MainFrame)
corner.CornerRadius = UDim.new(0, 12)

local stroke = Instance.new("UIStroke", MainFrame)
stroke.Color = Color3.fromRGB(99, 102, 241)
stroke.Transparency = 0.3
stroke.Thickness = 1.5

local title = Instance.new("TextLabel", MainFrame)
title.Size = UDim2.new(1, 0, 0, 35)
title.BackgroundTransparency = 1
title.Text = "⚿  Z NEXUS"
title.TextColor3 = Color3.fromRGB(255, 255, 255)
title.TextSize = 17
title.Font = Enum.Font.GothamBold

title.ZIndex = 2

local sub = Instance.new("TextLabel", MainFrame)
sub.Size = UDim2.new(1, 0, 0, 20)
sub.Position = UDim2.new(0, 0, 0, 28)
sub.BackgroundTransparency = 1
sub.Text = "SECURE KEY SYSTEM · HWID LOCKED"
sub.TextColor3 = Color3.fromRGB(140, 140, 180)
sub.TextSize = 9
sub.Font = Enum.Font.GothamBold
sub.ZIndex = 2

local hw = Instance.new("TextLabel", MainFrame)
hw.Size = UDim2.new(0.86, 0, 0, 18)
hw.Position = UDim2.new(0.07, 0, 0, 47)
hw.BackgroundTransparency = 1
hw.TextXAlignment = Enum.TextXAlignment.Left
hw.Text = deviceId and ("HWID: " .. deviceId) or "HWID: ERROR"
hw.TextColor3 = deviceId and Color3.fromRGB(99, 102, 241) or Color3.fromRGB(239, 68, 68)
hw.TextSize = 9
hw.Font = Enum.Font.Code
hw.ZIndex = 2

local KeyBox = Instance.new("TextBox", MainFrame)
KeyBox.Size = UDim2.new(0.86, 0, 0, 42)
KeyBox.Position = UDim2.new(0.07, 0, 0, 70)
KeyBox.BackgroundColor3 = Color3.fromRGB(24, 24, 33)
KeyBox.TextColor3 = Color3.fromRGB(230, 230, 255)
KeyBox.PlaceholderText = "FREE_XXXXXXXXX-0000"
KeyBox.Text = ""
KeyBox.TextSize = 13
KeyBox.Font = Enum.Font.GothamMedium
KeyBox.ClearTextOnFocus = false
KeyBox.ZIndex = 2

local keyCorner = Instance.new("UICorner", KeyBox)
keyCorner.CornerRadius = UDim.new(0, 8)

local keyStroke = Instance.new("UIStroke", KeyBox)
keyStroke.Color = Color3.fromRGB(60, 60, 80)

local VerifyBtn = Instance.new("TextButton", MainFrame)
VerifyBtn.Size = UDim2.new(0.41, 0, 0, 40)
VerifyBtn.Position = UDim2.new(0.07, 0, 0, 124)
VerifyBtn.BackgroundColor3 = Color3.fromRGB(99, 102, 241)
VerifyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
VerifyBtn.Text = "Verificar Key"
VerifyBtn.TextSize = 12
VerifyBtn.Font = Enum.Font.GothamBold
VerifyBtn.AutoButtonColor = false
VerifyBtn.ZIndex = 2

local vCorner = Instance.new("UICorner", VerifyBtn)
vCorner.CornerRadius = UDim.new(0, 8)

local GetBtn = Instance.new("TextButton", MainFrame)
GetBtn.Size = UDim2.new(0.41, 0, 0, 40)
GetBtn.Position = UDim2.new(0.52, 0, 0, 124)
GetBtn.BackgroundColor3 = Color3.fromRGB(24, 24, 33)
GetBtn.TextColor3 = Color3.fromRGB(180, 180, 210)
GetBtn.Text = "Obtener Key"
GetBtn.TextSize = 12
GetBtn.Font = Enum.Font.GothamMedium
GetBtn.AutoButtonColor = false
GetBtn.ZIndex = 2

local gCorner = Instance.new("UICorner", GetBtn)
gCorner.CornerRadius = UDim.new(0, 8)

local Status = Instance.new("TextLabel", MainFrame)
Status.Size = UDim2.new(1, 0, 0, 20)
Status.Position = UDim2.new(0, 0, 0, 171)
Status.BackgroundTransparency = 1
Status.Text = "2026"
Status.TextColor3 = Color3.fromRGB(130, 130, 160)
Status.TextSize = 10
Status.Font = Enum.Font.Gotham
Status.ZIndex = 2

local function status(text, color)
    Status.Text = text
    Status.TextColor3 = color
end

-- Drag
local dragging, dragStart, startPos
MainFrame.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
        dragging = true
        dragStart = input.Position
        startPos = MainFrame.Position
        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then dragging = false end
        end)
    end
end)

UserInputService.InputChanged:Connect(function(input)
    if dragging and (input.UserInputType == Enum.UserInputType.MouseMovement or input.UserInputType == Enum.UserInputType.Touch) then
        local delta = input.Position - dragStart
        MainFrame.Position = UDim2.new(startPos.X.Scale, startPos.X.Offset + delta.X, startPos.Y.Scale, startPos.Y.Offset + delta.Y)
    end
end)

-- =========================================================
-- GET KEY
-- =========================================================

GetBtn.MouseButton1Click:Connect(function()
    if not deviceId then
        status("No se pudo obtener el HWID", Color3.fromRGB(239, 68, 68))
        return
    end
    if not setclipboard then
        status("Tu executor no soporta clipboard", Color3.fromRGB(239, 68, 68))
        return
    end

    -- ESTA es la URL importante: la web recibe el mismo deviceId
    -- que se manda después a /api/key/validate.
    setclipboard(KEY_WEBSITE_URL)
    GetBtn.Text = "¡Copiado!"
    status("Abre el enlace y completa los pasos", Color3.fromRGB(34, 197, 94))

    task.delay(2, function()
        if GetBtn then GetBtn.Text = "Obtener Key" end
    end)
end)

-- =========================================================
-- VERIFY KEY
-- =========================================================

VerifyBtn.MouseButton1Click:Connect(function()
    local key = tostring(KeyBox.Text or ""):gsub("^%s+", ""):gsub("%s+$", ""):upper()

    if key == "" then
        status("Escribe o pega una key", Color3.fromRGB(239, 68, 68))
        return
    end

    if not key:match(KEY_PATTERN) then
        status("Formato: FREE_XXXXXXXXX-0000", Color3.fromRGB(239, 68, 68))
        return
    end

    if not deviceId then
        status("No se pudo obtener el HWID", Color3.fromRGB(239, 68, 68))
        return
    end

    VerifyBtn.Text = "Comprobando..."
    status("Verificando con Z Nexus...", Color3.fromRGB(99, 102, 241))

    task.spawn(function()
        local path = "/api/key/validate?key=" .. urlEncode(key) .. "&deviceId=" .. urlEncode(deviceId)
        local ok, data, err = apiGet(path)

        if not ok then
            VerifyBtn.Text = "Verificar Key"
            status(err or "Error de conexión", Color3.fromRGB(239, 68, 68))
            return
        end

        if not data.valid then
            VerifyBtn.Text = "Verificar Key"
            if data.expired then
                status("Esta key ya expiró", Color3.fromRGB(239, 68, 68))
            elseif data.reason == "device_mismatch" then
                status("Esta key pertenece a otro dispositivo", Color3.fromRGB(239, 68, 68))
            else
                status("Key inválida", Color3.fromRGB(239, 68, 68))
            end
            return
        end

        VerifyBtn.Text = "¡Acceso Concedido!"
        VerifyBtn.BackgroundColor3 = Color3.fromRGB(34, 197, 94)
        status("¡Key verificada correctamente!", Color3.fromRGB(34, 197, 94))

        getgenv().ZNexusSession = {
            Authenticated = true,
            Key = key,
            HWID = deviceId,
            Timestamp = os.time(),
            Token = tostring(#key * 1337)
        }

        task.wait(1)
        ScreenGui:Destroy()

        if SCRIPT_LOADER_URL ~= "" then
            local loadOk, loadErr = pcall(function()
                loadstring(game:HttpGet(SCRIPT_LOADER_URL))()
            end)
            if not loadOk then
                warn("[Z NEXUS] Error cargando Main Script:", loadErr)
            end
        end
    end)
end)
