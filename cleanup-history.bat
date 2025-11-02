@echo off
REM Complete Git History Cleanup Script for Windows
REM This removes ALL Git history and starts fresh

echo 🚨 COMPLETE GIT HISTORY CLEANUP
echo ================================
echo ⚠️  WARNING: This will delete ALL Git history!
echo ⚠️  Make sure you've changed any exposed passwords!
echo.
set /p confirm="Are you sure you want to continue? (type YES to confirm): "

if not "%confirm%"=="YES" (
    echo ❌ Aborted
    pause
    exit /b 1
)

echo 🗑️  Removing .git directory...
rmdir /s /q .git

echo 📝 Initializing new Git repository...
git init

echo ➕ Adding all files...
git add .

echo 💾 Creating initial commit...
git commit -m "Initial commit - cleaned history"

echo 🌿 Setting main branch...
git branch -M main

echo 🔗 Adding remote origin...
git remote add origin https://github.com/LeonLicher/kickbase-budget-checker.git

echo ⬆️  Force pushing to GitHub (this will overwrite all history)...
git push -f origin main

echo.
echo ✅ Git history completely cleaned!
echo 🔒 All previous commits with passwords have been removed
echo 📝 Repository now has a clean history starting from this commit
echo.
echo 🔑 Next steps:
echo 1. Verify your .env file doesn't contain the old password
echo 2. Make sure GitHub Secrets are updated with new credentials
echo 3. Test the application to ensure everything still works
echo.
pause