local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local TweenService = game:GetService("TweenService")
local CoreGui = game:GetService("CoreGui")
local UserInputService = game:GetService("UserInputService")
local RbxAnalyticsService = game:GetService("RbxAnalyticsService")

local Player = Players.LocalPlayer

local requestFunc =
    (syn and syn.request)
    or (http and http.request)
    or http_request
    or request

-- =========================================================
-- CONFIG
-- =========================================================

local API_URL = "https://zkeysystem.vercel.app"
local WEBSITE_URL = "https://zkeysystem.vercel.app/"
local DISCORD_URL = "https://discord.gg/wCrVjBtpt"

local SCRIPT_LOADER_URL =
    "https://raw.githubusercontent.com/zsoyyo73-dotcom/Hola12/refs/heads/main/z"

local IMAGE_URL =
    "https://raw.githubusercontent.com/Fernando143j/system-key/heads/main/950141079_1788854830242953.jpg"

local ICON_KEY_BOX =
    "https://raw.githubusercontent.com/Fernando143j/system-key/heads/main/Login-Key-1--Streamline-Ultimate.png"

local ICON_VERIFY =
    "https://raw.githubusercontent.com/Fernando143j/system-key/heads/main/Logout-2--Streamline-Ultimate.png"

local ICON_GETKEY =
    "https://raw.githubusercontent.com/Fernando143j/system-key/heads/main/Login-Keys--Streamline-Ultimate.png"

local ICON_TITLE =
    "https://raw.githubusercontent.com/Fernando143j/system-key/heads/main/Programming-Browser--Streamline-Ultimate.png"

local ICON_DISCORD =
    "https://raw.githubusercontent.com/Fernando143j/system-key/heads/main/discord-white-icon.png"

local folderName = "KeyAnime"

-- =========================================================
-- HWID
-- =========================================================

local deviceId = ""

pcall(function()
    deviceId = tostring(RbxAnalyticsService:GetClientId() or "")
end)

if deviceId == "nil" then
    deviceId = ""
end

-- =========================================================
-- HELPERS
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

-- IMPORTANTE:
-- La URL lleva el MISMO HWID que se utiliza posteriormente
-- para validar la key.
local KEY_WEBSITE_URL =
    WEBSITE_URL .. "?hwid=" .. urlEncode(deviceId)

local function decodeResponse(response)
    if not response or not response.Body then
        return nil
    end

    local success, data = pcall(function()
        return HttpService:JSONDecode(response.Body)
    end)

    if success and type(data) == "table" then
        return data
    end

    return nil
end

local function apiRequest(path, method)
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
        return false, response, "El servidor no devolvió una respuesta."
    end

    local data = decodeResponse(response)

    if not data then
        return false, response, "Respuesta inválida del servidor."
    end

    return true, data, nil
end

-- =========================================================
-- DOWNLOAD ASSETS
-- =========================================================

local filesToDownload = {
    ["background.jpg"] = IMAGE_URL,
    ["key_box.png"] = ICON_KEY_BOX,
    ["verify.png"] = ICON_VERIFY,
    ["getkey.png"] = ICON_GETKEY,
    ["title_icon.png"] = ICON_TITLE,
    ["discord.png"] = ICON_DISCORD
}

if makefolder and isfolder then
    if not isfolder(folderName) then
        pcall(function()
            makefolder(folderName)
        end)
    end
end

if writefile and isfile and requestFunc then
    for fileName, fileUrl in pairs(filesToDownload) do
        local fullPath = folderName .. "/" .. fileName

        if not isfile(fullPath) then
            pcall(function()
                local response = requestFunc({
                    Url = fileUrl,
                    Method = "GET"
                })

                if response and response.Body then
                    writefile(fullPath, response.Body)
                end
            end)
        end
    end
end

-- =========================================================
-- GUI CLEANUP
-- =========================================================

if CoreGui:FindFirstChild("ZNexusKeySystem") then
    pcall(function()
        CoreGui.ZNexusKeySystem:Destroy()
    end)
end

-- =========================================================
-- MAIN GUI
-- =========================================================

local ScreenGui = Instance.new("ScreenGui")
ScreenGui.Name = "ZNexusKeySystem"
ScreenGui.ResetOnSpawn = false
ScreenGui.Parent = (gethui and gethui()) or CoreGui

