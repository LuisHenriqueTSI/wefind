@echo off
chcp 65001 > nul
echo ============================================================
echo   Limpando arquivos auxiliares e temporarios do LaTeX...
echo ============================================================
echo.

if not exist "build" mkdir build

del /q build\*.aux build\*.log build\*.out build\*.toc build\*.lof build\*.lot build\*.synctex.gz build\*.fls build\*.fdb_latexmk 2>nul
del /q *.aux *.log *.out *.toc *.lof *.lot *.synctex.gz *.fls *.fdb_latexmk 2>nul
echo ✔ Arquivos auxiliares removidos; PDFs principais, versoes e previas foram preservados.

echo.
echo ============================================================
echo   Limpeza concluida com sucesso!
echo ============================================================
pause
