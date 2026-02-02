# ============================================================================
# 数据库迁移执行脚本 (PowerShell)
# 自动读取 backend/.env 中的数据库配置并执行迁移
# ============================================================================

$ErrorActionPreference = "Stop"

# 颜色定义
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"

# 脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Split-Path -Parent $ScriptDir
$EnvFile = Join-Path $BackendDir ".env"
$MigrationFile = Join-Path $ScriptDir "apply_all_migrations.sql"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "XPouch AI Database Migration Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查迁移文件是否存在
if (-not (Test-Path $MigrationFile)) {
    Write-Host "Error: Migration file not found: $MigrationFile" -ForegroundColor $Red
    exit 1
}

# 检查 .env 文件是否存在
if (-not (Test-Path $EnvFile)) {
    Write-Host "Error: .env file not found: $EnvFile" -ForegroundColor $Red
    Write-Host "Please ensure backend/.env exists with database configuration."
    exit 1
}

Write-Host "Loading database configuration from $EnvFile..."

# 从 .env 文件读取配置
$EnvContent = Get-Content $EnvFile -Raw

# 尝试读取 DATABASE_URL
if ($EnvContent -match 'DATABASE_URL=(.+?)\r?\n') {
    $DatabaseUrl = $Matches[1].Trim().Trim('"', "'")
    
    # 解析 DATABASE_URL
    # 格式: postgresql+psycopg://user:password@host:port/dbname
    
    # 提取用户名和密码
    if ($DatabaseUrl -match '://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)') {
        $DbUser = $Matches[1]
        $DbPass = $Matches[2]
        $DbHost = $Matches[3]
        $DbPort = $Matches[4]
        $DbName = $Matches[5].Trim()
    }
} else {
    # 读取单独的配置
    function Get-EnvValue($Pattern) {
        if ($EnvContent -match "$Pattern=(.+?)\r?\n") {
            return $Matches[1].Trim().Trim('"', "'")
        }
        return $null
    }
    
    $DbUser = (Get-EnvValue "POSTGRES_USER") ?? "postgres"
    $DbPass = Get-EnvValue "POSTGRES_PASSWORD"
    $DbName = (Get-EnvValue "POSTGRES_DB") ?? "xpouch"
    $DbHost = (Get-EnvValue "DB_HOST") ?? "localhost"
    $DbPort = (Get-EnvValue "DB_PORT") ?? "5432"
}

# 验证配置
if ([string]::IsNullOrEmpty($DbPass)) {
    Write-Host "Error: Database password not found in .env file" -ForegroundColor $Red
    exit 1
}

Write-Host ""
Write-Host "Database Configuration:"
Write-Host "  Host: $DbHost"
Write-Host "  Port: $DbPort"
Write-Host "  Database: $DbName"
Write-Host "  User: $DbUser"
Write-Host ""

# 检查 psql 是否安装
$PsqlPath = Get-Command psql -ErrorAction SilentlyContinue
if (-not $PsqlPath) {
    Write-Host "Error: psql command not found" -ForegroundColor $Red
    Write-Host "Please install PostgreSQL client and add it to PATH"
    Write-Host "Download: https://www.postgresql.org/download/windows/"
    exit 1
}

# 测试连接
Write-Host "Testing database connection..."
$Env:PGPASSWORD = $DbPass
try {
    $TestResult = & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -c "SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Connection failed"
    }
    Write-Host "✓ Database connection successful" -ForegroundColor $Green
} catch {
    Write-Host "Error: Cannot connect to database" -ForegroundColor $Red
    Write-Host "Please check your database configuration in $EnvFile"
    exit 1
}

Write-Host ""

# 执行迁移
Write-Host "Executing migration: apply_all_migrations.sql"
Write-Host "----------------------------------------"

try {
    & psql -h $DbHost -p $DbPort -U $DbUser -d $DbName -f $MigrationFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor $Green
        Write-Host "Migration completed successfully!" -ForegroundColor $Green
        Write-Host "========================================" -ForegroundColor $Green
        Write-Host ""
        Write-Host "Next steps:"
        Write-Host "  1. Pull latest code: git pull origin main"
        Write-Host "  2. Restart your application"
    } else {
        throw "Migration failed with exit code $LASTEXITCODE"
    }
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor $Red
    Write-Host "Migration failed!" -ForegroundColor $Red
    Write-Host "========================================" -ForegroundColor $Red
    exit 1
}