local MainFrame = Instance.new("Frame")
MainFrame.Name = "MainFrame"
MainFrame.Size = UDim2.new(0, 340, 0, 210)
MainFrame.Position = UDim2.new(0.5, -170, 0.5, -105)
MainFrame.BackgroundColor3 = Color3.fromRGB(18, 18, 24)
MainFrame.BorderSizePixel = 0
MainFrame.ClipsDescendants = true
MainFrame.Parent = ScreenGui

local UICorner = Instance.new("UICorner")
UICorner.CornerRadius = UDim.new(0, 12)
UICorner.Parent = MainFrame

-- =========================================================
-- DRAGGING
-- =========================================================

local dragging = false
local dragInput = nil
local dragStart = nil
local startPos = nil

MainFrame.InputBegan:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseButton1
        or input.UserInputType == Enum.UserInputType.Touch then

        dragging = true
        dragStart = input.Position
        startPos = MainFrame.Position

        input.Changed:Connect(function()
            if input.UserInputState == Enum.UserInputState.End then
                dragging = false
            end
        end)
    end
end)

MainFrame.InputChanged:Connect(function(input)
    if input.UserInputType == Enum.UserInputType.MouseMovement
        or input.UserInputType == Enum.UserInputType.Touch then

        dragInput = input
    end
end)

UserInputService.InputChanged:Connect(function(input)
    if input == dragInput and dragging then
        local delta = input.Position - dragStart

        MainFrame.Position = UDim2.new(
            startPos.X.Scale,
            startPos.X.Offset + delta.X,
            startPos.Y.Scale,
            startPos.Y.Offset + delta.Y
        )
    end
end)

-- =========================================================
-- BACKGROUND
-- =========================================================

local BackgroundImage = Instance.new("ImageLabel")
BackgroundImage.Name = "ImageBackground"
BackgroundImage.Size = UDim2.new(1, 0, 1, 0)
BackgroundImage.BackgroundTransparency = 1
BackgroundImage.ScaleType = Enum.ScaleType.Crop
BackgroundImage.ZIndex = 1
BackgroundImage.Parent = MainFrame

local assetFunc = getcustomasset or getsynasset

if assetFunc and isfile and isfile(folderName .. "/background.jpg") then
    pcall(function()
        BackgroundImage.Image =
            assetFunc(folderName .. "/background.jpg")
    end)
end

local DarkOverlay = Instance.new("Frame")
DarkOverlay.Size = UDim2.new(1, 0, 1, 0)
DarkOverlay.BackgroundColor3 = Color3.fromRGB(15, 15, 20)
DarkOverlay.BackgroundTransparency = 0.50
DarkOverlay.BorderSizePixel = 0
DarkOverlay.ZIndex = 1
DarkOverlay.Parent = MainFrame

local UIStroke = Instance.new("UIStroke")
UIStroke.Color = Color3.fromRGB(99, 102, 241)
UIStroke.Transparency = 0.3
UIStroke.Thickness = 1.5
UIStroke.Parent = MainFrame

-- =========================================================
-- TITLE
-- =========================================================

local TitleContainer = Instance.new("Frame")
TitleContainer.Size = UDim2.new(1, 0, 0, 40)
TitleContainer.BackgroundTransparency = 1
TitleContainer.ZIndex = 2
TitleContainer.Parent = MainFrame

local DiscordBtn = Instance.new("ImageButton")
DiscordBtn.Name = "DiscordBtn"
DiscordBtn.Size = UDim2.new(0, 18, 0, 18)
DiscordBtn.Position = UDim2.new(0, 12, 0.5, -9)
DiscordBtn.BackgroundTransparency = 1
DiscordBtn.ImageColor3 = Color3.fromRGB(255, 255, 255)
DiscordBtn.ZIndex = 3
DiscordBtn.Parent = TitleContainer

if assetFunc and isfile and isfile(folderName .. "/discord.png") then
    pcall(function()
        DiscordBtn.Image =
            assetFunc(folderName .. "/discord.png")
    end)
end

local TitleContent = Instance.new("Frame")
TitleContent.Name = "TitleContent"
TitleContent.Size = UDim2.new(0, 0, 1, 0)
TitleContent.Position = UDim2.new(0.5, 0, 0, 0)
TitleContent.AnchorPoint = Vector2.new(0.5, 0)
TitleContent.BackgroundTransparency = 1
TitleContent.AutomaticSize = Enum.AutomaticSize.X
TitleContent.ZIndex = 2
TitleContent.Parent = TitleContainer

