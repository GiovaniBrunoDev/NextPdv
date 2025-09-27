@echo off
set DATA=%DATE:~6,4%-%DATE:~3,2%-%DATE:~0,2%_%TIME:~0,2%-%TIME:~3,2%
set DATA=%DATA: =0%

set BACKUP_DIR=C:\Users\giova\BackupsPDV
set ARQUIVO=%BACKUP_DIR%\backup_%DATA%.sql

REM Criar pasta se não existir
if not exist %BACKUP_DIR% mkdir %BACKUP_DIR%

REM Senha do banco
set PGPASSWORD=npg_ZiQ4sh0GtLSB

REM Executa pg_dump (NeonDB)
"C:\Program Files\PostgreSQL\17\bin\pg_dump.exe" ^
  -h ep-lively-pond-ac1nso7m-pooler.sa-east-1.aws.neon.tech ^
  -U neondb_owner ^
  -d neondb ^
  -F c ^
  -f "%ARQUIVO%"

echo Backup concluído: %ARQUIVO%
