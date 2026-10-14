@echo off
chcp 65001 >nul
set ROOT=%~dp0

if not exist "%ROOT%server\node_modules" (
  echo [server] bagimliliklar yukleniyor...
  pushd "%ROOT%server" && call npm install && popd
)
if not exist "%ROOT%web\node_modules" (
  echo [web] bagimliliklar yukleniyor...
  pushd "%ROOT%web" && call npm install && popd
)

if not exist "%ROOT%logs" mkdir "%ROOT%logs"

echo Backend baslatiliyor: http://localhost:4000
start "LMS Backend" /D "%ROOT%server" cmd /k npm run dev

echo Frontend baslatiliyor: http://localhost:5173
start "LMS Frontend" /D "%ROOT%web" powershell -NoProfile -NoExit -Command "npm run dev 2>&1 | Tee-Object -FilePath '%ROOT%logs\web.log' -Append"

echo.
echo Her ikisi ayri pencerelerde calisiyor. Durdurmak icin pencereleri kapatin.