local TitleLayout = Instance.new("UIListLayout")
TitleLayout.FillDirection = Enum.FillDirection.Horizontal
TitleLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center
TitleLayout.VerticalAlignment = Enum.VerticalAlignment.Center
TitleLayout.SortOrder = Enum.SortOrder.LayoutOrder
TitleLayout.Padding = UDim.new(0, 8)
TitleLayout.Parent = TitleContent

local TitleIcon = Instance.new("ImageLabel")
TitleIcon.Size = UDim2.new(0, 18, 0, 18)
TitleIcon.BackgroundTransparency = 1
TitleIcon.ImageColor3 = Color3.fromRGB(99, 102, 241)
TitleIcon.ZIndex = 2
TitleIcon.LayoutOrder = 1
TitleIcon.Parent = TitleContent

if assetFunc and isfile and isfile(folderName .. "/title_icon.png") then
    pcall(function()
        TitleIcon.Image =
            assetFunc(folderName .. "/title_icon.png")
    end)
end

local Title = Instance.new("TextLabel")
Title.Size = UDim2.new(0, 0, 1, 0)
Title.AutomaticSize = Enum.AutomaticSize.X
Title.BackgroundTransparency = 1
Title.Text = "Key System"
Title.TextColor3 = Color3.fromRGB(255, 255, 255)
Title.TextSize = 16
Title.Font = Enum.Font.GothamBold
Title.ZIndex = 2
Title.LayoutOrder = 2
Title.Parent = TitleContent

local Subtitle = Instance.new("TextLabel")
Subtitle.Size = UDim2.new(1, 0, 0, 15)
Subtitle.Position = UDim2.new(0, 0, 0, 30)
Subtitle.BackgroundTransparency = 1
Subtitle.Text = "Z nexus - Key system 2026"
Subtitle.TextColor3 = Color3.fromRGB(140, 140, 180)
Subtitle.TextSize = 9
Subtitle.Font = Enum.Font.GothamBold
Subtitle.ZIndex = 2
Subtitle.Parent = MainFrame

-- =========================================================
-- KEY BOX
-- =========================================================

local KeyBox = Instance.new("TextBox")
KeyBox.Size = UDim2.new(0.86, 0, 0, 42)
KeyBox.Position = UDim2.new(0.07, 0, 0, 58)
KeyBox.BackgroundColor3 = Color3.fromRGB(24, 24, 33)
KeyBox.TextColor3 = Color3.fromRGB(230, 230, 255)
KeyBox.PlaceholderText = ""
KeyBox.Text = ""
KeyBox.TextSize = 13
KeyBox.Font = Enum.Font.GothamMedium
KeyBox.ClearTextOnFocus = false
KeyBox.ZIndex = 2
KeyBox.Parent = MainFrame

local BoxCorner = Instance.new("UICorner")
BoxCorner.CornerRadius = UDim.new(0, 8)
BoxCorner.Parent = KeyBox

local BoxStroke = Instance.new("UIStroke")
BoxStroke.Color = Color3.fromRGB(60, 60, 80)
BoxStroke.Thickness = 1
BoxStroke.Parent = KeyBox

local BoxIcon = Instance.new("ImageLabel")
BoxIcon.Size = UDim2.new(0, 18, 0, 18)
BoxIcon.Position = UDim2.new(0, 12, 0.5, -9)
BoxIcon.BackgroundTransparency = 1
BoxIcon.ImageColor3 = Color3.fromRGB(130, 130, 160)
BoxIcon.ZIndex = 3
BoxIcon.Parent = KeyBox

if assetFunc and isfile and isfile(folderName .. "/key_box.png") then
    pcall(function()
        BoxIcon.Image =
            assetFunc(folderName .. "/key_box.png")
    end)
end

local PlaceholderLabel = Instance.new("TextLabel")
PlaceholderLabel.Size = UDim2.new(1, -38, 1, 0)
PlaceholderLabel.Position = UDim2.new(0, 36, 0, 0)
PlaceholderLabel.BackgroundTransparency = 1
PlaceholderLabel.Text = "Key:"
PlaceholderLabel.TextColor3 = Color3.fromRGB(130, 130, 160)
PlaceholderLabel.TextSize = 13
PlaceholderLabel.Font = Enum.Font.GothamMedium
PlaceholderLabel.TextXAlignment = Enum.TextXAlignment.Left
PlaceholderLabel.ZIndex = 3
PlaceholderLabel.Parent = KeyBox

