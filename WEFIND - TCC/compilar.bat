@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo ============================================================
echo   Compilando TCC WeFIND em PDF...
echo ============================================================
echo.

if not exist "build" mkdir build

echo [1/2] Primeira passada de compilacao...
pdflatex -interaction=nonstopmode -aux-directory=build -synctex=1 main.tex
if %errorlevel% neq 0 (
    echo.
    echo ❌ Erro durante a compilacao! Verifique o log em build\main.log
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Segunda passada para atualizar referencias e indices...
pdflatex -interaction=nonstopmode -aux-directory=build -synctex=1 main.tex
if %errorlevel% neq 0 (
    echo.
    echo ❌ Erro durante a segunda compilacao! Verifique o log em build\main.log
    pause
    exit /b %errorlevel%
)

echo.
echo [3/3] Criando copia versionada sem mover o PDF principal...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0version_pdf.ps1"
if %errorlevel% neq 0 (
    echo.
    echo ❌ Erro ao criar a versao arquivada.
    pause
    exit /b %errorlevel%
)

echo.
echo ============================================================
echo   ✔ PDF principal atualizado: main.pdf
echo   ✔ Copia versionada salva em versoes_pdf\
echo   📁 Arquivos auxiliares organizados na pasta: build\
echo ============================================================
pause
