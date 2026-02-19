const path = require('path');
const { app } = require('electron');

// Đường dẫn tuyệt đối tới thư mục dự án
const projectRoot = 'C:\\Users\\DELL GAMEMING\\realtime-speech-translation';
const electronPath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
const mainScript = path.join(projectRoot, 'main.js');

// Tạo file .reg để đăng ký protocol
const fs = require('fs');

const regContent = `Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\\cyanos]
@="URL:CyanOS Protocol"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\\cyanos\\shell]

[HKEY_CLASSES_ROOT\\cyanos\\shell\\open]

[HKEY_CLASSES_ROOT\\cyanos\\shell\\open\\command]
@="\\"${electronPath.replace(/\\/g, '\\\\')}\\" \\"${mainScript.replace(/\\/g, '\\\\')}\\" \\"%1\\""
`;

const regFile = path.join(projectRoot, 'register-cyanos.reg');
fs.writeFileSync(regFile, regContent);

console.log('Created registry file at:', regFile);
console.log('Please double-click this file to register the protocol, or run: reg import register-cyanos.reg');

// Tự động chạy lệnh import nếu có thể (yêu cầu quyền admin)
const { exec } = require('child_process');
exec(`reg import "${regFile}"`, (error, stdout, stderr) => {
    if (error) {
        console.error('Error importing registry:', error);
        console.log('PLEASE RUN THIS COMMAND AS ADMIN MANUALLY: reg import "' + regFile + '"');
        return;
    }
    console.log('Registry imported successfully!');
});