KeyBox.Focused:Connect(function()
    TweenService:Create(
        PlaceholderLabel,
        TweenInfo.new(0.2),
        {
            TextTransparency = 1
        }
    ):Play()
end)

KeyBox.FocusLost:Connect(function()
    if KeyBox.Text == "" then
        TweenService:Create(
            PlaceholderLabel,
            TweenInfo.new(0.2),
            {
                TextTransparency = 0
            }
        ):Play()
    end
end)

-- =========================================================
-- VERIFY BUTTON
-- =========================================================

local VerifyBtn = Instance.new("TextButton")
VerifyBtn.Size = UDim2.new(0.41, 0, 0, 40)
VerifyBtn.Position = UDim2.new(0.07, 0, 0, 114)
VerifyBtn.BackgroundColor3 = Color3.fromRGB(99, 102, 241)
VerifyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
VerifyBtn.Text = "  Verificar Key"
VerifyBtn.TextSize = 12
VerifyBtn.Font = Enum.Font.GothamBold
VerifyBtn.AutoButtonColor = false
VerifyBtn.ZIndex = 2
VerifyBtn.Parent = MainFrame

local BtnCorner1 = Instance.new("UICorner")
BtnCorner1.CornerRadius = UDim.new(0, 8)
BtnCorner1.Parent = VerifyBtn

local VerifyIcon = Instance.new("ImageLabel")
VerifyIcon.Size = UDim2.new(0, 16, 0, 16)
VerifyIcon.Position = UDim2.new(0, 10, 0.5, -8)
VerifyIcon.BackgroundTransparency = 1
VerifyIcon.ImageColor3 = Color3.fromRGB(255, 255, 255)
VerifyIcon.ZIndex = 3
VerifyIcon.Parent = VerifyBtn

if assetFunc and isfile and isfile(folderName .. "/verify.png") then
    pcall(function()
        VerifyIcon.Image =
            assetFunc(folderName .. "/verify.png")
    end)
end

-- =========================================================
-- GET KEY BUTTON
-- =========================================================

local GetLinkBtn = Instance.new("TextButton")
GetLinkBtn.Size = UDim2.new(0.41, 0, 0, 40)
GetLinkBtn.Position = UDim2.new(0.52, 0, 0, 114)
GetLinkBtn.BackgroundColor3 = Color3.fromRGB(24, 24, 33)
GetLinkBtn.TextColor3 = Color3.fromRGB(180, 180, 210)
GetLinkBtn.Text = "  Obtener Key"
GetLinkBtn.TextSize = 12
GetLinkBtn.Font = Enum.Font.GothamMedium
GetLinkBtn.AutoButtonColor = false
GetLinkBtn.ZIndex = 2
GetLinkBtn.Parent = MainFrame

local CornerR = Instance.new("UICorner")
CornerR.CornerRadius = UDim.new(0, 8)
CornerR.Parent = GetLinkBtn

local GetLinkStroke = Instance.new("UIStroke")
GetLinkStroke.Color = Color3.fromRGB(60, 60, 80)
GetLinkStroke.Thickness = 1
GetLinkStroke.Parent = GetLinkBtn

local GetKeyIcon = Instance.new("ImageLabel")
GetKeyIcon.Size = UDim2.new(0, 16, 0, 16)
GetKeyIcon.Position = UDim2.new(0, 10, 0.5, -8)
GetKeyIcon.BackgroundTransparency = 1
GetKeyIcon.ImageColor3 = Color3.fromRGB(180, 180, 210)
GetKeyIcon.ZIndex = 3
GetKeyIcon.Parent = GetLinkBtn

if assetFunc and isfile and isfile(folderName .. "/getkey.png") then
    pcall(function()
        GetKeyIcon.Image =
            assetFunc(folderName .. "/getkey.png")
    end)
end

-- =========================================================
-- STATUS
-- =========================================================

local StatusLabel = Instance.new("TextLabel")
StatusLabel.Size = UDim2.new(1, 0, 0, 20)
StatusLabel.Position = UDim2.new(0, 0, 0, 168)
StatusLabel.BackgroundTransparency = 1
StatusLabel.Text = "2026"
StatusLabel.TextColor3 = Color3.fromRGB(130, 130, 160)
StatusLabel.TextSize = 10
StatusLabel.Font = Enum.Font.Gotham
StatusLabel.ZIndex = 2
StatusLabel.Parent = MainFrame

local currentStatusThread = nil

local function updateStatus(text, color, duration)
    if currentStatusThread then
        pcall(function()
            task.cancel(currentStatusThread)
        end)

        currentStatusThread = nil
    end

    StatusLabel.Text = tostring(text or "")

    TweenService:Create(
        StatusLabel,
        TweenInfo.new(0.3),
        {
            TextColor3 = color
        }
    ):Play()

    if duration then
        currentStatusThread = task.delay(duration, function()
            if StatusLabel and StatusLabel.Parent then
                StatusLabel.Text = "2026"

                TweenService:Create(
                    StatusLabel,
                    TweenInfo.new(0.3),
                    {
                        TextColor3 = Color3.fromRGB(130, 130, 160)
                    }
                ):Play()
            end

            currentStatusThread = nil
        end)
    end
end

-- =========================================================
-- HOVER
-- =========================================================

local function applyHover(btn, defaultColor, hoverColor)
    btn.MouseEnter:Connect(function()
        TweenService:Create(
            btn,
            TweenInfo.new(0.2),
            {
                BackgroundColor3 = hoverColor
            }
        ):Play()
    end)

    btn.MouseLeave:Connect(function()
        TweenService:Create(
            btn,
            TweenInfo.new(0.2),
            {
                BackgroundColor3 = defaultColor
            }
        ):Play()
    end)
end

applyHover(
    VerifyBtn,
    Color3.fromRGB(99, 102, 241),
    Color3.fromRGB(115, 118, 255)
)

applyHover(
    GetLinkBtn,
    Color3.fromRGB(24, 24, 33),
    Color3.fromRGB(35, 35, 48)
)

-- =========================================================
-- DISCORD
-- =========================================================

DiscordBtn.MouseButton1Click:Connect(function()
    if setclipboard then
        pcall(function()
            setclipboard(DISCORD_URL)
        end)

        updateStatus(
            "¡Enlace de Discord copiado!",
            Color3.fromRGB(114, 137, 218),
            2
        )
    else
        updateStatus(
            "Tu executor no soporta setclipboard",
            Color3.fromRGB(239, 68, 68),
            2
        )
    end
end)

-- =========================================================
-- GET KEY
-- =========================================================

GetLinkBtn.MouseButton1Click:Connect(function()

    if deviceId == "" then
        updateStatus(
            "No se pudo obtener el HWID",
            Color3.fromRGB(239, 68, 68),
            3
        )

        return
    end

    if setclipboard then

        pcall(function()
            setclipboard(KEY_WEBSITE_URL)
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
end)

-- =========================================================
-- VERIFY KEY
-- =========================================================

VerifyBtn.MouseButton1Click:Connect(function()

    -- -----------------------------------------------------
    -- OBTENER KEY
    -- -----------------------------------------------------

    local userKey = tostring(KeyBox.Text or "")
        :gsub("^%s+", "")
        :gsub("%s+$", "")
        :upper()

    -- -----------------------------------------------------
    -- KEY VACÍA
    -- -----------------------------------------------------

    if userKey == "" then

        updateStatus(
            "Por favor escribe o pega una key",
            Color3.fromRGB(239, 68, 68),
            2
        )

        return
    end

    -- -----------------------------------------------------
    -- HTTP
    -- -----------------------------------------------------

    if not requestFunc then

        updateStatus(
            "Error: Executor no soporta peticiones HTTP",
            Color3.fromRGB(239, 68, 68),
            3
        )

        return
    end

    -- -----------------------------------------------------
    -- FORMATO NUEVO
    --
    -- FREE_XXXXXXXXX-0000
    --
    -- FREE_
    -- 9 letras MAYÚSCULAS
    -- -
    -- 4 números
    -- -----------------------------------------------------

    local validFormat =
        userKey:match("^FREE_[A-Z][A-Z][A-Z][A-Z][A-Z][A-Z][A-Z][A-Z][A-Z]%-[0-9][0-9][0-9][0-9]$")

    if not validFormat then

        VerifyBtn.Text = "  Verificar Key"

        updateStatus(
            "Formato: FREE_XXXXXXXXX-0000",
            Color3.fromRGB(239, 68, 68),
            3
        )

        return
    end

    -- -----------------------------------------------------
    -- HWID
    -- -----------------------------------------------------

    if deviceId == "" then

        VerifyBtn.Text = "  Verificar Key"

        updateStatus(
            "No se pudo obtener el HWID",
            Color3.fromRGB(239, 68, 68),
            3
        )

        return
    end

    -- -----------------------------------------------------
    -- START VERIFY
    -- -----------------------------------------------------

    VerifyBtn.Text = "  Comprobando..."

    updateStatus(
        "Verificando key con Z Nexus...",
        Color3.fromRGB(99, 102, 241)
    )

    task.spawn(function()

        -- -------------------------------------------------
        -- CONSTRUIR REQUEST
        -- -------------------------------------------------

        local verifyPath =
            "/api/key/validate"
            .. "?key=" .. urlEncode(userKey)
            .. "&deviceId=" .. urlEncode(deviceId)

        -- -------------------------------------------------
        -- REQUEST
        -- -------------------------------------------------

        local success, data, errorMessage =
            apiRequest(
                verifyPath,
                "GET"
            )

        -- -------------------------------------------------
        -- ERROR DE CONEXIÓN
        -- -------------------------------------------------

        if not success then

            VerifyBtn.Text = "  Verificar Key"

            updateStatus(
                errorMessage or "Error de conexión con el servidor",
                Color3.fromRGB(239, 68, 68),
                3
            )

            return
        end

        -- -------------------------------------------------
        -- VALIDAR RESPUESTA
        -- -------------------------------------------------

        if type(data) ~= "table" then

            VerifyBtn.Text = "  Verificar Key"

            updateStatus(
                "Respuesta inválida del servidor",
                Color3.fromRGB(239, 68, 68),
                3
            )

            return
        end

        -- -------------------------------------------------
        -- KEY INVÁLIDA
        -- -------------------------------------------------

        if data.valid ~= true then

            VerifyBtn.Text = "  Verificar Key"

            if data.expired == true then

                updateStatus(
                    "Esta key ya ha expirado",
                    Color3.fromRGB(239, 68, 68),
                    3
                )

            elseif data.reason == "device_mismatch" then

                updateStatus(
                    "Esta key pertenece a otro dispositivo",
                    Color3.fromRGB(239, 68, 68),
                    3
                )

            elseif data.reason == "not_found" then

                updateStatus(
                    "Key no encontrada",
                    Color3.fromRGB(239, 68, 68),
                    3
                )

            else

                updateStatus(
                    "Key inválida",
                    Color3.fromRGB(239, 68, 68),
                    3
                )

            end

            return
        end

        -- =================================================
        -- SUCCESS
        -- =================================================

        VerifyBtn.Text = "  ¡Acceso Concedido!"

        TweenService:Create(
            VerifyBtn,
            TweenInfo.new(0.3),
            {
                BackgroundColor3 = Color3.fromRGB(34, 197, 94)
            }
        ):Play()

        updateStatus(
            "¡Key verificada correctamente!",
            Color3.fromRGB(34, 197, 94)
        )

        -- -------------------------------------------------
        -- SESIÓN
        -- -------------------------------------------------

        getgenv().ZNexusSession = {
            Authenticated = true,
            Key = userKey,
            HWID = deviceId,
            Timestamp = os.time(),
            Token = tostring(#userKey * 1337)
        }

        -- También dejamos el HWID accesible
        getgenv().ZNexusHWID = deviceId

        task.wait(1)

        -- =================================================
        -- CLOSE GUI
        -- =================================================

        local tweenOut = TweenService:Create(
            MainFrame,
            TweenInfo.new(
                0.4,
                Enum.EasingStyle.Back,
                Enum.EasingDirection.In
            ),
            {
                Size = UDim2.new(0, 0, 0, 0)
            }
        )

        tweenOut:Play()
        tweenOut.Completed:Wait()

        pcall(function()
            ScreenGui:Destroy()
        end)

        -- =================================================
        -- LOAD MAIN SCRIPT
        -- =================================================

        if SCRIPT_LOADER_URL
            and SCRIPT_LOADER_URL ~= "" then

            local loadSuccess, loadErr = pcall(function()

                local source =
                    game:HttpGet(SCRIPT_LOADER_URL)

                if not source or source == "" then
                    error("El Main Script está vacío.")
                end

                local compiled =
                    loadstring(source)

                if not compiled then
                    error("No se pudo compilar el Main Script.")
                end

                compiled()
            end)

            if not loadSuccess then

                warn(
                    "[Z NEXUS ERROR] Fallo al cargar el Main Script:",
                    loadErr
                )

            end
        end
    end)
end)